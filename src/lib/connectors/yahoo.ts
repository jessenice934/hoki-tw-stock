// ============================================================
// Yahoo Finance connector
// Owns: historical OHLC prices, .TW / .TWO suffix resolution
// ============================================================
import { normalizeTwTicker } from './types';

export interface HistoricalPrice {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── .TW / .TWO suffix detection (24h TTL) ────────────────────
const suffixCache: Record<string, { sym: string; timestamp: number }> = {};
const SUFFIX_TTL = 24 * 60 * 60 * 1000;

export async function resolveYahooSymbol(ticker: string): Promise<string> {
  const base = normalizeTwTicker(ticker);
  if (!base.endsWith('.TW')) return base;

  const cached = suffixCache[base];
  if (cached && Date.now() - cached.timestamp < SUFFIX_TTL) return cached.sym;

  try {
    const resp = await fetch(`/api/yahoo/v8/finance/chart/${encodeURIComponent(base)}?interval=1d&range=1d`);
    if (resp.ok) {
      const json = await resp.json();
      if (json?.chart?.result?.[0]?.meta?.symbol) {
        suffixCache[base] = { sym: base, timestamp: Date.now() };
        return base;
      }
    }
  } catch { /* fall through */ }

  const two = base.replace(/\.TW$/, '.TWO');
  suffixCache[base] = { sym: two, timestamp: Date.now() };
  return two;
}

// ── Historical prices (30-min TTL) ───────────────────────────
const historyCache: Record<string, { data: HistoricalPrice[]; timestamp: number }> = {};
const HISTORY_CACHE_TTL = 30 * 60 * 1000;

function daysToRange(days: number): string {
  if (days <= 5) return '5d';
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 180) return '6mo';
  if (days <= 365) return '1y';
  return '2y';
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isCachedHistoricalPrices(ticker: string, days: number): boolean {
  const yahooSym = normalizeTwTicker(ticker);
  const key = `${yahooSym}:${days}`;
  const cached = historyCache[key];
  return !!(cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL);
}

export async function fetchHistoricalPrices(
  ticker: string,
  days: number = 60,
): Promise<HistoricalPrice[]> {
  const yahooSym = await resolveYahooSymbol(ticker);
  const key = `${yahooSym}:${days}`;
  const cached = historyCache[key];
  if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
    return cached.data;
  }

  const range = daysToRange(days);
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=${range}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Yahoo Finance request failed: ${resp.status}`);

  const json = await resp.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No chart data returned from Yahoo Finance');

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens:   (number | null)[] = quote.open   ?? [];
  const highs:   (number | null)[] = quote.high   ?? [];
  const lows:    (number | null)[] = quote.low    ?? [];
  const closes:  (number | null)[] = quote.close  ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const prices: HistoricalPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i]; const h = highs[i]; const l = lows[i]; const c = closes[i]; const v = volumes[i];
    if (o == null || h == null || l == null || c == null) continue;
    prices.push({
      date: formatDate(new Date(timestamps[i] * 1000)),
      open: o, high: h, low: l, close: c, volume: v ?? 0,
    });
  }

  historyCache[key] = { data: prices, timestamp: Date.now() };
  return prices;
}
