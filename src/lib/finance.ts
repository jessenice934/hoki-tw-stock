// ============================================================
// HOKI Finance — Pure TypeScript financial calculation library
// 台股版：Yahoo Finance ticker 自動補 .TW 後綴
// ============================================================

/**
 * Normalize a user-entered ticker to Yahoo Finance Taiwan format.
 *  - '2330'    → '2330.TW'
 *  - '0050'    → '0050.TW'
 *  - '^TWII'   → '^TWII'    (台灣加權指數)
 *  - '2330.TW' → '2330.TW'  (already qualified)
 *  - 'AAPL'    → 'AAPL'     (fallback for non-numeric)
 */
export function normalizeTwTicker(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (!t) return t;
  if (t.startsWith('^')) return t;
  if (t.includes('.')) return t;
  if (/^\d{4,6}[A-Z]?$/.test(t)) return `${t}.TW`;
  return t;
}

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface HistoricalPrice {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EntryTimingResult {
  score: number; // 0-100, higher = better time to buy
  signals: {
    name: string;
    value: string;
    signal: 'buy' | 'sell' | 'neutral';
    weight: number;
  }[];
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

export interface MonteCarloResult {
  simulations: number[][]; // Array of simulation paths (each is array of prices)
  percentiles: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  finalPriceDistribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p5: number;
    p25: number;
    p75: number;
    p95: number;
  };
  probabilityAboveTarget: number;
  probabilityBelowStop: number;
  var95: number; // Value at Risk: worst loss at 95% confidence
  dates: string[];
}

export interface PositionSizeResult {
  shares: number;
  totalCost: number;
  maxLoss: number;
  riskPercent: number;
  rewardRiskRatio: number;
}

export interface AccuracyResult {
  predictedDirection: 'up' | 'down';
  actualDirection: 'up' | 'down';
  predictedTarget: number;
  actualFinalPrice: number;
  predictedChange: number; // percentage
  actualChange: number; // percentage
  directionCorrect: boolean;
  priceAccuracy: number; // 0-100, how close was the prediction
  maxDrawdownDuringPeriod: number;
  maxGainDuringPeriod: number;
}

// ────────────────────────────────────────────────────────────
// In-memory cache (30 min TTL)
// ────────────────────────────────────────────────────────────

const historyCache: Record<string, { data: HistoricalPrice[]; timestamp: number }> = {};
const HISTORY_CACHE_TTL = 30 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function daysToRange(days: number): string {
  if (days <= 5) return '5d';
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 180) return '6mo';
  if (days <= 365) return '1y';
  return '2y';
}

/** Box-Muller transform: returns a standard-normal random number */
function normalRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Get the percentile value from a sorted array */
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Format a Date to YYYY-MM-DD */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add business days (Mon-Fri) to a date */
function addBusinessDays(start: Date, count: number): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  let added = 0;
  while (added < count) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(new Date(current));
      added++;
    }
  }
  return dates;
}

// ────────────────────────────────────────────────────────────
// 1. Historical Data Fetching
// ────────────────────────────────────────────────────────────

export async function fetchHistoricalPrices(
  ticker: string,
  days: number = 60,
): Promise<HistoricalPrice[]> {
  const yahooSym = normalizeTwTicker(ticker);
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
  const opens: (number | null)[] = quote.open ?? [];
  const highs: (number | null)[] = quote.high ?? [];
  const lows: (number | null)[] = quote.low ?? [];
  const closes: (number | null)[] = quote.close ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const prices: HistoricalPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    if (o == null || h == null || l == null || c == null) continue;
    prices.push({
      date: formatDate(new Date(timestamps[i] * 1000)),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
    });
  }

  historyCache[key] = { data: prices, timestamp: Date.now() };
  return prices;
}

// ────────────────────────────────────────────────────────────
// Ticker → 中文公司名（從 Yahoo Finance meta，避免 AI 幻覺）
// ────────────────────────────────────────────────────────────

const nameCache: Record<string, { name: string; timestamp: number }> = {};
const NAME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function fetchTickerName(ticker: string): Promise<string | null> {
  const yahooSym = normalizeTwTicker(ticker);
  const cached = nameCache[yahooSym];
  if (cached && Date.now() - cached.timestamp < NAME_CACHE_TTL) {
    return cached.name;
  }

  // 1) 優先打 TWSE MIS API 拿中文名（tse=上市，otc=上櫃同時查）
  const numeric = ticker.replace(/[^0-9]/g, '');
  if (numeric.length >= 4) {
    try {
      const exCh = `tse_${numeric}.tw|otc_${numeric}.tw`;
      const resp = await fetch(`/api/twse?ex_ch=${encodeURIComponent(exCh)}`);
      if (resp.ok) {
        const json = await resp.json();
        const item = json?.msgArray?.[0];
        const cn: string | undefined = item?.n; // 中文簡稱
        if (cn) {
          nameCache[yahooSym] = { name: cn, timestamp: Date.now() };
          return cn;
        }
      }
    } catch {
      // fall through to Yahoo fallback
    }
  }

  // 2) Fallback：Yahoo（多半英文，但比沒名字好）
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const name: string | undefined = meta?.longName || meta?.shortName;
    if (!name) return null;
    nameCache[yahooSym] = { name, timestamp: Date.now() };
    return name;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// News Headlines (Google News RSS via /api/news proxy)
// ────────────────────────────────────────────────────────────

const newsCache: Record<string, { headlines: string[]; timestamp: number }> = {};
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function fetchNewsHeadlines(ticker: string, name: string | null): Promise<string[]> {
  const key = ticker.toUpperCase();
  const cached = newsCache[key];
  if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL) return cached.headlines;

  const query = name ? `${name} ${ticker} 股票` : `${ticker} 台股`;
  try {
    const resp = await fetch(`/api/news?q=${encodeURIComponent(query)}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    const headlines: string[] = json?.titles ?? [];
    if (headlines.length > 0) newsCache[key] = { headlines, timestamp: Date.now() };
    return headlines;
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────
// 2. Volatility Metrics
// ────────────────────────────────────────────────────────────

/** Average True Range — measures daily price range volatility */
export function calculateATR(prices: HistoricalPrice[], period: number = 14): number {
  if (prices.length < period + 1) {
    throw new Error(`Need at least ${period + 1} prices to calculate ATR(${period})`);
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const high = prices[i].high;
    const low = prices[i].low;
    const prevClose = prices[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  // Use Wilder's smoothing: first ATR is simple average, then exponential
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

/** Annualized historical volatility (std dev of daily log returns) */
export function calculateHistoricalVolatility(
  prices: HistoricalPrice[],
  period: number = 30,
): number {
  const slice = prices.slice(-period - 1);
  if (slice.length < 2) {
    throw new Error('Not enough price data to calculate volatility');
  }

  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i].close / slice[i - 1].close));
  }

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  // Annualize: ~252 trading days
  return dailyVol * Math.sqrt(252);
}

/** Beta relative to a benchmark (e.g. ^TWII). Covariance / Variance of benchmark */
export function calculateBeta(
  stockPrices: HistoricalPrice[],
  benchmarkPrices: HistoricalPrice[],
): number {
  // Align dates
  const benchDates = new Set(benchmarkPrices.map((p) => p.date));
  const stockMap = new Map(stockPrices.map((p) => [p.date, p]));
  const commonDates = benchmarkPrices
    .filter((p) => stockMap.has(p.date))
    .map((p) => p.date);

  if (commonDates.length < 2) {
    throw new Error('Not enough overlapping dates to calculate beta');
  }

  const stockReturns: number[] = [];
  const benchReturns: number[] = [];

  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1];
    const currDate = commonDates[i];
    const sp = stockMap.get(prevDate)!;
    const sc = stockMap.get(currDate)!;
    const bp = benchmarkPrices.find((p) => p.date === prevDate)!;
    const bc = benchmarkPrices.find((p) => p.date === currDate)!;
    stockReturns.push(sc.close / sp.close - 1);
    benchReturns.push(bc.close / bp.close - 1);
  }

  const meanS = stockReturns.reduce((s, v) => s + v, 0) / stockReturns.length;
  const meanB = benchReturns.reduce((s, v) => s + v, 0) / benchReturns.length;

  let cov = 0;
  let varB = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    const ds = stockReturns[i] - meanS;
    const db = benchReturns[i] - meanB;
    cov += ds * db;
    varB += db * db;
  }

  if (varB === 0) return 1; // fallback
  return cov / varB;
}

// ────────────────────────────────────────────────────────────
// 3. Technical Indicators
// ────────────────────────────────────────────────────────────

/** Relative Strength Index (0-100) */
export function calculateRSI(prices: HistoricalPrice[], period: number = 14): number {
  if (prices.length < period + 1) {
    throw new Error(`Need at least ${period + 1} prices to calculate RSI(${period})`);
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i].close - prices[i - 1].close);
  }

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Simple Moving Average — returns one SMA value per price from index period-1 onward */
export function calculateSMA(prices: HistoricalPrice[], period: number): number[] {
  if (prices.length < period) {
    throw new Error(`Need at least ${period} prices to calculate SMA(${period})`);
  }

  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i].close;
    if (i >= period) {
      sum -= prices[i - period].close;
    }
    if (i >= period - 1) {
      result.push(sum / period);
    }
  }
  return result;
}

/** Volume profile: compare recent 5-day avg volume to 20-day avg */
export function calculateVolumeProfile(
  prices: HistoricalPrice[],
): { avgVolume: number; recentVolume: number; volumeRatio: number } {
  if (prices.length < 20) {
    // Graceful fallback for limited data
    const avg = prices.reduce((s, p) => s + p.volume, 0) / prices.length;
    return { avgVolume: avg, recentVolume: avg, volumeRatio: 1 };
  }

  const last20 = prices.slice(-20);
  const last5 = prices.slice(-5);
  const avgVolume = last20.reduce((s, p) => s + p.volume, 0) / 20;
  const recentVolume = last5.reduce((s, p) => s + p.volume, 0) / 5;
  const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 1;

  return { avgVolume, recentVolume, volumeRatio };
}

/**
 * Granville's 8 Rules — classic trading framework based on price vs 200-day MA.
 * Requires ~220+ trading-day bars. Gracefully degrades if insufficient data.
 *
 * 4 Buy signals (MA rising or turning rising):
 *   1. Price crosses above flat/rising MA from below
 *   2. Price dips below rising MA briefly, returns above
 *   3. Price stays above rising MA, dips toward but doesn't break, rebounds
 *   4. Price far below declining MA (oversold rebound setup)
 *
 * 4 Sell signals (MA declining or turning declining):
 *   1. Price crosses below flat/declining MA from above
 *   2. Price pops above declining MA briefly, returns below
 *   3. Price stays below declining MA, rallies toward but doesn't break, rolls over
 *   4. Price far above rising MA (overbought pullback setup)
 */
export interface GranvilleResult {
  signal: 'buy' | 'sell' | 'neutral';
  rule: number | null; // 1–4 for buy, 1–4 for sell, null for neutral
  score: number; // 0–100, higher = more bullish
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  sma200: number;
  distancePct: number; // (price - MA) / MA, positive means price above MA
  maSlope: 'rising' | 'flat' | 'declining';
}

export function calculateGranville(
  prices: HistoricalPrice[],
  currentPrice: number,
): GranvilleResult {
  // Need at least ~220 bars to compute SMA200 + slope reference
  if (prices.length < 220) {
    return {
      signal: 'neutral',
      rule: null,
      score: 50,
      direction: 'Neutral',
      sma200: 0,
      distancePct: 0,
      maSlope: 'flat',
    };
  }

  const sma200Series = calculateSMA(prices, 200);
  const latestMA = sma200Series[sma200Series.length - 1];
  // Use MA from 20 trading days ago for slope reference
  const lookback = Math.min(20, sma200Series.length - 1);
  const prevMA = sma200Series[sma200Series.length - 1 - lookback];

  const maChangePct = prevMA > 0 ? (latestMA - prevMA) / prevMA : 0;
  const maSlope: 'rising' | 'flat' | 'declining' =
    maChangePct > 0.01 ? 'rising' : maChangePct < -0.01 ? 'declining' : 'flat';

  // Align recent closes with their corresponding SMA200 values
  // sma200Series[i] corresponds to prices[i + 199]
  const recentN = 10;
  const seriesLen = sma200Series.length;
  const recentCloses: number[] = [];
  const recentMAs: number[] = [];
  for (let i = Math.max(0, seriesLen - recentN); i < seriesLen; i++) {
    recentCloses.push(prices[i + 199].close);
    recentMAs.push(sma200Series[i]);
  }

  // Detect recent crossings
  let crossedAbove = false;
  let crossedBelow = false;
  for (let i = 1; i < recentCloses.length; i++) {
    if (recentCloses[i - 1] < recentMAs[i - 1] && recentCloses[i] >= recentMAs[i]) crossedAbove = true;
    if (recentCloses[i - 1] > recentMAs[i - 1] && recentCloses[i] <= recentMAs[i]) crossedBelow = true;
  }

  // Detect "dipped below then back above" within recent window
  const nowAbove = currentPrice >= latestMA;
  const nowBelow = currentPrice < latestMA;
  const dippedBelow = recentCloses.some((c, i) => c < recentMAs[i]);
  const poppedAbove = recentCloses.some((c, i) => c > recentMAs[i]);

  const distancePct = latestMA > 0 ? (currentPrice - latestMA) / latestMA : 0;

  // ── Rule matching (order matters: check strongest signals first) ──

  // Buy 1: MA rising/flat, price just crossed above
  if (crossedAbove && (maSlope === 'rising' || maSlope === 'flat') && nowAbove) {
    return { signal: 'buy', rule: 1, score: 85, direction: 'Bullish', sma200: latestMA, distancePct, maSlope };
  }

  // Sell 1: MA declining/flat, price just crossed below
  if (crossedBelow && (maSlope === 'declining' || maSlope === 'flat') && nowBelow) {
    return { signal: 'sell', rule: 1, score: 15, direction: 'Bearish', sma200: latestMA, distancePct, maSlope };
  }

  // Buy 2: MA rising, price currently above MA, recent dip below occurred
  if (maSlope === 'rising' && nowAbove && dippedBelow) {
    return { signal: 'buy', rule: 2, score: 75, direction: 'Bullish', sma200: latestMA, distancePct, maSlope };
  }

  // Sell 2: MA declining, price currently below MA, recent pop above occurred
  if (maSlope === 'declining' && nowBelow && poppedAbove) {
    return { signal: 'sell', rule: 2, score: 25, direction: 'Bearish', sma200: latestMA, distancePct, maSlope };
  }

  // Buy 3: MA rising, price near MA (within 3%) and above
  if (maSlope === 'rising' && nowAbove && distancePct >= 0 && distancePct < 0.03) {
    return { signal: 'buy', rule: 3, score: 70, direction: 'Bullish', sma200: latestMA, distancePct, maSlope };
  }

  // Sell 3: MA declining, price near MA (within 3%) and below
  if (maSlope === 'declining' && nowBelow && distancePct > -0.03 && distancePct <= 0) {
    return { signal: 'sell', rule: 3, score: 30, direction: 'Bearish', sma200: latestMA, distancePct, maSlope };
  }

  // Buy 4: price deeply below declining MA (−15% or more), oversold rebound setup
  if (maSlope === 'declining' && distancePct <= -0.15) {
    return { signal: 'buy', rule: 4, score: 55, direction: 'Neutral', sma200: latestMA, distancePct, maSlope };
  }

  // Sell 4: price deeply above rising MA (+15% or more), overbought pullback setup
  if (maSlope === 'rising' && distancePct >= 0.15) {
    return { signal: 'sell', rule: 4, score: 45, direction: 'Neutral', sma200: latestMA, distancePct, maSlope };
  }

  // No strong signal — trend-following neutral
  return {
    signal: 'neutral',
    rule: null,
    score: nowAbove && maSlope === 'rising' ? 60 : nowBelow && maSlope === 'declining' ? 40 : 50,
    direction: nowAbove && maSlope === 'rising' ? 'Bullish' : nowBelow && maSlope === 'declining' ? 'Bearish' : 'Neutral',
    sma200: latestMA,
    distancePct,
    maSlope,
  };
}

// ────────────────────────────────────────────────────────────
// 4. Entry Timing Score
// ────────────────────────────────────────────────────────────

export function calculateEntryTiming(
  prices: HistoricalPrice[],
  currentPrice: number,
  supportLevels: number[],
): EntryTimingResult {
  const signals: EntryTimingResult['signals'] = [];

  // --- RSI Signal (weight: 25) ---
  let rsiScore = 50;
  try {
    const rsi = calculateRSI(prices);
    let rsiSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
    if (rsi < 30) {
      rsiScore = 90;
      rsiSignal = 'buy';
    } else if (rsi < 40) {
      rsiScore = 70;
      rsiSignal = 'buy';
    } else if (rsi > 70) {
      rsiScore = 10;
      rsiSignal = 'sell';
    } else if (rsi > 60) {
      rsiScore = 30;
      rsiSignal = 'sell';
    } else {
      rsiScore = 50;
    }
    signals.push({
      name: 'RSI',
      value: rsi.toFixed(1),
      signal: rsiSignal,
      weight: 25,
    });
  } catch {
    signals.push({ name: 'RSI', value: 'N/A', signal: 'neutral', weight: 25 });
  }

  // --- Support Proximity Signal (weight: 20) ---
  let supportScore = 50;
  let supportSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (supportLevels.length > 0) {
    const nearestSupport = supportLevels.reduce((best, level) => {
      const dist = currentPrice - level;
      if (dist >= 0 && dist < currentPrice - best) return level;
      return best;
    }, supportLevels[0]);

    const distPercent = ((currentPrice - nearestSupport) / currentPrice) * 100;
    if (distPercent < 2) {
      supportScore = 85;
      supportSignal = 'buy';
    } else if (distPercent < 5) {
      supportScore = 65;
      supportSignal = 'buy';
    } else {
      supportScore = 45;
    }
    signals.push({
      name: 'Support Proximity',
      value: `${distPercent.toFixed(1)}% above support`,
      signal: supportSignal,
      weight: 20,
    });
  } else {
    signals.push({
      name: 'Support Proximity',
      value: 'No levels',
      signal: 'neutral',
      weight: 20,
    });
  }

  // --- Volume Trend Signal (weight: 20) ---
  let volumeScore = 50;
  let volumeSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  try {
    const vp = calculateVolumeProfile(prices);
    const recentPriceUp =
      prices.length >= 5 && prices[prices.length - 1].close > prices[prices.length - 5].close;

    if (vp.volumeRatio > 1.5 && recentPriceUp) {
      volumeScore = 80;
      volumeSignal = 'buy';
    } else if (vp.volumeRatio > 1.2 && recentPriceUp) {
      volumeScore = 65;
      volumeSignal = 'buy';
    } else if (vp.volumeRatio > 1.5 && !recentPriceUp) {
      volumeScore = 25;
      volumeSignal = 'sell';
    } else {
      volumeScore = 50;
    }
    signals.push({
      name: 'Volume Trend',
      value: `${vp.volumeRatio.toFixed(2)}x avg`,
      signal: volumeSignal,
      weight: 20,
    });
  } catch {
    signals.push({ name: 'Volume Trend', value: 'N/A', signal: 'neutral', weight: 20 });
  }

  // --- SMA Crossover Signal (weight: 20) ---
  let smaScore = 50;
  let smaSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  try {
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const latestSma20 = sma20[sma20.length - 1];
    const latestSma50 = sma50[sma50.length - 1];

    const aboveSma20 = currentPrice > latestSma20;
    const aboveSma50 = currentPrice > latestSma50;
    const sma20AboveSma50 = latestSma20 > latestSma50;

    if (aboveSma20 && aboveSma50 && sma20AboveSma50) {
      smaScore = 80;
      smaSignal = 'buy';
    } else if (aboveSma20 && aboveSma50) {
      smaScore = 65;
      smaSignal = 'buy';
    } else if (!aboveSma20 && !aboveSma50) {
      smaScore = 20;
      smaSignal = 'sell';
    } else {
      smaScore = 45;
    }
    signals.push({
      name: 'SMA Trend',
      value: `SMA20: ${latestSma20.toFixed(2)}, SMA50: ${latestSma50.toFixed(2)}`,
      signal: smaSignal,
      weight: 20,
    });
  } catch {
    signals.push({ name: 'SMA Trend', value: 'N/A', signal: 'neutral', weight: 20 });
  }

  // --- Price Momentum Signal (weight: 15) ---
  let momentumScore = 50;
  let momentumSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (prices.length >= 5) {
    const fiveDayReturn =
      ((prices[prices.length - 1].close - prices[prices.length - 5].close) /
        prices[prices.length - 5].close) *
      100;

    if (fiveDayReturn > 3) {
      momentumScore = 35; // overbought short-term
      momentumSignal = 'sell';
    } else if (fiveDayReturn > 0) {
      momentumScore = 60;
      momentumSignal = 'buy';
    } else if (fiveDayReturn > -3) {
      momentumScore = 65; // slight dip = opportunity
      momentumSignal = 'buy';
    } else {
      momentumScore = 30;
      momentumSignal = 'sell';
    }
    signals.push({
      name: '5-Day Momentum',
      value: `${fiveDayReturn >= 0 ? '+' : ''}${fiveDayReturn.toFixed(2)}%`,
      signal: momentumSignal,
      weight: 15,
    });
  } else {
    signals.push({ name: '5-Day Momentum', value: 'N/A', signal: 'neutral', weight: 15 });
  }

  // --- Weighted composite score ---
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const scores: Record<string, number> = {
    RSI: rsiScore,
    'Support Proximity': supportScore,
    'Volume Trend': volumeScore,
    'SMA Trend': smaScore,
    '5-Day Momentum': momentumScore,
  };

  let compositeScore = 0;
  for (const sig of signals) {
    compositeScore += (scores[sig.name] ?? 50) * (sig.weight / totalWeight);
  }
  compositeScore = Math.round(Math.max(0, Math.min(100, compositeScore)));

  // --- Recommendation ---
  let recommendation: EntryTimingResult['recommendation'];
  if (compositeScore >= 75) recommendation = 'strong_buy';
  else if (compositeScore >= 60) recommendation = 'buy';
  else if (compositeScore >= 40) recommendation = 'neutral';
  else if (compositeScore >= 25) recommendation = 'sell';
  else recommendation = 'strong_sell';

  return { score: compositeScore, signals, recommendation };
}

// ────────────────────────────────────────────────────────────
// 5. Monte Carlo Simulation
// ────────────────────────────────────────────────────────────

export function runMonteCarloSimulation(
  currentPrice: number,
  historicalPrices: HistoricalPrice[],
  days: number,
  numSimulations: number = 500,
  targetPrice?: number,
  stopLoss?: number,
  startDate?: string,
): MonteCarloResult {
  // 1. Calculate daily log returns
  const logReturns: number[] = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const prev = historicalPrices[i - 1].close;
    const curr = historicalPrices[i].close;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  if (logReturns.length < 5) {
    throw new Error('Not enough historical data for Monte Carlo simulation');
  }

  // 2. Mean and std dev of daily returns
  const mu = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mu) ** 2, 0) / (logReturns.length - 1);
  const sigma = Math.sqrt(variance);

  // Drift term (geometric Brownian motion)
  const drift = mu - (sigma * sigma) / 2;

  // 3. Run simulations
  const simulations: number[][] = [];
  for (let sim = 0; sim < numSimulations; sim++) {
    const path: number[] = [currentPrice];
    let price = currentPrice;
    for (let d = 0; d < days; d++) {
      price *= Math.exp(drift + sigma * normalRandom());
      path.push(price);
    }
    simulations.push(path);
  }

  // 4. Calculate percentiles for each day
  const p5: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p95: number[] = [];

  for (let d = 0; d <= days; d++) {
    const dayPrices = simulations.map((sim) => sim[d]).sort((a, b) => a - b);
    p5.push(percentile(dayPrices, 5));
    p25.push(percentile(dayPrices, 25));
    p50.push(percentile(dayPrices, 50));
    p75.push(percentile(dayPrices, 75));
    p95.push(percentile(dayPrices, 95));
  }

  // 5. Final price distribution
  const finalPrices = simulations.map((sim) => sim[sim.length - 1]).sort((a, b) => a - b);
  const finalMean = finalPrices.reduce((s, v) => s + v, 0) / finalPrices.length;

  const finalPriceDistribution = {
    min: finalPrices[0],
    max: finalPrices[finalPrices.length - 1],
    mean: finalMean,
    median: percentile(finalPrices, 50),
    p5: percentile(finalPrices, 5),
    p25: percentile(finalPrices, 25),
    p75: percentile(finalPrices, 75),
    p95: percentile(finalPrices, 95),
  };

  // Probability calculations
  const probabilityAboveTarget =
    targetPrice != null
      ? (finalPrices.filter((p) => p >= targetPrice).length / numSimulations) * 100
      : 0;

  const probabilityBelowStop =
    stopLoss != null
      ? (finalPrices.filter((p) => p <= stopLoss).length / numSimulations) * 100
      : 0;

  // VaR at 95% confidence: worst 5th percentile loss
  const var95 = currentPrice - percentile(finalPrices, 5);

  // Generate date labels
  const start = startDate ? new Date(startDate) : new Date();
  const futureDates = addBusinessDays(start, days);
  const dates = [formatDate(start), ...futureDates.map((d) => formatDate(d))];

  return {
    simulations,
    percentiles: { p5, p25, p50, p75, p95 },
    finalPriceDistribution,
    probabilityAboveTarget,
    probabilityBelowStop,
    var95,
    dates,
  };
}

// ────────────────────────────────────────────────────────────
// 6. Position Sizing Calculator
// ────────────────────────────────────────────────────────────

export function calculatePositionSize(
  accountSize: number,
  riskPercentage: number,
  entryPrice: number,
  stopLoss: number,
  targetPrice?: number,
): PositionSizeResult {
  const riskPerShare = entryPrice - stopLoss;
  if (riskPerShare <= 0) {
    throw new Error('Stop loss must be below entry price');
  }

  const maxRiskDollars = accountSize * (riskPercentage / 100);
  const shares = Math.floor(maxRiskDollars / riskPerShare);
  const totalCost = shares * entryPrice;
  const maxLoss = shares * riskPerShare;
  const riskPercent = accountSize > 0 ? (maxLoss / accountSize) * 100 : 0;

  const rewardRiskRatio =
    targetPrice != null && riskPerShare > 0
      ? (targetPrice - entryPrice) / riskPerShare
      : 0;

  return {
    shares,
    totalCost,
    maxLoss,
    riskPercent,
    rewardRiskRatio,
  };
}

// ────────────────────────────────────────────────────────────
// 7. Accuracy Tracking
// ────────────────────────────────────────────────────────────

export async function evaluatePredictionAccuracy(
  ticker: string,
  startPrice: number,
  targetPrice: number,
  startDate: string,
  endDate: string,
): Promise<AccuracyResult | null> {
  const endDateObj = new Date(endDate);
  const now = new Date();

  // If the period hasn't ended yet, return null
  if (endDateObj > now) return null;

  // Calculate how many days of data we need
  const startDateObj = new Date(startDate);
  const diffMs = endDateObj.getTime() - startDateObj.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  // Fetch extra buffer to ensure we cover the range
  const fetchDays = diffDays + 30;

  let prices: HistoricalPrice[];
  try {
    prices = await fetchHistoricalPrices(ticker, fetchDays);
  } catch {
    return null;
  }

  // Filter to the evaluation period
  const periodPrices = prices.filter((p) => p.date >= startDate && p.date <= endDate);
  if (periodPrices.length === 0) return null;

  const actualFinalPrice = periodPrices[periodPrices.length - 1].close;
  const predictedDirection: 'up' | 'down' = targetPrice >= startPrice ? 'up' : 'down';
  const actualDirection: 'up' | 'down' = actualFinalPrice >= startPrice ? 'up' : 'down';
  const predictedChange = ((targetPrice - startPrice) / startPrice) * 100;
  const actualChange = ((actualFinalPrice - startPrice) / startPrice) * 100;
  const directionCorrect = predictedDirection === actualDirection;

  // Price accuracy: 100 - percentage error (clamped to 0-100)
  const predictionError = Math.abs(targetPrice - actualFinalPrice);
  const priceAccuracy = Math.max(0, 100 - (predictionError / startPrice) * 100);

  // Max drawdown and max gain during period
  let peak = startPrice;
  let maxDrawdown = 0;
  let maxGain = 0;

  for (const p of periodPrices) {
    const gainFromStart = ((p.high - startPrice) / startPrice) * 100;
    if (gainFromStart > maxGain) maxGain = gainFromStart;

    if (p.high > peak) peak = p.high;
    const drawdown = ((peak - p.low) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    predictedDirection,
    actualDirection,
    predictedTarget: targetPrice,
    actualFinalPrice,
    predictedChange,
    actualChange,
    directionCorrect,
    priceAccuracy,
    maxDrawdownDuringPeriod: maxDrawdown,
    maxGainDuringPeriod: maxGain,
  };
}
