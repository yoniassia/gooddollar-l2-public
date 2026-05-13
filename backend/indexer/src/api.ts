/**
 * REST API for querying indexed events.
 *
 * Endpoints:
 *   GET /api/overview                — dashboard: total events, per-protocol stats
 *   GET /api/events                  — query events with filters
 *   GET /api/events/:protocol        — events for a specific protocol
 *   GET /api/stats                   — per-protocol statistics
 *   GET /api/stats/:protocol         — stats for one protocol
 *   GET /api/health                  — healthcheck
 */
import express, { Request, Response } from "express";
import { IndexerDB } from "./db";

export function createAPI(db: IndexerDB, port: number): express.Application {
  const app = express();

  // CORS for frontend
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    next();
  });

  // ── Overview / Dashboard ──────────────────────────────────────────
  app.get("/api/overview", (_req: Request, res: Response) => {
    try {
      const overview = db.getOverview();
      res.json({ ok: true, data: overview });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Query events ──────────────────────────────────────────────────
  app.get("/api/events", (req: Request, res: Response) => {
    try {
      const events = db.queryEvents({
        protocol: req.query.protocol as string,
        event_name: req.query.event as string,
        contract_address: req.query.contract as string,
        from_block: req.query.from_block ? parseInt(req.query.from_block as string) : undefined,
        to_block: req.query.to_block ? parseInt(req.query.to_block as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });

      // Parse args_json for convenience
      const parsed = events.map((e) => ({
        ...e,
        args: JSON.parse(e.args_json),
      }));

      res.json({ ok: true, count: parsed.length, data: parsed });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Events by protocol ────────────────────────────────────────────
  app.get("/api/events/:protocol", (req: Request, res: Response) => {
    try {
      const events = db.queryEvents({
        protocol: req.params.protocol,
        event_name: req.query.event as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });

      const parsed = events.map((e) => ({
        ...e,
        args: JSON.parse(e.args_json),
      }));

      res.json({ ok: true, protocol: req.params.protocol, count: parsed.length, data: parsed });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Protocol stats ────────────────────────────────────────────────
  app.get("/api/stats", (_req: Request, res: Response) => {
    try {
      const stats = db.getProtocolStats();
      res.json({ ok: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/stats/:protocol", (req: Request, res: Response) => {
    try {
      const events = db.queryEvents({ protocol: req.params.protocol, limit: 1 });
      const stats = db.getProtocolStats().find((s: any) => s.protocol === req.params.protocol);
      const users = db.getUniqueUsers(req.params.protocol);
      res.json({
        ok: true,
        data: {
          ...(stats || { protocol: req.params.protocol, total_events: 0 }),
          unique_users: users,
          latest_event: events[0] ? { ...events[0], args: JSON.parse(events[0].args_json) } : null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Health ────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    const lastBlock = db.getLastBlock();
    res.json({
      ok: true,
      service: "gooddollar-indexer",
      version: "0.1.0",
      last_indexed_block: lastBlock,
      uptime: process.uptime(),
    });
  });

  // Start listening
  app.listen(port, () => {
    console.log(`[API] GoodDollar L2 Indexer API listening on port ${port}`);
  });

  return app;
}
