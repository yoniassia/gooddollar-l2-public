/**
 * SQLite storage layer for the GoodDollar L2 indexer.
 * Uses better-sqlite3 for synchronous, fast, embedded storage.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface IndexedEvent {
  id?: number;
  block_number: number;
  tx_hash: string;
  log_index: number;
  contract_name: string;
  contract_address: string;
  protocol: string;
  event_name: string;
  args_json: string; // JSON-serialized event args
  timestamp: number; // block timestamp
}

export interface IndexerState {
  last_block: number;
  last_updated: number;
}

export class IndexerDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_number INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        contract_name TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        protocol TEXT NOT NULL,
        event_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(tx_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS idx_events_protocol ON events(protocol);
      CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number);
      CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_address);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TABLE IF NOT EXISTS indexer_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS protocol_stats (
        protocol TEXT PRIMARY KEY,
        total_events INTEGER DEFAULT 0,
        last_event_block INTEGER DEFAULT 0,
        last_updated INTEGER DEFAULT 0
      );
    `);

    // Seed state if needed
    const row = this.db.prepare("SELECT value FROM indexer_state WHERE key = 'last_block'").get() as any;
    if (!row) {
      this.db.prepare("INSERT INTO indexer_state (key, value) VALUES ('last_block', '0')").run();
    }
  }

  getLastBlock(): number {
    const row = this.db.prepare("SELECT value FROM indexer_state WHERE key = 'last_block'").get() as any;
    return row ? parseInt(row.value, 10) : 0;
  }

  setLastBlock(block: number) {
    this.db.prepare("UPDATE indexer_state SET value = ? WHERE key = 'last_block'").run(block.toString());
  }

  insertEvents(events: IndexedEvent[]) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO events (block_number, tx_hash, log_index, contract_name, contract_address, protocol, event_name, args_json, timestamp)
      VALUES (@block_number, @tx_hash, @log_index, @contract_name, @contract_address, @protocol, @event_name, @args_json, @timestamp)
    `);

    const updateStats = this.db.prepare(`
      INSERT INTO protocol_stats (protocol, total_events, last_event_block, last_updated)
      VALUES (@protocol, 1, @block, @now)
      ON CONFLICT(protocol) DO UPDATE SET
        total_events = total_events + 1,
        last_event_block = MAX(last_event_block, @block),
        last_updated = @now
    `);

    const tx = this.db.transaction((evts: IndexedEvent[]) => {
      const now = Date.now();
      for (const evt of evts) {
        insert.run(evt);
        updateStats.run({ protocol: evt.protocol, block: evt.block_number, now });
      }
    });

    tx(events);
  }

  // ── Query methods ─────────────────────────────────────────────────
  queryEvents(opts: {
    protocol?: string;
    event_name?: string;
    contract_address?: string;
    from_block?: number;
    to_block?: number;
    limit?: number;
    offset?: number;
  }): IndexedEvent[] {
    const conditions: string[] = [];
    const params: any = {};

    if (opts.protocol) { conditions.push("protocol = @protocol"); params.protocol = opts.protocol; }
    if (opts.event_name) { conditions.push("event_name = @event_name"); params.event_name = opts.event_name; }
    if (opts.contract_address) { conditions.push("LOWER(contract_address) = LOWER(@contract_address)"); params.contract_address = opts.contract_address; }
    if (opts.from_block !== undefined) { conditions.push("block_number >= @from_block"); params.from_block = opts.from_block; }
    if (opts.to_block !== undefined) { conditions.push("block_number <= @to_block"); params.to_block = opts.to_block; }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    return this.db.prepare(
      `SELECT * FROM events ${where} ORDER BY block_number DESC, log_index DESC LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset }) as IndexedEvent[];
  }

  getProtocolStats(): any[] {
    return this.db.prepare("SELECT * FROM protocol_stats ORDER BY protocol").all();
  }

  getOverview(): any {
    const totalEvents = (this.db.prepare("SELECT COUNT(*) as cnt FROM events").get() as any).cnt;
    const lastBlock = this.getLastBlock();
    const protocols = this.getProtocolStats();
    const eventCounts = this.db.prepare(
      "SELECT event_name, COUNT(*) as cnt FROM events GROUP BY event_name ORDER BY cnt DESC LIMIT 20"
    ).all();

    return { totalEvents, lastBlock, protocols, topEvents: eventCounts };
  }

  getUniqueUsers(protocol?: string): number {
    // Extract unique addresses from args_json (first indexed address param)
    const where = protocol ? "WHERE protocol = ?" : "";
    const rows = this.db.prepare(
      `SELECT DISTINCT json_extract(args_json, '$.user') as addr FROM events ${where}
       UNION
       SELECT DISTINCT json_extract(args_json, '$.trader') as addr FROM events ${where}
       UNION
       SELECT DISTINCT json_extract(args_json, '$.owner') as addr FROM events ${where}
       UNION
       SELECT DISTINCT json_extract(args_json, '$.from') as addr FROM events ${where}`
    ).all(...(protocol ? [protocol, protocol, protocol, protocol] : [])) as any[];
    return rows.filter(r => r.addr != null && r.addr !== "0x0000000000000000000000000000000000000000").length;
  }

  close() {
    this.db.close();
  }
}
