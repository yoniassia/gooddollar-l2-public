import { IndexerDB, IndexedEvent } from "../db";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(__dirname, "../../data/test.db");

describe("IndexerDB", () => {
  let db: IndexerDB;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new IndexerDB(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("tracks last block", () => {
    expect(db.getLastBlock()).toBe(0);
    db.setLastBlock(42);
    expect(db.getLastBlock()).toBe(42);
  });

  it("inserts and queries events", () => {
    const events: IndexedEvent[] = [
      {
        block_number: 10,
        tx_hash: "0xabc",
        log_index: 0,
        contract_name: "PerpEngine",
        contract_address: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
        protocol: "perps",
        event_name: "PositionOpened",
        args_json: JSON.stringify({ trader: "0xuser1", marketId: "1", isLong: true, size: "1000" }),
        timestamp: 1700000000,
      },
      {
        block_number: 11,
        tx_hash: "0xdef",
        log_index: 0,
        contract_name: "MarketFactory",
        contract_address: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
        protocol: "predict",
        event_name: "MarketCreated",
        args_json: JSON.stringify({ marketId: "1", question: "Will ETH hit 5k?", endTime: "1700001000" }),
        timestamp: 1700000100,
      },
    ];

    db.insertEvents(events);

    // Query all
    const all = db.queryEvents({});
    expect(all).toHaveLength(2);

    // Query by protocol
    const perps = db.queryEvents({ protocol: "perps" });
    expect(perps).toHaveLength(1);
    expect(perps[0].event_name).toBe("PositionOpened");

    // Query by event name
    const created = db.queryEvents({ event_name: "MarketCreated" });
    expect(created).toHaveLength(1);
  });

  it("returns overview stats", () => {
    db.insertEvents([
      {
        block_number: 1,
        tx_hash: "0x111",
        log_index: 0,
        contract_name: "Test",
        contract_address: "0x000",
        protocol: "core",
        event_name: "Transfer",
        args_json: "{}",
        timestamp: 1700000000,
      },
    ]);

    const overview = db.getOverview();
    expect(overview.totalEvents).toBe(1);
    expect(overview.protocols).toHaveLength(1);
    expect(overview.protocols[0].protocol).toBe("core");
  });

  it("deduplicates by tx_hash + log_index", () => {
    const evt: IndexedEvent = {
      block_number: 5,
      tx_hash: "0xdup",
      log_index: 0,
      contract_name: "Test",
      contract_address: "0x000",
      protocol: "core",
      event_name: "Transfer",
      args_json: "{}",
      timestamp: 1700000000,
    };

    db.insertEvents([evt]);
    db.insertEvents([evt]); // should not throw or duplicate

    const all = db.queryEvents({});
    expect(all).toHaveLength(1);
  });
});
