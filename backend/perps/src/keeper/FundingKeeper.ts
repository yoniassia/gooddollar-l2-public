/**
 * Funding Rate Keeper
 *
 * Calculates and submits funding rate updates every hour.
 * Funding mechanism keeps mark price anchored to index price:
 * - If longs > shorts (mark > index), longs pay shorts
 * - If shorts > longs (mark < index), shorts pay longs
 *
 * Formula: funding_rate = (mark_price - index_price) / index_price * (1/24)
 * Capped at ±0.1% per hour (±2.4% per day)
 */

import BigNumber from 'bignumber.js';
import pino from 'pino';
import { OracleAggregator } from '../feeds/OracleAggregator';
import { ContractInteraction } from '../contracts/ContractInteraction';
import { FundingRate } from '../orderbook/types';

const logger = pino({ name: 'funding-keeper' });

export class FundingKeeper {
  private oracle: OracleAggregator;
  private contracts: ContractInteraction;
  private markets: string[];
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  private latestRates: Map<string, FundingRate> = new Map();
  private rateHistory: Map<string, FundingRate[]> = new Map();
  private readonly maxHistory = 168; // 7 days of hourly rates

  // Config
  private readonly FUNDING_INTERVAL_MS = 3600_000; // 1 hour
  private readonly MAX_RATE = new BigNumber('0.001'); // 0.1% per hour
  private readonly RATE_MULTIPLIER = new BigNumber(1).div(24); // 1/24 per hour

  private stats = {
    updatesSubmitted: 0,
    lastUpdateTime: 0,
  };

  constructor(
    oracle: OracleAggregator,
    contracts: ContractInteraction,
    markets: string[],
  ) {
    this.oracle = oracle;
    this.contracts = contracts;
    this.markets = markets;
  }

  /**
   * Start the funding rate keeper.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Calculate initial rates immediately
    this.updateAllRates().catch(err => {
      logger.error({ err }, 'Initial funding rate update failed');
    });

    // Then update every hour
    this.interval = setInterval(() => {
      this.updateAllRates().catch(err => {
        logger.error({ err }, 'Funding rate update failed');
      });
    }, this.FUNDING_INTERVAL_MS);

    logger.info({ markets: this.markets }, 'Funding keeper started');
  }

  /**
   * Stop the keeper.
   */
  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info({ stats: this.stats }, 'Funding keeper stopped');
  }

  /**
   * Get current funding rate for a market.
   */
  getFundingRate(market: string): FundingRate | null {
    return this.latestRates.get(market) ?? null;
  }

  /**
   * Get funding rate history for a market.
   */
  getFundingHistory(market: string, limit: number = 24): FundingRate[] {
    const history = this.rateHistory.get(market) ?? [];
    return history.slice(-limit);
  }

  /**
   * Get predicted next funding rate based on current prices.
   */
  getPredictedRate(market: string): string | null {
    const oraclePrice = this.oracle.getPrice(market);
    if (!oraclePrice) return null;
    return oraclePrice.fundingRate;
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      ...this.stats,
      marketsTracked: this.markets.length,
      currentRates: Object.fromEntries(
        this.markets.map(m => [m, this.latestRates.get(m)?.rate ?? 'N/A'])
      ),
    };
  }

  // --- Private ---

  private async updateAllRates(): Promise<void> {
    const now = Date.now();
    const nextFunding = now + this.FUNDING_INTERVAL_MS;

    for (const market of this.markets) {
      try {
        const oraclePrice = this.oracle.getPrice(market);
        if (!oraclePrice || oraclePrice.stale) {
          logger.warn({ market }, 'Skipping funding update — stale oracle');
          continue;
        }

        const markPrice = new BigNumber(oraclePrice.markPrice);
        const indexPrice = new BigNumber(oraclePrice.indexPrice);

        if (indexPrice.eq(0)) {
          logger.warn({ market }, 'Skipping funding update — zero index price');
          continue;
        }

        // Calculate funding rate
        let rate = markPrice.minus(indexPrice)
          .div(indexPrice)
          .times(this.RATE_MULTIPLIER);

        // Cap at max rate
        if (rate.abs().gt(this.MAX_RATE)) {
          rate = rate.gt(0) ? this.MAX_RATE : this.MAX_RATE.negated();
        }

        const fundingRate: FundingRate = {
          market,
          rate: rate.toString(),
          markPrice: markPrice.toString(),
          indexPrice: indexPrice.toString(),
          nextFundingTime: nextFunding,
          timestamp: now,
        };

        // Store
        this.latestRates.set(market, fundingRate);
        if (!this.rateHistory.has(market)) {
          this.rateHistory.set(market, []);
        }
        const history = this.rateHistory.get(market)!;
        history.push(fundingRate);
        if (history.length > this.maxHistory) {
          history.splice(0, history.length - this.maxHistory);
        }

        // Submit to chain
        await this.contracts.updateFundingRate(
          market,
          rate.toString(),
          markPrice.toString(),
          indexPrice.toString(),
        );

        this.stats.updatesSubmitted++;
        this.stats.lastUpdateTime = now;

        logger.info({
          market,
          rate: rate.toString(),
          markPrice: markPrice.toString(),
          indexPrice: indexPrice.toString(),
          premium: markPrice.minus(indexPrice).div(indexPrice).times(100).toFixed(4) + '%',
        }, 'Funding rate updated');

      } catch (err) {
        logger.error({ err, market }, 'Failed to update funding rate');
      }
    }
  }
}
