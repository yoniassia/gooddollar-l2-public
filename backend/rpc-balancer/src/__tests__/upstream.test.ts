import { UpstreamManager } from '../upstream';
import { UpstreamConfig, JsonRpcRequest } from '../types';

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const makeConfig = (overrides: Partial<UpstreamConfig> = {}): UpstreamConfig => ({
  name: 'test-node',
  url: 'http://localhost:8545',
  rateLimit: 0,
  weight: 10,
  readOnly: false,
  maxConcurrent: 100,
  ...overrides,
});

const ethChainIdReq: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 };
const sendTxReq: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: ['0x...'], id: 2 };

describe('UpstreamManager', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('initializes all upstreams as healthy', () => {
    const mgr = new UpstreamManager([makeConfig({ name: 'a' }), makeConfig({ name: 'b' })]);
    const states = mgr.getStates();
    expect(states).toHaveLength(2);
    expect(states.every(s => s.healthy)).toBe(true);
  });

  it('selects upstream with lowest weighted load', () => {
    const mgr = new UpstreamManager([
      makeConfig({ name: 'heavy', weight: 1 }),
      makeConfig({ name: 'light', weight: 10 }),
    ]);
    // Give heavy some load so light wins on score
    const heavy = mgr.getStates().find(s => s.config.name === 'heavy')!;
    heavy.requestsInFlight = 1; // score: 1/1 = 1
    // light: 0/10 = 0  →  light wins
    const selected = mgr.select(ethChainIdReq);
    expect(selected?.config.name).toBe('light');
  });

  it('excludes read-only upstreams for write methods', () => {
    const mgr = new UpstreamManager([
      makeConfig({ name: 'reader', readOnly: true, weight: 100 }),
      makeConfig({ name: 'writer', readOnly: false, weight: 1 }),
    ]);
    const selected = mgr.select(sendTxReq);
    expect(selected?.config.name).toBe('writer');
  });

  it('allows read-only upstreams for read methods', () => {
    const mgr = new UpstreamManager([
      makeConfig({ name: 'reader', readOnly: true, weight: 100 }),
      makeConfig({ name: 'writer', readOnly: false, weight: 1 }),
    ]);
    const selected = mgr.select(ethChainIdReq);
    // reader has higher weight so it wins
    expect(selected?.config.name).toBe('reader');
  });

  it('forwards request and records latency', async () => {
    const mgr = new UpstreamManager([makeConfig({ name: 'node1' })]);
    const state = mgr.getStates()[0];

    mockFetch.mockResolvedValueOnce({
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0xa455' }),
    });

    const resp = await mgr.forward(state, ethChainIdReq);
    expect(resp.result).toBe('0xa455');
    expect(state.requestsTotal).toBe(1);
    expect(state.latencyWindow.length).toBe(1);
    expect(state.requestsInFlight).toBe(0);
  });

  it('marks upstream unhealthy after consecutive failures', async () => {
    const mgr = new UpstreamManager([makeConfig({ name: 'flaky' })]);
    const state = mgr.getStates()[0];

    mockFetch.mockRejectedValue(new Error('connection refused'));

    for (let i = 0; i < 3; i++) {
      try { await mgr.forward(state, ethChainIdReq); } catch {}
    }

    expect(state.healthy).toBe(false);
    expect(state.consecutiveFailures).toBe(3);
  });

  it('returns null when no healthy upstream available', () => {
    const mgr = new UpstreamManager([makeConfig({ name: 'dead' })]);
    const state = mgr.getStates()[0];
    state.healthy = false;

    const selected = mgr.select(ethChainIdReq);
    expect(selected).toBeNull();
  });

  it('respects maxConcurrent limit', () => {
    const mgr = new UpstreamManager([makeConfig({ name: 'limited', maxConcurrent: 2 })]);
    const state = mgr.getStates()[0];
    state.requestsInFlight = 2;

    const selected = mgr.select(ethChainIdReq);
    expect(selected).toBeNull();
  });

  it('handles batch of multiple upstreams with weighted selection', () => {
    const mgr = new UpstreamManager([
      makeConfig({ name: 'fast', weight: 10 }),
      makeConfig({ name: 'slow', weight: 1 }),
    ]);

    // Simulate fast having some load
    const fast = mgr.getStates().find(s => s.config.name === 'fast')!;
    fast.requestsInFlight = 5;

    // slow should win: 0/1=0 vs 5/10=0.5
    const selected = mgr.select(ethChainIdReq);
    expect(selected?.config.name).toBe('slow');
  });
});
