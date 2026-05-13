import { HyperliquidRouter, ExternalRouteRequest } from '../HyperliquidRouter';
import { HyperliquidFeed } from '../../feeds/HyperliquidFeed';
import { Side } from '../../orderbook/types';

// Mock HyperliquidFeed
const createMockFeed = () => {
  const feed = {
    getMidPrice: jest.fn(),
    getBook: jest.fn(),
    fetchL2Book: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  } as any as HyperliquidFeed;
  return feed;
};

describe('HyperliquidRouter', () => {
  let router: HyperliquidRouter;
  let mockFeed: HyperliquidFeed;

  beforeEach(() => {
    mockFeed = createMockFeed();
    router = new HyperliquidRouter(mockFeed, { mode: 'simulation' });
  });

  describe('constructor', () => {
    it('defaults to simulation mode', () => {
      const stats = router.getStats();
      expect(stats.mode).toBe('simulation');
      expect(stats.totalRoutedOrders).toBe(0);
    });

    it('falls back to simulation if production keys missing', () => {
      const r = new HyperliquidRouter(mockFeed, { mode: 'production' });
      expect(r.getStats().mode).toBe('simulation');
    });
  });

  describe('routeOrder', () => {
    it('routes order using mid price when book unavailable', async () => {
      (mockFeed.getMidPrice as jest.Mock).mockReturnValue('65000.5');
      (mockFeed.getBook as jest.Mock).mockReturnValue(null);
      (mockFeed.fetchL2Book as jest.Mock).mockRejectedValue(new Error('no data'));

      const request: ExternalRouteRequest = {
        market: 'BTC-USD',
        side: Side.Buy,
        size: '0.1',
        userId: 'user1',
        orderId: 'order1',
      };

      const fill = await router.routeOrder(request);
      expect(fill).not.toBeNull();
      expect(fill!.market).toBe('BTC-USD');
      expect(fill!.side).toBe(Side.Buy);
      expect(fill!.size).toBe('0.1');
      expect(fill!.simulated).toBe(true);
      expect(fill!.source).toBe('hyperliquid');
      expect(parseFloat(fill!.price)).toBeGreaterThan(64000);
      expect(parseFloat(fill!.price)).toBeLessThan(66000);
      expect(parseFloat(fill!.fee)).toBeGreaterThan(0);
    });

    it('routes order using book data when available', async () => {
      (mockFeed.getBook as jest.Mock).mockReturnValue({
        coin: 'BTC',
        levels: [
          // bids
          [
            { px: '64990', sz: '1.0', n: 5 },
            { px: '64980', sz: '2.0', n: 3 },
          ],
          // asks
          [
            { px: '65010', sz: '0.5', n: 2 },
            { px: '65020', sz: '1.0', n: 4 },
          ],
        ],
        time: Date.now(),
      });

      const fill = await router.routeOrder({
        market: 'BTC-USD',
        side: Side.Buy,
        size: '0.3',
        userId: 'user2',
        orderId: 'order2',
      });

      expect(fill).not.toBeNull();
      expect(fill!.market).toBe('BTC-USD');
      // Should walk asks: 0.3 BTC mostly at 65010 level
      expect(parseFloat(fill!.price)).toBeGreaterThanOrEqual(65000);
    });

    it('returns null for unknown market', async () => {
      const fill = await router.routeOrder({
        market: 'UNKNOWN-USD',
        side: Side.Buy,
        size: '1.0',
        userId: 'user3',
        orderId: 'order3',
      });
      expect(fill).toBeNull();
    });

    it('updates stats after successful route', async () => {
      (mockFeed.getMidPrice as jest.Mock).mockReturnValue('3500.0');
      (mockFeed.getBook as jest.Mock).mockReturnValue(null);
      (mockFeed.fetchL2Book as jest.Mock).mockRejectedValue(new Error('no data'));

      await router.routeOrder({
        market: 'ETH-USD',
        side: Side.Sell,
        size: '1.0',
        userId: 'user4',
        orderId: 'order4',
      });

      const stats = router.getStats();
      expect(stats.totalRoutedOrders).toBe(1);
      expect(stats.totalFills).toBe(1);
      expect(parseFloat(stats.totalRoutedVolume)).toBeGreaterThan(0);
      expect(parseFloat(stats.totalFeesCollected)).toBeGreaterThan(0);
      expect(stats.lastRouteTimestamp).not.toBeNull();
    });

    it('emits fill event', async () => {
      (mockFeed.getMidPrice as jest.Mock).mockReturnValue('150.0');
      (mockFeed.getBook as jest.Mock).mockReturnValue(null);
      (mockFeed.fetchL2Book as jest.Mock).mockRejectedValue(new Error('no data'));

      const fillPromise = new Promise<any>(resolve => {
        router.on('fill', resolve);
      });

      router.routeOrder({
        market: 'SOL-USD',
        side: Side.Buy,
        size: '10',
        userId: 'user5',
        orderId: 'order5',
      });

      const fill = await fillPromise;
      expect(fill.market).toBe('SOL-USD');
      expect(fill.source).toBe('hyperliquid');
    });
  });

  describe('getExternalLiquidity', () => {
    it('returns zero for unknown market', () => {
      const result = router.getExternalLiquidity('UNKNOWN-USD', Side.Buy);
      expect(result.levels).toBe(0);
      expect(result.totalSize).toBe('0');
      expect(result.bestPrice).toBeNull();
    });

    it('returns book depth when available', () => {
      (mockFeed.getBook as jest.Mock).mockReturnValue({
        coin: 'ETH',
        levels: [
          [{ px: '3490', sz: '10', n: 5 }, { px: '3480', sz: '20', n: 8 }],
          [{ px: '3510', sz: '5', n: 2 }, { px: '3520', sz: '15', n: 6 }],
        ],
        time: Date.now(),
      });

      const buyLiquidity = router.getExternalLiquidity('ETH-USD', Side.Buy);
      expect(buyLiquidity.levels).toBe(2);
      expect(buyLiquidity.totalSize).toBe('20'); // 5 + 15 asks
      expect(buyLiquidity.bestPrice).toBe('3510');

      const sellLiquidity = router.getExternalLiquidity('ETH-USD', Side.Sell);
      expect(sellLiquidity.levels).toBe(2);
      expect(sellLiquidity.totalSize).toBe('30'); // 10 + 20 bids
      expect(sellLiquidity.bestPrice).toBe('3490');
    });
  });

  describe('getRecentFills', () => {
    it('returns empty initially', () => {
      expect(router.getRecentFills()).toEqual([]);
    });

    it('returns fills after routing', async () => {
      (mockFeed.getMidPrice as jest.Mock).mockReturnValue('65000');
      (mockFeed.getBook as jest.Mock).mockReturnValue(null);
      (mockFeed.fetchL2Book as jest.Mock).mockRejectedValue(new Error('no data'));

      await router.routeOrder({
        market: 'BTC-USD',
        side: Side.Buy,
        size: '0.5',
        userId: 'user6',
        orderId: 'order6',
      });

      const fills = router.getRecentFills();
      expect(fills.length).toBe(1);
      expect(fills[0].userId).toBe('user6');
    });
  });

  describe('getUserFills', () => {
    it('filters by user', async () => {
      (mockFeed.getMidPrice as jest.Mock).mockReturnValue('65000');
      (mockFeed.getBook as jest.Mock).mockReturnValue(null);
      (mockFeed.fetchL2Book as jest.Mock).mockRejectedValue(new Error('no data'));

      await router.routeOrder({
        market: 'BTC-USD', side: Side.Buy, size: '0.1',
        userId: 'alice', orderId: 'o1',
      });
      await router.routeOrder({
        market: 'BTC-USD', side: Side.Sell, size: '0.2',
        userId: 'bob', orderId: 'o2',
      });

      expect(router.getUserFills('alice').length).toBe(1);
      expect(router.getUserFills('bob').length).toBe(1);
      expect(router.getUserFills('charlie').length).toBe(0);
    });
  });
});
