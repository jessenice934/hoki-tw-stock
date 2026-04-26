// Gemini calls go through /api/gemini (server-side keys, never in browser bundle)
import { normalizeTwTicker, fetchTickerName, fetchNewsHeadlines, fetchInstitutionalFlow, InstitutionalFlow, fetchFundamentals, Fundamentals, fetchHistoricalPrices, computeSupportResistance, calculateRSI, HistoricalPrice } from './finance';

// ============================================================
// 即時股價抓取 (Yahoo Finance via Vite proxy) + 快取
// 台股版：4-6 位數字 ticker 自動補 .TW
// ============================================================
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘快取

export async function fetchLivePrice(ticker: string): Promise<number | null> {
  const yahooSym = normalizeTwTicker(ticker);
  const cached = priceCache[yahooSym];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  try {
    const resp = await fetch(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d`);
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    if (price !== null) {
      priceCache[yahooSym] = { price, timestamp: Date.now() };
    }
    return price;
  } catch {
    return null;
  }
}

export async function fetchLivePricesForTickers(tickers: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  await Promise.all(
    tickers.map(async (t) => {
      const price = await fetchLivePrice(t);
      if (price) results[t.toUpperCase()] = price;
    })
  );
  return results;
}

// ============================================================
// API 結果快取（同一 ticker + 同一天 + 同功能 → 不重複呼叫）
// ============================================================
const resultCache: Record<string, { data: any; timestamp: number }> = {};
const RESULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小時（跨重啟也有效）
const LS_CACHE_PREFIX = 'hoki_ai_cache:';

function getCacheKey(prefix: string, ...parts: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}:${today}:${parts.join(':')}`;
}

function getCachedResult(key: string): any | null {
  // 1. 先查記憶體快取
  const mem = resultCache[key];
  if (mem && Date.now() - mem.timestamp < RESULT_CACHE_TTL) {
    return mem.data;
  }
  // 2. 查 localStorage（跨重啟）
  try {
    const raw = localStorage.getItem(LS_CACHE_PREFIX + key);
    if (raw) {
      const parsed: { data: any; timestamp: number } = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < RESULT_CACHE_TTL) {
        resultCache[key] = parsed; // 同步到記憶體
        return parsed.data;
      }
      localStorage.removeItem(LS_CACHE_PREFIX + key); // 過期清除
    }
  } catch { /* ignore */ }
  return null;
}

function setCachedResult(key: string, data: any): void {
  const entry = { data, timestamp: Date.now() };
  resultCache[key] = entry;
  try {
    localStorage.setItem(LS_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch { /* storage full — skip */ }
}

// ============================================================
// API 使用量追蹤
// ============================================================
let apiCallCount = 0;
const API_CALL_LIMIT_WARNING = 50; // 超過此數量顯示警告

export function getApiUsageInfo() {
  return {
    callsToday: apiCallCount,
    warningThreshold: API_CALL_LIMIT_WARNING,
    isNearLimit: apiCallCount > API_CALL_LIMIT_WARNING,
  };
}

/**
 * Call the server-side Gemini proxy at /api/gemini.
 * Keys never leave the server — this function only sends prompts.
 */
async function callGeminiAPI(
  systemInstruction: string,
  userPrompt: string,
  generationConfig: Record<string, unknown> = {
    temperature: 0, topP: 1, topK: 40, maxOutputTokens: 32768, responseMimeType: 'application/json',
  },
): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    }),
  });
  let data: { text?: string; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('AI 服務暫時無法使用，請稍後再試 (non-JSON response)');
  }
  if (!res.ok || !data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.text;
}

/**
 * Variant for image-based analysis (portfolio screenshot extraction).
 */
async function callGeminiAPIWithImage(
  imageBase64: string,
  mimeType: string,
  textPrompt: string,
): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: textPrompt },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
  });
  const data = await res.json() as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.text;
}

const typeMap: Record<string, string> = {
  ai: 'AI / 概念股',
  tech: 'Technology / 電子股',
  semi: 'Semiconductors / 半導體',
  ecosystem: 'Ecosystem',
  dividend: 'High-Dividend / 高股息',
  index: 'Index',
  healthcare: 'Biotech / 醫療生技',
  financial: 'Financial / 金融',
  shipping: 'Shipping / 航運',
  etf: 'ETF / 指數',
  biotech: 'Biotech / 醫療生技',
  aggressive: 'Aggressive Growth / 中小型成長',
};

// ============================================================
// 階段 C-1: Sector Blacklist (板塊純淨度過濾)
// 防止 AI 將跨領域巨頭誤分類到錯誤板塊
// ============================================================
// 台股版：純度過濾較不必要（AI 多半會落在正確類別）。先全部置空，未來可加入跨類別大型股。
const SECTOR_BLACKLIST: Record<string, string[]> = {
  tech: [],
  ai: [],
  semi: [],
  shipping: [],
  biotech: [],
  dividend: [],
  aggressive: [],
  etf: [],
  ecosystem: [],
  index: [],
};

const VOLATILITY_GUARD = {
  // 2026-04-23 校準：原本 1w=5% 太保守，實測一週準確預測方向 88.9% 但達標率僅 33%，
  // 目標常被 cap 住。把上限放寬 60%（1w 5→8、2w 8→10、3w 10→12、1m 12→15）。
  // stopLossMax 保持不變——這是保護用戶的下限，不該跟著放寬。
  '1w': { max: 8, stopLossMax: -8 },
  '2w': { max: 10, stopLossMax: -10 },
  '3w': { max: 12, stopLossMax: -12 },
  '1m': { max: 15, stopLossMax: -15 },
  '2m': { max: 20, stopLossMax: -18 },
  '3m': { max: 25, stopLossMax: -20 },
  '6m': { max: 40, stopLossMax: -25 },
  '1y': { max: 60, stopLossMax: -30 },
};

const VOLATILITY_GUARD_PROMPT = `VOLATILITY GUARD REQUIREMENTS:
- This rule applies CONSISTENTLY across all recommendations and predictions
- Maximum allowed gain is defined by timeframe: 1w=8%, 2w=10%, 3w=12%, 1m=15%
- If projected price exceeds this, CLAMP it to the maximum allowed
- Stop loss must be reasonable and within limits
- Apply this rule to EVERY recommendation - NO EXCEPTIONS
- Consistency check: All stocks analyzed in the same session should use identical volatility thresholds
- Cross-reference all prices: currentPrice + (currentPrice × maxGain%) = capped targetPrice`;

const SIGNAL_ENFORCEMENT_PROMPT = `SIGNAL SCORING NOTES:
- Backend computes the 12 quantitative signals from real market data (price, RSI, MACD, institutional flow, fundamentals from FinMind) and OVERWRITES whatever you return.
- Do NOT fabricate signals to meet a threshold — your signal values are discarded.
- Focus your reasoning on: persona fit, sector category, price targets, and qualitative narrative.
- Of the 12 signals, 9 are measurable today; 3 (Short Interest, ROE, Insider Buy/Sell) are pending data sources and will be marked Neutral by backend.
- Final filter (5+ positive of 9 measurable) is applied AFTER your output, on real backend-computed signals.`;

const DETERMINISTIC_PROMPT = `DETERMINISTIC REASONING PROTOCOL:
- Evidence weight hierarchy: 財報數據 (Earnings) > 新聞事件 (News) > 市場情緒 (Sentiment)
- Always cite the source of each data point
- Prioritize verifiable financial data over subjective sentiment
- When conflicting signals exist, defer to the higher-weight evidence category`;

interface InvestmentParams {
  type: string;
  profitTarget: number;
  riskTolerance: number;
  duration: string;
  lang?: string;
}

interface RecommendationReference {
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  duration: string;
}

interface SingleStockParams {
  ticker: string;
  timeframe: string;
  lang?: string;
  reference?: RecommendationReference;
}

interface PortfolioParams {
  portfolio: string;
  lang?: string;
}

// ============================================================
// 自動重試機制已移至 /api/gemini (Edge Function)
// ============================================================

// ============================================================
// 階段 B: 強韌 JSON 解析架構 (repairJson)
// 處理 Google Search 工具產生的大量數據流導致的 JSON 崩潰
// ============================================================
/** 修復 JSON 字串值內的未跳脫換行符 */
function escapeNewlinesInStrings(json: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < json.length) {
    const ch = json[i];
    // 切換字串狀態（注意跳脫的引號 \"）
    if (ch === '"' && (i === 0 || json[i - 1] !== '\\')) {
      inString = !inString;
      result += ch;
    } else if (inString && ch === '\n') {
      result += '\\n';
    } else if (inString && ch === '\r') {
      result += '\\r';
    } else if (inString && ch === '\t') {
      result += '\\t';
    } else {
      result += ch;
    }
    i++;
  }
  return result;
}

function repairJson(text: string): any {
  // Step 0: Replace literal newlines/CR with space — they break JSON string parsing
  // (JSON escape sequences like \n remain unaffected since they are two chars: \ + n)
  const noRawNewlines = text.replace(/\r?\n/g, ' ').replace(/\r/g, ' ');

  // Step 1: 先把 markdown code block 移除
  let cleaned = noRawNewlines
    .replace(/^```[\w]*\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  // Step 2: 提取最外層 JSON 塊（object 或 array）
  const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  let jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

  // Step 3: 常見語法修正
  jsonStr = jsonStr
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/:\s*NaN\b/g, ': null')
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/:\s*Infinity\b/g, ': null')
    .replace(/:\s*-Infinity\b/g, ': null')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Step 4: 修復字串值內未跳脫的換行符
    const escaped = escapeNewlinesInStrings(jsonStr);
    try {
      return JSON.parse(escaped);
    } catch { /* fall through */ }

    // Step 5: 截斷到最後一個完整的 } 或 ]
    const lastBrace = Math.max(escaped.lastIndexOf('}'), escaped.lastIndexOf(']'));
    if (lastBrace > 0) {
      try {
        return JSON.parse(escaped.slice(0, lastBrace + 1));
      } catch { /* fall through */ }
    }

    // Step 6: 修復奇數引號
    const quoteCount = (escaped.match(/(?<!\\)"/g) || []).length;
    const fixed = quoteCount % 2 !== 0 ? escaped + '"' : escaped;
    try {
      return JSON.parse(fixed);
    } catch (finalErr) {
      console.error('repairJson failed:', finalErr);
      throw new Error('Failed to parse AI response as JSON');
    }
  }
}

// ============================================================
// 真實三大法人資料 → institutionalActivity 結構
// ============================================================
function buildInstitutionalActivity(flow: InstitutionalFlow, lang?: string) {
  // 用平均日合計判斷強弱（單日 > 1000 張視為明顯）
  const absAvg = Math.abs(flow.avgDailyNetLots);
  let netInstitutionalFlow: 'Accumulating' | 'Distributing' | 'Neutral';
  if (flow.totalNetLots > 0 && absAvg > 200) netInstitutionalFlow = 'Accumulating';
  else if (flow.totalNetLots < 0 && absAvg > 200) netInstitutionalFlow = 'Distributing';
  else netInstitutionalFlow = 'Neutral';

  const fmtLots = (shares: number): string => {
    const lots = Math.round(shares / 1000);
    return lots >= 0 ? `+${lots.toLocaleString()}` : lots.toLocaleString();
  };

  const isZh = lang === 'zh';
  const recentInsiderTrades = isZh
    ? `近 ${flow.days} 個交易日（截至 ${flow.latestDate}）三大法人合計 ${fmtLots(flow.totalNet)} 張，平均每日 ${flow.avgDailyNetLots >= 0 ? '+' : ''}${flow.avgDailyNetLots.toLocaleString()} 張`
    : `Last ${flow.days} trading days (through ${flow.latestDate}): institutional net flow ${fmtLots(flow.totalNet)} lots, avg ${flow.avgDailyNetLots >= 0 ? '+' : ''}${flow.avgDailyNetLots.toLocaleString()} lots/day`;

  const topHolderChange = isZh
    ? `外資 ${fmtLots(flow.foreign.net)} 張、投信 ${fmtLots(flow.trust.net)} 張、自營商 ${fmtLots(flow.dealer.net)} 張`
    : `Foreign ${fmtLots(flow.foreign.net)}, Trust ${fmtLots(flow.trust.net)}, Dealer ${fmtLots(flow.dealer.net)} lots`;

  return { netInstitutionalFlow, recentInsiderTrades, topHolderChange };
}

// ============================================================
// 真實基本面資料 → fundamentalScore 結構
// 計分原則：每個指標 0–100，越高越好。
// ============================================================
function buildFundamentalScore(f: Fundamentals, lang?: string) {
  const isZh = lang === 'zh';
  const metrics: { name: 'PE_vs_Peers' | 'Revenue_Growth' | 'FCF_Yield' | 'Debt_Ratio'; score: number; direction: 'Positive' | 'Negative' | 'Neutral'; detail: string }[] = [];

  // ── P/E ─────────────────────────────────────────────
  // Taiwan 市場合理 PE 範圍 12–20，> 30 偏高，< 8 可能基本面有風險
  if (f.pe !== null) {
    let score: number;
    let direction: 'Positive' | 'Negative' | 'Neutral';
    if (f.pe < 8)        { score = 55; direction = 'Neutral';  }
    else if (f.pe < 12)  { score = 80; direction = 'Positive'; }
    else if (f.pe < 18)  { score = 70; direction = 'Positive'; }
    else if (f.pe < 25)  { score = 55; direction = 'Neutral';  }
    else if (f.pe < 35)  { score = 35; direction = 'Negative'; }
    else                 { score = 20; direction = 'Negative'; }
    const detail = isZh
      ? `本益比 ${f.pe.toFixed(1)} 倍${f.asOfPER ? `（${f.asOfPER}）` : ''}`
      : `P/E ${f.pe.toFixed(1)}x${f.asOfPER ? ` (as of ${f.asOfPER})` : ''}`;
    metrics.push({ name: 'PE_vs_Peers', score, direction, detail });
  }

  // ── Revenue YoY ────────────────────────────────────
  if (f.revenueYoY !== null) {
    let score: number;
    let direction: 'Positive' | 'Negative' | 'Neutral';
    if (f.revenueYoY >= 30)       { score = 90; direction = 'Positive'; }
    else if (f.revenueYoY >= 15)  { score = 75; direction = 'Positive'; }
    else if (f.revenueYoY >= 5)   { score = 60; direction = 'Positive'; }
    else if (f.revenueYoY >= 0)   { score = 50; direction = 'Neutral';  }
    else if (f.revenueYoY >= -10) { score = 35; direction = 'Negative'; }
    else                          { score = 18; direction = 'Negative'; }
    const sign = f.revenueYoY >= 0 ? '+' : '';
    const detail = isZh
      ? `${f.revenueDate ?? ''} 月營收 YoY ${sign}${f.revenueYoY.toFixed(1)}%`
      : `${f.revenueDate ?? 'Latest'} revenue YoY ${sign}${f.revenueYoY.toFixed(1)}%`;
    metrics.push({ name: 'Revenue_Growth', score, direction, detail });
  }

  // ── 殖利率（用於替代 FCF Yield）────────────────────
  // Taiwan 公司高殖利率代表有穩定現金回饋（接近 FCF 視角）
  if (f.divYield !== null) {
    let score: number;
    let direction: 'Positive' | 'Negative' | 'Neutral';
    if (f.divYield >= 5)        { score = 85; direction = 'Positive'; }
    else if (f.divYield >= 3)   { score = 70; direction = 'Positive'; }
    else if (f.divYield >= 1.5) { score = 55; direction = 'Neutral';  }
    else if (f.divYield > 0)    { score = 40; direction = 'Neutral';  }
    else                        { score = 30; direction = 'Negative'; }
    const detail = isZh
      ? `現金殖利率 ${f.divYield.toFixed(2)}%（以殖利率代理現金流品質）`
      : `Dividend yield ${f.divYield.toFixed(2)}% (proxy for cash quality)`;
    metrics.push({ name: 'FCF_Yield', score, direction, detail });
  }

  // ── 負債比 ─────────────────────────────────────────
  if (f.debtRatio !== null) {
    let score: number;
    let direction: 'Positive' | 'Negative' | 'Neutral';
    if (f.debtRatio < 30)       { score = 85; direction = 'Positive'; }
    else if (f.debtRatio < 50)  { score = 70; direction = 'Positive'; }
    else if (f.debtRatio < 65)  { score = 50; direction = 'Neutral';  }
    else if (f.debtRatio < 80)  { score = 30; direction = 'Negative'; }
    else                        { score = 15; direction = 'Negative'; }
    const detail = isZh
      ? `負債比 ${f.debtRatio.toFixed(1)}%${f.asOfBS ? `（${f.asOfBS}）` : ''}`
      : `Debt ratio ${f.debtRatio.toFixed(1)}%${f.asOfBS ? ` (as of ${f.asOfBS})` : ''}`;
    metrics.push({ name: 'Debt_Ratio', score, direction, detail });
  }

  if (metrics.length === 0) {
    return { overall: 50, metrics: [] };
  }
  const overall = Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);
  return { overall, metrics };
}

// ============================================================
// 真實 12 量化訊號計算
// 從歷史價、三大法人、FinMind 基本面組合產生 status 為 Positive/Negative/Neutral 的訊號清單。
// 沒有可靠資料來源的訊號（ROE/Short Interest/Insider/PEG）會回傳 Neutral
// 並標註 "data not available"。
// ============================================================
type QuantSignal = { name: string; status: 'Positive' | 'Negative' | 'Neutral'; value: string };

function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

async function buildQuantSignals(
  ticker: string,
  lang: string | undefined,
): Promise<QuantSignal[]> {
  const isZh = lang === 'zh';
  const T = (zh: string, en: string) => (isZh ? zh : en);

  // 並行抓三大資料源
  const [prices, instFlow, fund] = await Promise.all([
    fetchHistoricalPrices(ticker, 90).catch(() => [] as HistoricalPrice[]),
    fetchInstitutionalFlow(ticker, 5).catch(() => null),
    fetchFundamentals(ticker).catch(() => null),
  ]);

  const sigs: QuantSignal[] = [];

  // ── 1. Price Momentum (20-day return) ────────────────────
  if (prices.length >= 21) {
    const recent = prices[prices.length - 1].close;
    const past = prices[prices.length - 21].close;
    const ret20 = ((recent - past) / past) * 100;
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (ret20 >= 5) status = 'Positive';
    else if (ret20 <= -5) status = 'Negative';
    else status = 'Neutral';
    const sign = ret20 >= 0 ? '+' : '';
    sigs.push({
      name: T('價格動能', 'Price Momentum'),
      status,
      value: `20D ${sign}${ret20.toFixed(1)}%`,
    });
  } else {
    sigs.push({ name: T('價格動能', 'Price Momentum'), status: 'Neutral', value: T('資料不足', 'Insufficient data') });
  }

  // ── 2. RSI(14) ────────────────────────────────────────────
  if (prices.length >= 15) {
    const rsi = calculateRSI(prices, 14);
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (rsi >= 70) status = 'Negative';     // 超買
    else if (rsi <= 30) status = 'Positive'; // 超賣，逆向 = 機會
    else if (rsi >= 50) status = 'Positive';
    else status = 'Neutral';
    sigs.push({ name: 'RSI', status, value: rsi.toFixed(1) });
  } else {
    sigs.push({ name: 'RSI', status: 'Neutral', value: T('資料不足', 'Insufficient data') });
  }

  // ── 3. MACD (12/26 EMA crossover) ────────────────────────
  if (prices.length >= 27) {
    const closes = prices.map((p) => p.close);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macd = ema12 - ema26;
    // signal 線取最近 9 個 macd 值平均（簡化版）
    const macdHist: number[] = [];
    for (let i = 26; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      macdHist.push(calculateEMA(slice, 12) - calculateEMA(slice, 26));
    }
    const signalLine = macdHist.slice(-9).reduce((a, b) => a + b, 0) / Math.min(9, macdHist.length);
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (macd > signalLine && macd > 0) status = 'Positive';
    else if (macd < signalLine && macd < 0) status = 'Negative';
    else status = 'Neutral';
    sigs.push({ name: 'MACD', status, value: `${macd >= 0 ? '+' : ''}${macd.toFixed(2)}` });
  } else {
    sigs.push({ name: 'MACD', status: 'Neutral', value: T('資料不足', 'Insufficient data') });
  }

  // ── 4. Institutional Flow (三大法人) ─────────────────────
  if (instFlow) {
    const lots = instFlow.totalNetLots;
    const absAvg = Math.abs(instFlow.avgDailyNetLots);
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (lots > 0 && absAvg > 200) status = 'Positive';
    else if (lots < 0 && absAvg > 200) status = 'Negative';
    else status = 'Neutral';
    const sign = lots >= 0 ? '+' : '';
    sigs.push({
      name: T('三大法人', 'Institutional Flow'),
      status,
      value: `${sign}${lots.toLocaleString()} ${T('張', 'lots')} (${instFlow.days}D)`,
    });
  } else {
    sigs.push({ name: T('三大法人', 'Institutional Flow'), status: 'Neutral', value: T('查無資料', 'No data') });
  }

  // ── 5. Short Interest (無可靠來源 → Neutral) ──────────────
  sigs.push({
    name: T('融券壓力', 'Short Interest'),
    status: 'Neutral',
    value: T('資料來源建置中', 'Data source pending'),
  });

  // ── 6. P/E Ratio ─────────────────────────────────────────
  if (fund?.pe !== null && fund?.pe !== undefined) {
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (fund.pe < 15) status = 'Positive';
    else if (fund.pe < 25) status = 'Neutral';
    else status = 'Negative';
    sigs.push({ name: T('本益比', 'P/E Ratio'), status, value: `${fund.pe.toFixed(1)}x` });
  } else {
    sigs.push({ name: T('本益比', 'P/E Ratio'), status: 'Neutral', value: T('查無資料', 'No data') });
  }

  // ── 7. FCF Yield (用殖利率代理) ──────────────────────────
  if (fund?.divYield !== null && fund?.divYield !== undefined) {
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (fund.divYield >= 4) status = 'Positive';
    else if (fund.divYield >= 1.5) status = 'Neutral';
    else status = 'Negative';
    sigs.push({
      name: T('現金流品質（殖利率）', 'FCF Yield (Div Proxy)'),
      status,
      value: `${fund.divYield.toFixed(2)}%`,
    });
  } else {
    sigs.push({ name: T('現金流品質', 'FCF Yield'), status: 'Neutral', value: T('查無資料', 'No data') });
  }

  // ── 8. ROE (無可靠來源 → Neutral) ────────────────────────
  sigs.push({
    name: T('ROE 股東權益報酬率', 'ROE'),
    status: 'Neutral',
    value: T('資料來源建置中', 'Data source pending'),
  });

  // ── 9. Debt-to-Equity (用負債比代理) ────────────────────
  if (fund?.debtRatio !== null && fund?.debtRatio !== undefined) {
    // 負債比 = L/A → D/E = L/E ≈ debtRatio / (1 - debtRatio)
    const de = fund.debtRatio / (100 - fund.debtRatio);
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (fund.debtRatio < 40) status = 'Positive';
    else if (fund.debtRatio < 60) status = 'Neutral';
    else status = 'Negative';
    sigs.push({
      name: T('負債比', 'Debt-to-Equity'),
      status,
      value: `${T('負債比', 'D/A')} ${fund.debtRatio.toFixed(1)}% (D/E ${de.toFixed(2)})`,
    });
  } else {
    sigs.push({ name: T('負債比', 'Debt-to-Equity'), status: 'Neutral', value: T('查無資料', 'No data') });
  }

  // ── 10. Earnings Growth (用月營收 YoY 代理) ─────────────
  if (fund?.revenueYoY !== null && fund?.revenueYoY !== undefined) {
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (fund.revenueYoY >= 10) status = 'Positive';
    else if (fund.revenueYoY >= 0) status = 'Neutral';
    else status = 'Negative';
    const sign = fund.revenueYoY >= 0 ? '+' : '';
    sigs.push({
      name: T('營收成長（YoY 代理）', 'Earnings Growth'),
      status,
      value: `${sign}${fund.revenueYoY.toFixed(1)}% YoY`,
    });
  } else {
    sigs.push({ name: T('營收成長', 'Earnings Growth'), status: 'Neutral', value: T('查無資料', 'No data') });
  }

  // ── 11. PEG Ratio (PE / 營收成長率) ─────────────────────
  if (fund?.pe !== null && fund?.pe !== undefined && fund?.revenueYoY !== null && fund?.revenueYoY !== undefined && fund.revenueYoY > 0) {
    const peg = fund.pe / fund.revenueYoY;
    let status: 'Positive' | 'Negative' | 'Neutral';
    if (peg < 1) status = 'Positive';
    else if (peg < 2) status = 'Neutral';
    else status = 'Negative';
    sigs.push({ name: 'PEG', status, value: peg.toFixed(2) });
  } else {
    sigs.push({ name: 'PEG', status: 'Neutral', value: T('需正向成長', 'Needs positive growth') });
  }

  // ── 12. Insider Buy/Sell (無可靠來源 → Neutral) ─────────
  sigs.push({
    name: T('內部人交易', 'Insider Buy/Sell'),
    status: 'Neutral',
    value: T('資料來源建置中', 'Data source pending'),
  });

  return sigs;
}

// ============================================================
// 階段 C-2: 數學鉗制 (Mathematical Clamping)
// getLimitMultiplier 階梯函數
// ============================================================
// 將使用者輸入的時間字串正規化為標準 key（例：「1年」→ '1y'，「3個月」→ '3m'）
function normalizeTimeframe(tf: string): string {
  const s = tf.trim().toLowerCase();
  if (['1w', '2w', '3w', '1m', '2m', '3m', '6m', '1y'].includes(s)) return s;
  // 年
  if (/^1\s*[y年]/.test(s)) return '1y';
  // 月
  const mMatch = s.match(/^(\d+)\s*[m月個]/);
  if (mMatch) {
    const n = parseInt(mMatch[1]);
    if (n >= 6) return '6m';
    if (n >= 3) return '3m';
    if (n >= 2) return '2m';
    return '1m';
  }
  // 週
  const wMatch = s.match(/^(\d+)\s*[w週]/);
  if (wMatch) {
    const n = parseInt(wMatch[1]);
    if (n >= 4) return '1m';
    if (n >= 3) return '3w';
    if (n >= 2) return '2w';
    return '1w';
  }
  return s;
}

function getLimitMultiplier(duration: string): number {
  const multipliers: Record<string, number> = {
    '1w': 1.08,
    '2w': 1.10,
    '3w': 1.12,
    '1m': 1.15,
    '2m': 1.20,
    '3m': 1.25,
    '6m': 1.40,
    '1y': 1.60,
  };
  return multipliers[normalizeTimeframe(duration)] || 1.15;
}

// ============================================================
// 階段 C: 後處理過濾器 (Post-processing Filters)
// ============================================================
function validateAndClampRecommendations(response: any, duration: string, sectorType?: string, lang?: string): any {
  const durationKey = normalizeTimeframe(duration) as keyof typeof VOLATILITY_GUARD;
  const volatilityConfig = VOLATILITY_GUARD[durationKey] || VOLATILITY_GUARD['1m'];
  const maxStopLossPercent = volatilityConfig.stopLossMax;
  const limitMultiplier = getLimitMultiplier(duration);

  if (!response.recommendations || !Array.isArray(response.recommendations)) {
    return response;
  }

  // C-1: 板塊純淨度過濾
  const blacklist = sectorType ? (SECTOR_BLACKLIST[sectorType] || []) : [];

  let filteredRecommendations = response.recommendations;
  if (blacklist.length > 0) {
    filteredRecommendations = filteredRecommendations.filter((rec: any) => {
      const ticker = (rec.ticker || '').toUpperCase();
      if (blacklist.includes(ticker)) {
        console.warn(`[Sector Purity] Removing ${ticker} from ${sectorType} recommendations (blacklisted)`);
        return false;
      }
      return true;
    });
  }

  // C-3: 不在此處過濾訊號 — AI 訊號是編造的，會在 buildQuantSignals 覆寫後再過濾
  // 注意：6 風格觀點在 persona analysis 後才整合為 18 維總分
  const validRecommendations = filteredRecommendations.map((rec: any) => {
    const currentPrice = rec.currentPrice || 0;
    const targetPrice = rec.targetPrice || 0;
    const stopLoss = rec.stopLoss || 0;
    let wasClamped = false;

    // C-2: 數學鉗制 - ClampedTarget = Math.min(AI_Target, CurrentPrice * Multiplier)
    if (currentPrice > 0 && targetPrice > currentPrice) {
      const maxTarget = currentPrice * limitMultiplier;
      const clampedTarget = Math.min(targetPrice, maxTarget);

      if (clampedTarget < targetPrice) {
        const originalGain = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1);
        const clampedGain = ((clampedTarget - currentPrice) / currentPrice * 100).toFixed(1);
        console.warn(
          `[Math Clamp] ${rec.ticker} target: $${targetPrice.toFixed(2)} → $${clampedTarget.toFixed(2)} (${originalGain}% → ${clampedGain}%)`
        );
        rec.targetPrice = clampedTarget;
        wasClamped = true;
      }
    }

    // Stop loss clamping
    if (currentPrice > 0 && stopLoss < currentPrice) {
      const lossPercent = ((stopLoss - currentPrice) / currentPrice) * 100;

      if (lossPercent < maxStopLossPercent) {
        const clampedStopLoss = currentPrice * (1 + maxStopLossPercent / 100);
        console.warn(
          `[Math Clamp] ${rec.ticker} stop loss: $${stopLoss.toFixed(2)} → $${clampedStopLoss.toFixed(2)} (${lossPercent.toFixed(1)}% → ${maxStopLossPercent}%)`
        );
        rec.stopLoss = clampedStopLoss;
        wasClamped = true;
      }
    }

    // 如果被鉗制，在 rationale 追加提示（用戶友善措辭）
    if (wasClamped && rec.rationale) {
      const clampNote = lang === 'zh'
        ? ' [⚡ 目標價／停損已依市場波動率自動修正]'
        : ' [⚡ Target/stop auto-adjusted for volatility]';
      rec.rationale = rec.rationale + clampNote;
    }

    return rec;
  });

  if (validRecommendations.length === 0) {
    response.recommendations = [];
    const durationLabelZh: Record<string, string> = {
      '1w': '一週',
      '2w': '兩週',
      '3w': '三週',
      '1m': '一個月',
    };
    const durationLabelEn: Record<string, string> = {
      '1w': '1-week',
      '2w': '2-week',
      '3w': '3-week',
      '1m': '1-month',
    };
    const durZh = durationLabelZh[duration] || duration;
    const durEn = durationLabelEn[duration] || duration;
    const noMatchMsg = lang === 'zh'
      ? `在${durZh}的時間範圍內，目前沒有標的符合嚴格條件（需 12 項訊號中至少 8 項為正面，且符合波動率限制）。建議拉長操作時間或放寬條件後重試。`
      : `No stocks met the strict criteria (8+ positive signals and volatility constraints for ${durEn} timeframe). Try a longer time horizon or broader criteria.`;
    response.summary = `${noMatchMsg} ${response.summary || ''}`.trim();
  } else {
    response.recommendations = validRecommendations;
  }

  return response;
}

function validateAndClampPrediction(response: any, duration: string, lang?: string): any {
  const durationKey = normalizeTimeframe(duration) as keyof typeof VOLATILITY_GUARD;
  const volatilityConfig = VOLATILITY_GUARD[durationKey] || VOLATILITY_GUARD['1m'];
  const maxStopLossPercent = volatilityConfig.stopLossMax;
  const limitMultiplier = getLimitMultiplier(duration);

  const currentPrice = response.currentPrice || 0;
  const targetPrice = response.targetPrice || 0;
  const timeStop = response.timeStop || 0;
  let wasClamped = false;

  // 數學鉗制
  if (currentPrice > 0 && targetPrice > currentPrice) {
    const maxTarget = currentPrice * limitMultiplier;
    const clampedTarget = Math.min(targetPrice, maxTarget);
    if (clampedTarget < targetPrice) {
      console.warn(`[Math Clamp] ${response.ticker} prediction target: $${targetPrice.toFixed(2)} → $${clampedTarget.toFixed(2)}`);
      response.targetPrice = clampedTarget;
      wasClamped = true;
    }
  }

  if (currentPrice > 0 && timeStop < currentPrice) {
    const lossPercent = ((timeStop - currentPrice) / currentPrice) * 100;
    if (lossPercent < maxStopLossPercent) {
      const clampedStop = currentPrice * (1 + maxStopLossPercent / 100);
      console.warn(`[Math Clamp] ${response.ticker} prediction stop loss: $${timeStop.toFixed(2)} → $${clampedStop.toFixed(2)}`);
      response.timeStop = clampedStop;
      wasClamped = true;
    }
  }

  // Clamp prediction trend prices + bands + inject volatility if flat
  if (response.predictionTrend && Array.isArray(response.predictionTrend)) {
    const maxPrice = currentPrice * limitMultiplier;

    // Detect flat line: if >40% of consecutive prices have <0.1% change, inject volatility
    let flatCount = 0;
    for (let i = 1; i < response.predictionTrend.length; i++) {
      const prev = response.predictionTrend[i - 1]?.price;
      const curr = response.predictionTrend[i]?.price;
      if (prev && curr && Math.abs(curr - prev) / prev < 0.001) flatCount++;
    }
    const isFlatLine = response.predictionTrend.length > 3 && flatCount / (response.predictionTrend.length - 1) > 0.4;

    if (isFlatLine) {
      // Re-generate trend with realistic volatility using random walk
      const startPrice = response.predictionTrend[0]?.price || currentPrice;
      const endPrice = response.targetPrice || response.predictionTrend[response.predictionTrend.length - 1]?.price || startPrice;
      const n = response.predictionTrend.length;
      const drift = (endPrice - startPrice) / n;
      const dailyVol = startPrice * 0.012; // ~1.2% daily volatility

      // Seeded pseudo-random for reproducibility within same request
      let seed = (startPrice * 100 + n) | 0;
      const pseudoRandom = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
      const pseudoNormal = () => {
        const u1 = pseudoRandom() || 0.001;
        const u2 = pseudoRandom() || 0.001;
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      };

      let price = startPrice;
      response.predictionTrend = response.predictionTrend.map((trend: any, i: number) => {
        if (i === 0) {
          price = startPrice;
        } else if (i === n - 1) {
          // Last point: land near endPrice but not exactly
          price = endPrice + pseudoNormal() * dailyVol * 0.3;
        } else {
          // Drift toward target + random noise
          const progress = i / n;
          const pullToTarget = (endPrice - price) * 0.05; // gentle pull
          price += drift + pullToTarget + pseudoNormal() * dailyVol;
        }
        const bandWidth = dailyVol * (1 + (i / n) * 2); // widening band
        return {
          ...trend,
          price: Math.max(price, startPrice * 0.7), // floor
          upperBand: price + bandWidth,
          lowerBand: Math.max(price - bandWidth, 0),
        };
      });
    }

    response.predictionTrend = response.predictionTrend.map((trend: any) => {
      const clamped = { ...trend };
      if (clamped.price > maxPrice) { clamped.price = maxPrice; wasClamped = true; }
      if (clamped.upperBand > maxPrice) clamped.upperBand = maxPrice;
      if (clamped.lowerBand < 0) clamped.lowerBand = 0;
      // 確保 upperBand 和 lowerBand 存在
      if (clamped.upperBand == null) clamped.upperBand = clamped.price * 1.02;
      if (clamped.lowerBand == null) clamped.lowerBand = clamped.price * 0.98;
      return clamped;
    });
  }

  // 遷移舊的 support/resistance 單一數字 → 陣列格式
  if (response.technicals) {
    if (typeof response.technicals.support === 'number') {
      response.technicals = {
        supportLevels: [{ price: response.technicals.support, label: 'S1' }],
        resistanceLevels: [{ price: response.technicals.resistance, label: 'R1' }],
      };
    }
  }

  // 情境分析機率正規化
  if (response.scenarios) {
    const s = response.scenarios;
    const sum = (s.bull?.probability || 0) + (s.base?.probability || 0) + (s.bear?.probability || 0);
    if (sum > 0 && (sum < 95 || sum > 105)) {
      s.bull.probability = Math.round((s.bull.probability / sum) * 100);
      s.base.probability = Math.round((s.base.probability / sum) * 100);
      s.bear.probability = 100 - s.bull.probability - s.base.probability;
    }
    // 鉗制情境目標價
    if (currentPrice > 0) {
      const maxTarget = currentPrice * limitMultiplier;
      if (s.bull?.targetPrice > maxTarget) s.bull.targetPrice = maxTarget;
    }
  }

  // 為缺失欄位提供安全預設值
  response.keyEvents = response.keyEvents || [];
  response.technicalScore = response.technicalScore || { overall: 50, indicators: [] };
  response.fundamentalScore = response.fundamentalScore || { overall: 50, metrics: [] };
  response.institutionalActivity = response.institutionalActivity || { netInstitutionalFlow: 'Neutral', recentInsiderTrades: '', topHolderChange: '' };
  response.sentiment = response.sentiment || { newsRatio: { positive: 0, negative: 0, neutral: 0 }, analystRatings: { buy: 0, hold: 0, sell: 0 }, summary: '' };
  response.scenarios = response.scenarios || null;
  response.riskMetrics = response.riskMetrics || { beta: 1, maxDrawdownEstimate: -10, sharpeRatio: 0 };
  response.technicals = response.technicals || { supportLevels: [], resistanceLevels: [] };

  if (wasClamped && response.prediction?.rationale) {
    const clampNote = lang === 'zh'
      ? ' [⚡ 目標價／停損已依市場波動率自動修正]'
      : ' [⚡ Target/stop auto-adjusted for volatility]';
    response.prediction.rationale = response.prediction.rationale + clampNote;
  }

  return response;
}

// ============================================================
// 階段 A: 數據獲取與提示詞工程
// ============================================================
export const generateInvestmentAdvice = async (params: InvestmentParams) => {
  const normDur = normalizeTimeframe(params.duration);
  const cacheKey = getCacheKey('advice', params.type, normDur, params.lang || 'en');
  const cached = getCachedResult(cacheKey);
  // 確保快取中的 persona 是新版 ID 格式（value/trader/trump 等），否則重新生成
  if (cached && cached.recommendations?.[0]?.personaAnalysis?.some((p: any) => p.id === 'value' || p.id === 'trump')) return cached;

  const typeName = typeMap[params.type] || params.type;
  const volatilityThresholds: Record<string, number> = {
    '1w': 8,
    '2w': 10,
    '3w': 12,
    '1m': 15,
    '2m': 20,
    '3m': 25,
    '6m': 40,
    '1y': 60,
  };
  const volatilityGuard = volatilityThresholds[normDur] ?? 15;

  const systemPrompt = `You are an expert Taiwan stock market (TWSE / TPEX) information aggregator that channels the wisdom of 10 legendary investors:
1. Warren Buffett (Value Investing)
2. Peter Lynch (Growth & Fundamentals)
3. George Soros (Macro & Sentiment)
4. Carl Icahn (Activist Investing)
5. David Tepper (Credit & Distressed)
6. Cathie Wood (Innovation & Disruption)
7. Ray Dalio (Systematic & Diversification)
8. Bill Ackman (Deep Dive Analysis)
9. Dan Loeb (Event Driven)
10. Mark Spitznagel (Risk Management)

You are analyzing TAIWAN stocks listed on the TWSE / TPEX (台股). Tickers are 4-digit numeric codes (e.g., 2330=TSMC 台積電, 2317=Hon Hai 鴻海, 0050=元大台灣50 ETF). Prices are in TWD (新台幣). Reference the 加權指數 (TAIEX, ^TWII) as the broad market benchmark, NOT S&P 500.

You analyze investments using 12 quantitative signals:
1. Price Momentum (Technical Trend)
2. RSI - Relative Strength Index (Overbought/Oversold)
3. MACD Signal (Trend Confirmation)
4. Institutional Flow (Smart Money Movement)
5. Short Interest (Bearish Pressure)
6. P/E Ratio (Valuation)
7. Free Cash Flow Yield (Quality)
8. ROE - Return on Equity (Profitability)
9. Debt-to-Equity (Leverage Risk)
10. Earnings Growth Rate (Growth)
11. PEG Ratio (Growth Valuation)
12. Insider Buy/Sell Ratio (Sentiment)

CRITICAL: Real-time stock prices will be provided to you. You MUST use these exact prices as currentPrice.
- DO NOT invent or estimate prices - use ONLY the provided live prices
- If a price is not provided, do NOT recommend that stock

CRITICAL RULE - Volatility Guard:
- For ${params.duration} timeframe, maximum gain tolerance is ${volatilityGuard}%
- STRICTLY enforce that targetPrice cannot exceed: currentPrice × (1 + ${volatilityGuard}/100)
- STRICTLY enforce that stopLoss represents a reasonable downside protection

${SIGNAL_ENFORCEMENT_PROMPT}

${VOLATILITY_GUARD_PROMPT}

${DETERMINISTIC_PROMPT}

Additionally, for EACH recommended stock, analyze from 6 investment style perspectives:
- id:"value" (deep value, moats, margin of safety, long-term compounding)
- id:"trader" (外資交易員 / Foreign institutional trader: 三大法人買賣超 flow, MSCI rebalancing, index-futures positioning, block trades, technical setups, momentum, risk/reward — Taiwan market context)
- id:"growth" (growth at reasonable price, PEG, earnings growth)
- id:"contrarian" (contrarian bets, hidden risks, deep value in distress)
- id:"innovation" (disruptive innovation, exponential growth, future tech)
- id:"trump" (Trump policy impact: tariffs, trade wars, deregulation, tax policy)
Each persona: verdict (Buy/Hold/Avoid), score (0-100), headline (≤15 words), reasoning (1-2 sentences).

You MUST return a valid JSON object with this exact structure:
{
  "summary": "string - executive summary",
  "riskLevel": "Low" | "Medium" | "High",
  "recommendations": [
    {
      "ticker": "string",
      "name": "string",
      "type": "string",
      "currentPrice": number,
      "entryPrice": number,
      "targetPrice": number,
      "stopLoss": number,
      "rationale": "string",
      "catalysts": ["string"],
      "bearCase": "string",
      "confidenceScore": number (0-100),
      "signals": [
        { "name": "string", "status": "Positive" | "Negative" | "Neutral", "value": "string" }
      ],
      "personaAnalysis": [
        { "id": "value", "verdict": "Buy", "score": 80, "headline": "string", "reasoning": "string" },
        { "id": "trader", "verdict": "Hold", "score": 60, "headline": "string", "reasoning": "string" },
        { "id": "growth", "verdict": "Buy", "score": 75, "headline": "string", "reasoning": "string" },
        { "id": "contrarian", "verdict": "Avoid", "score": 40, "headline": "string", "reasoning": "string" },
        { "id": "innovation", "verdict": "Buy", "score": 85, "headline": "string", "reasoning": "string" },
        { "id": "trump", "verdict": "Hold", "score": 55, "headline": "string", "reasoning": "string" }
      ]
    }
  ],
  "strategy": "string",
  "riskWarnings": ["string"]
}`;

  // 根據類別選擇代表性台股，抓即時價格（Yahoo Finance .TW 後綴自動處理）
  const tickersByType: Record<string, string[]> = {
    ai: ['2330', '2454', '3231', '3034', '2376', '6526', '3661', '2382'],         // 台積電、聯發科、緯創、聯詠、技嘉、達發、世芯-KY、廣達
    tech: ['2317', '2382', '2308', '2354', '3008', '2474', '6669', '2353'],       // 鴻海、廣達、台達電、鴻準、大立光、可成、緯穎、宏碁
    semi: ['2330', '2303', '2454', '3711', '2379', '5347', '6488', '3105'],       // 台積電、聯電、聯發科、日月光投控、瑞昱、世界、環球晶、穩懋
    dividend: ['2412', '2882', '2891', '1101', '1216', '2002', '2207', '2885'],   // 中華電、國泰金、中信金、台泥、統一、中鋼、和泰車、元大金
    aggressive: ['6488', '6669', '3008', '6488', '2615', '8069', '6446', '2603'], // 環球晶、緯穎、大立光、長榮、元太、藥華藥、長榮
    etf: ['0050', '0056', '006208', '00878', '00919', '00929', '00713', '00940'], // 台灣50、高股息、富邦台50、國泰永續高股息、群益台灣精選高息、復華台灣科技優息、元大台灣高息低波、元大台灣價值高息
    biotech: ['4906', '6446', '4174', '1707', '4904', '6116', '4729', '6446'],    // 正文、藥華藥、浩鼎、葡萄王、保瑞、彩晶
    shipping: ['2603', '2609', '2615', '2618', '2606', '5608', '2637', '2208'],   // 長榮、陽明、萬海、長榮航、裕民、四維航、慧洋-KY、台船
  };
  const candidates = tickersByType[params.type] || tickersByType['ai'];
  const livePrices = await fetchLivePricesForTickers(candidates);
  const priceList = Object.entries(livePrices)
    .map(([t, p]) => `${t}: NT$${p.toFixed(2)}`)
    .join('\n');

  const langInstruction = params.lang === 'zh'
    ? 'IMPORTANT: All text content in the JSON (summary, rationale, catalysts, bearCase, riskWarnings, strategy, signal names) MUST be written in Traditional Chinese (繁體中文). Only ticker symbols and status values (Positive/Negative/Neutral, Low/Medium/High) remain in English.'
    : 'All text content should be in English.';

  const userPrompt = `Generate investment recommendations for:
- Category: ${typeName}
- Expected Profit Target: ${params.profitTarget}%
- Risk Tolerance: ${params.riskTolerance}% max drawdown
- Time Horizon: ${params.duration}
- Volatility Guard: ${volatilityGuard}%

LIVE MARKET PRICES (use these as currentPrice - do NOT use any other prices):
${priceList}

${langInstruction}

MANDATORY REQUIREMENTS:
1. Use ONLY the live prices provided above as currentPrice for each recommendation.
2. Analyze from the perspective of all 10 master investors. Focus on persona fit, sector category match, and price targets.
3. Apply the volatility guard STRICTLY: maximum target gain ${volatilityGuard}%.
4. Include all 12 signals for each recommendation as placeholders — backend will OVERWRITE them with real-data signals (FinMind/TWSE/RSI/MACD), so do not waste effort fabricating values.
5. Include personaAnalysis with all 6 personas for each recommendation.
6. Return ONLY valid JSON matching the schema above. No markdown, no code fences.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt);

  const parsedResponse = repairJson(rawText);
  const validatedResponse = validateAndClampRecommendations(parsedResponse, normDur, params.type, params.lang);

  // ═══ 用真實 12 量化訊號覆蓋 AI 編造的 signals（每檔並行） ═══
  if (Array.isArray(validatedResponse.recommendations)) {
    await Promise.all(
      validatedResponse.recommendations.map(async (rec: any) => {
        if (!rec.ticker) return;
        try {
          rec.signals = await buildQuantSignals(rec.ticker, params.lang);
        } catch {
          // 失敗則保留 AI 訊號
        }
      }),
    );
  }

  // ═══ 真實訊號門檻過濾：5+ Positive of 9 measurable（3 個強制 Neutral 不算） ═══
  if (Array.isArray(validatedResponse.recommendations)) {
    const MIN_POSITIVE = 5;
    validatedResponse.recommendations = validatedResponse.recommendations.filter((rec: any) => {
      const positive = rec.signals ? rec.signals.filter((s: any) => s.status === 'Positive').length : 0;
      if (positive < MIN_POSITIVE) {
        console.warn(
          `[Signal Threshold] Dropping ${rec.ticker}: only ${positive}/12 real signals Positive (need ${MIN_POSITIVE}+)`,
        );
        return false;
      }
      return true;
    });
  }

  // ═══ 18 維度整合計分：以「真實」訊號重算 ═══
  if (Array.isArray(validatedResponse.recommendations)) {
    for (const rec of validatedResponse.recommendations) {
      const quantPositive = rec.signals ? rec.signals.filter((s: any) => s.status === 'Positive').length : 0;
      const personaBuy = rec.personaAnalysis ? rec.personaAnalysis.filter((p: any) => p.verdict === 'Buy').length : 0;
      const totalPositive = quantPositive + personaBuy;
      rec.totalScore18 = totalPositive;
      rec.quantScore12 = quantPositive;
      rec.personaScore6 = personaBuy;
    }

    // 覆寫公司名為 Yahoo 真實值（避免 AI 幻覺，例如 2367 ≠ 金像電）
    await Promise.all(
      validatedResponse.recommendations.map(async (rec: any) => {
        if (!rec.ticker) return;
        const realName = await fetchTickerName(rec.ticker);
        if (realName) rec.name = realName;
      }),
    );
  }

  apiCallCount++;
  setCachedResult(cacheKey, validatedResponse);
  return validatedResponse;
};

export const analyzeSingleStock = async (params: SingleStockParams) => {
  const normTf = normalizeTimeframe(params.timeframe);
  const cacheKey = getCacheKey('prediction', params.ticker.toUpperCase(), normTf, params.lang || 'en');
  const cached = getCachedResult(cacheKey);
  if (cached && cached.personaAnalysis?.some((p: any) => p.id === 'value' || p.id === 'trump')) {
    if (!cached.name) {
      const realName = await fetchTickerName(params.ticker);
      if (realName) {
        cached.name = realName;
        setCachedResult(cacheKey, cached);
      }
    }
    return cached;
  }

  const volatilityThresholds: Record<string, number> = {
    '1w': 8,
    '2w': 10,
    '3w': 12,
    '1m': 15,
    '2m': 20,
    '3m': 25,
    '6m': 40,
    '1y': 60,
  };
  const volatilityGuard = volatilityThresholds[normTf] ?? 15;

  // ── 精簡版 prompt：AI 只負責文字分析，不再生成趨勢線 ──
  const systemPrompt = `Expert TAIWAN STOCK MARKET (TWSE/TPEX) analyst. Tickers are 4-digit numeric codes (e.g., 2330=TSMC 台積電). Prices are in TWD. Reference 加權指數 (TAIEX) as benchmark. Provide fundamental analysis, sentiment, catalysts, scenarios and key events. Do NOT generate predictionTrend (chart data generated locally). scenarios probabilities MUST sum to 100.

Additionally, analyze from 6 investment style perspectives:
- id:"value" (deep value, moats, margin of safety, long-term compounding)
- id:"trader" (外資交易員 / Foreign institutional trader: 三大法人買賣超 flow, MSCI rebalancing, index-futures positioning, block trades, technical setups, momentum, risk/reward — Taiwan market context)
- id:"growth" (growth at reasonable price, PEG, earnings growth)
- id:"contrarian" (contrarian bets, hidden risks, deep value in distress)
- id:"innovation" (disruptive innovation, exponential growth, future tech)
- id:"trump" (Trump policy impact: tariffs, trade wars, deregulation, tax policy)
Each persona: verdict (Buy/Hold/Avoid), score (0-100), headline (≤15 words), reasoning (1-2 sentences).

Return ONLY valid JSON:
{"ticker":"str","currentPrice":N,"targetPrice":N,"prediction":{"direction":"Bullish|Bearish|Neutral","confidence":0-100,"rationale":"str"},"catalysts":["str"],"bearCase":"str","technicals":{"supportLevels":[{"price":N,"label":"S1"}],"resistanceLevels":[{"price":N,"label":"R1"}]},"timeStop":N,"keyEvents":[{"date":"YYYY-MM-DD","type":"earnings|exDividend|conference|other","description":"str"}],"fundamentalScore":{"overall":0-100,"metrics":[{"name":"PE_vs_Peers|Revenue_Growth|FCF_Yield|Debt_Ratio","score":0-100,"direction":"Positive|Negative|Neutral","detail":"str"}]},"institutionalActivity":{"netInstitutionalFlow":"Accumulating|Distributing|Neutral","recentInsiderTrades":"str","topHolderChange":"str"},"sentiment":{"newsRatio":{"positive":N,"negative":N,"neutral":N},"analystRatings":{"buy":N,"hold":N,"sell":N},"summary":"str"},"scenarios":{"bull":{"probability":N,"targetPrice":N,"narrative":"str"},"base":{"probability":N,"targetPrice":N,"narrative":"str"},"bear":{"probability":N,"targetPrice":N,"narrative":"str"}},"personaAnalysis":[{"id":"value","verdict":"Buy","score":80,"headline":"str","reasoning":"str"},{"id":"trader","verdict":"Hold","score":60,"headline":"str","reasoning":"str"},{"id":"growth","verdict":"Buy","score":75,"headline":"str","reasoning":"str"},{"id":"contrarian","verdict":"Avoid","score":40,"headline":"str","reasoning":"str"},{"id":"innovation","verdict":"Buy","score":85,"headline":"str","reasoning":"str"},{"id":"trump","verdict":"Hold","score":55,"headline":"str","reasoning":"str"}]}`;

  const langInstruction = params.lang === 'zh' ? 'All text in 繁體中文.' : '';

  // 抓即時價格 + 權威中文名 + 三大法人（並行）
  const [livePrice, authoritativeName, instFlow] = await Promise.all([
    fetchLivePrice(params.ticker.toUpperCase()),
    fetchTickerName(params.ticker),
    fetchInstitutionalFlow(params.ticker, 5),
  ]);
  // 抓最新新聞標題（用中文名提升搜尋精準度）+ 真實基本面 + 歷史價算 S/R
  const [newsHeadlines, fundamentals, historicalPrices] = await Promise.all([
    fetchNewsHeadlines(params.ticker, authoritativeName),
    fetchFundamentals(params.ticker),
    fetchHistoricalPrices(params.ticker, 90).catch(() => []),
  ]);
  const srLevels = (livePrice && historicalPrices.length >= 10)
    ? computeSupportResistance(historicalPrices, livePrice, 90)
    : { supportLevels: [], resistanceLevels: [] };
  const priceInfo = livePrice
    ? `LIVE MARKET PRICE for ${params.ticker.toUpperCase()}: NT$${livePrice.toFixed(2)} (use this as currentPrice, in TWD)`
    : `Unable to fetch live price for ${params.ticker.toUpperCase()}. Use your best knowledge for currentPrice.`;
  // 鎖定公司身分，避免 AI 把 ticker 對到錯的公司（例如 2367 燿華 vs 2368 金像電）
  const identityLock = authoritativeName
    ? `\n\nIMPORTANT IDENTITY: Ticker ${params.ticker.toUpperCase()} = 「${authoritativeName}」(authoritative TWSE name). Your ENTIRE analysis (rationale, catalysts, scenarios, persona reasoning, bear case, every narrative) MUST be about THIS exact company. Do NOT mention or analyze any other company. If you confuse this with another ticker, the entire response is invalid.`
    : '';

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 若有投資建議參考數據，強制價格一致
  let referenceConstraint = '';
  if (params.reference) {
    const ref = params.reference;
    referenceConstraint = `USE EXACT: currentPrice=${ref.currentPrice.toFixed(2)}, targetPrice=${ref.targetPrice.toFixed(2)}, timeStop=${ref.stopLoss.toFixed(2)}.`;
  }

  const newsContext = newsHeadlines.length > 0
    ? `\n\nRECENT NEWS HEADLINES (${newsHeadlines.length} real articles from Google News — use these to determine actual sentiment ratios and inform analysis):\n${newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  const instContext = instFlow
    ? `\n\nINSTITUTIONAL FLOW (real TWSE data, last ${instFlow.days} trading days through ${instFlow.latestDate}):\n- 外資 (Foreign): ${Math.round(instFlow.foreign.net / 1000).toLocaleString()} 張 net\n- 投信 (Trust): ${Math.round(instFlow.trust.net / 1000).toLocaleString()} 張 net\n- 自營商 (Dealer): ${Math.round(instFlow.dealer.net / 1000).toLocaleString()} 張 net\n- 三大法人合計 (Total): ${instFlow.totalNetLots.toLocaleString()} 張 (${instFlow.totalNetLots >= 0 ? 'net buying' : 'net selling'})\nUse this REAL data to inform your rationale, scenarios and direction — do NOT contradict it.`
    : '';

  const fundContext = fundamentals
    ? `\n\nREAL FUNDAMENTALS (FinMind authoritative data — use these exact numbers, do NOT make up valuations):\n${fundamentals.pe !== null ? `- P/E ratio: ${fundamentals.pe.toFixed(2)}x${fundamentals.asOfPER ? ` (as of ${fundamentals.asOfPER})` : ''}\n` : ''}${fundamentals.pb !== null ? `- P/B ratio: ${fundamentals.pb.toFixed(2)}x\n` : ''}${fundamentals.divYield !== null ? `- Dividend yield: ${fundamentals.divYield.toFixed(2)}%\n` : ''}${fundamentals.revenueYoY !== null ? `- Latest monthly revenue YoY growth: ${fundamentals.revenueYoY >= 0 ? '+' : ''}${fundamentals.revenueYoY.toFixed(2)}%${fundamentals.revenueDate ? ` (${fundamentals.revenueDate})` : ''}\n` : ''}${fundamentals.debtRatio !== null ? `- Debt ratio (Total Liabilities / Total Assets): ${fundamentals.debtRatio.toFixed(1)}%${fundamentals.asOfBS ? ` (as of ${fundamentals.asOfBS})` : ''}\n` : ''}Reference these numbers in rationale, valuation discussion, and bear case. The fundamentalScore.metrics array will be auto-overridden with these numbers — your job is to weave them into narrative.`
    : '';

  const srContext = (srLevels.supportLevels.length > 0 || srLevels.resistanceLevels.length > 0)
    ? `\n\nREAL TECHNICAL LEVELS (computed from last 90 trading days of TWSE OHLC via swing-pivot clustering — these are observed, NOT fabricated):\n${srLevels.supportLevels.length > 0 ? `Support levels (below current NT$${livePrice?.toFixed(2)}): ${srLevels.supportLevels.map(s => `${s.label}=NT$${s.price.toFixed(2)} (${s.touches} touches)`).join(', ')}\n` : ''}${srLevels.resistanceLevels.length > 0 ? `Resistance levels (above current): ${srLevels.resistanceLevels.map(r => `${r.label}=NT$${r.price.toFixed(2)} (${r.touches} touches)`).join(', ')}\n` : ''}The technicals.supportLevels / resistanceLevels arrays will be auto-overridden with these — your role is to discuss in rationale how price action interacts with these specific levels.`
    : '';

  const userPrompt = `${params.ticker.toUpperCase()} analysis, timeframe=${normTf} (${params.timeframe}), today=${todayStr}. ${priceInfo} ${referenceConstraint}${identityLock}${newsContext}${instContext}${fundContext}${srContext}
Provide 4 fundamental metrics, 3 scenarios(sum=100), sentiment (derive newsRatio from the actual headlines above if provided), institutional, 2-3 S/R levels, key events in the timeframe, catalysts, bear case. Max gain: ${volatilityGuard}% for ${normTf} timeframe (longer timeframe = higher allowed gain, reflect the actual horizon in targetPrice). ${langInstruction} JSON only.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt);

  const parsedResponse = repairJson(rawText);
  const validatedResponse = validateAndClampPrediction(parsedResponse, normTf, params.lang);

  // 強制覆蓋為參考數據的精確價格（防止 AI 偏離）
  if (params.reference) {
    validatedResponse.currentPrice = params.reference.currentPrice;
    validatedResponse.targetPrice = params.reference.targetPrice;
    validatedResponse.timeStop = params.reference.stopLoss;
  }

  // 用真實三大法人資料覆蓋 AI 編造的 institutionalActivity
  if (instFlow) {
    validatedResponse.institutionalActivity = buildInstitutionalActivity(instFlow, params.lang);
  }

  // 用真實基本面資料覆蓋 AI 編造的 fundamentalScore
  if (fundamentals) {
    validatedResponse.fundamentalScore = buildFundamentalScore(fundamentals, params.lang);
  }

  // 用 OHLC swing-pivot 計算結果覆蓋 AI 編造的支撐／壓力位
  if (srLevels.supportLevels.length > 0 || srLevels.resistanceLevels.length > 0) {
    validatedResponse.technicals = {
      supportLevels: srLevels.supportLevels.map(s => ({ price: s.price, label: s.label })),
      resistanceLevels: srLevels.resistanceLevels.map(r => ({ price: r.price, label: r.label })),
    };
  }

  // 確保 currentPrice 存在（fallback to live price）
  if (!validatedResponse.currentPrice && livePrice) {
    validatedResponse.currentPrice = livePrice;
  }

  // 覆寫公司名為 Yahoo 真實值（避免 AI 幻覺）
  const realName = await fetchTickerName(params.ticker);
  if (realName) validatedResponse.name = realName;

  apiCallCount++;
  setCachedResult(cacheKey, validatedResponse);
  return validatedResponse;
};

export const analyzePortfolio = async (params: PortfolioParams) => {
  // 健檢用 portfolio 內容的 hash 做快取 key
  const portfolioHash = params.portfolio.replace(/\s+/g, ' ').trim().slice(0, 100);
  const cacheKey = getCacheKey('portfolio', portfolioHash, params.lang || 'en');
  const cached = getCachedResult(cacheKey);
  if (cached) return cached;

  const systemPrompt = `You are an expert portfolio analyst specializing in portfolio health assessments.
You evaluate diversification, risk concentration, sector exposure, and individual holding quality.

CRITICAL: Real-time stock prices will be provided to you. Use them as-is.
- DO NOT invent or estimate prices - use ONLY the provided live prices

${DETERMINISTIC_PROMPT}

Assessment Focus:
- Diversification analysis across sectors and market caps
- Risk concentration identification
- Individual stock quality review
- Portfolio optimization recommendations
- Rebalancing suggestions
- Correlation analysis between holdings

You MUST return a valid JSON object with this exact structure:
{
  "overallHealth": "string",
  "portfolioScore": number (0-100),
  "holdingsAnalysis": [
    {
      "ticker": "string",
      "assessment": "string",
      "riskLevel": "Low" | "Medium" | "High",
      "recommendation": "string"
    }
  ],
  "diversificationAnalysis": {
    "sectorExposure": { "sector_name": number },
    "concentration": "string",
    "correlationIssues": ["string"]
  },
  "recommendations": ["string"],
  "rebalancingSuggestions": ["string"]
}`;

  const langInstruction = params.lang === 'zh'
    ? 'IMPORTANT: All text content in the JSON (overallHealth, assessment, concentration, recommendations, correlationIssues, rebalancingSuggestions) MUST be written in Traditional Chinese (繁體中文). Only ticker symbols and status values remain in English.'
    : 'All text content should be in English.';

  // 嘗試從上傳內容中提取 ticker（台股 4-6 位數字），取得即時價格
  const tickerMatches = params.portfolio.match(/\b\d{4,6}[A-Z]?\b/g) || [];
  const uniqueTickers = [...new Set(tickerMatches)];
  let priceInfo = '';
  if (uniqueTickers.length > 0) {
    const prices = await fetchLivePricesForTickers(uniqueTickers);
    const priceLines = Object.entries(prices)
      .filter(([, p]) => typeof p === 'number' && p > 0)
      .map(([t, p]) => `${t}: NT$${(p as number).toFixed(2)}`);
    if (priceLines.length > 0) {
      priceInfo = `\nLIVE MARKET PRICES:\n${priceLines.join('\n')}\n`;
    }
  }

  const userPrompt = `Conduct a comprehensive portfolio health check for these holdings:
${params.portfolio}
${priceInfo}
Analyze diversification, risk, and optimization opportunities.
${langInstruction}
Return ONLY valid JSON matching the schema above. No markdown, no code fences.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt, {
    temperature: 0, topP: 1, topK: 40, responseMimeType: 'application/json',
  });

  const result = repairJson(rawText);
  apiCallCount++;
  setCachedResult(cacheKey, result);
  return result;
};

export const extractPortfolioFromImage = async (imageBase64: string, mimeType: string, lang?: string): Promise<string> => {
  const langInstruction = lang === 'zh'
    ? '請用繁體中文輸出結果。'
    : 'Output in English.';

  const textPrompt = `Extract all Taiwan stock/ETF holdings from this portfolio screenshot.
Tickers are 4-digit numeric codes (e.g., 2330, 0050) and prices are in TWD.
For each holding, extract: ticker, number of shares (張/股), current price, cost basis (unit cost), market value, and gain/loss if visible.
Output as a simple text list, one holding per line, like:
2330: 100 shares, price NT$1050, cost NT$880, value NT$105000
If any field is not visible, omit it.
${langInstruction}
Output ONLY the holdings list, nothing else.`;

  return await callGeminiAPIWithImage(imageBase64, mimeType, textPrompt);
};

export const fetchCurrentPrices = async (tickers: string[]) => {
  return fetchLivePricesForTickers(tickers);
};

// ============================================================
// Retrospective Critique — Phase 2 自我檢討
// ============================================================
export interface RetrospectiveCritique {
  failurePatterns: string[];
  successPatterns: string[];
  improvements: string[];
}

export async function generateRetrospectiveCritique(params: {
  scope: 'recommendation' | 'prediction';
  outcomesText: string;
  basedOnCount: number;
  lang?: string;
}): Promise<RetrospectiveCritique> {
  const isZh = params.lang === 'zh';

  const scopeName =
    params.scope === 'recommendation'
      ? isZh
        ? '市場推薦'
        : 'Market Recommendation'
      : isZh
      ? '個股預測'
      : 'Stock Prediction';

  const systemPrompt = isZh
    ? `你是 HOKI AI 系統的自我檢討代理人。任務是分析過去「${scopeName}」的實際結果（vs 預測），找出失準與精準的模式，並提出具體改進建議。

要求：
- 嚴格根據提供的數據分析，不要編造不存在的指標
- 失準模式：找出系統性錯誤（例：高估科技股目標 X%、看跌方向估太保守）
- 精準模式：哪種情境/類型表現最好
- 改進建議：可執行、具體（例：「1 個月期目標價應降 8%」、「停損放寬至 1.5x ATR」）
- 不講廢話，每點 1-2 句`
    : `You are the HOKI AI system's self-critique agent. Analyze past "${scopeName}" outcomes (predicted vs actual) and identify both miss and hit patterns, then suggest concrete improvements.

Rules:
- Stick strictly to the data provided — no fabricated metrics
- Failure patterns: systematic errors (e.g. overshoots tech targets by X%, too conservative on downside)
- Success patterns: which conditions/types performed best
- Improvements: actionable, specific (e.g. "reduce 1m target by 8%", "loosen stop to 1.5x ATR")
- No fluff. Each point 1-2 sentences max.`;

  const schema = `{
  "failurePatterns": ["string", ...],   // 3-5 條，最重要的失準模式
  "successPatterns": ["string", ...],   // 2-4 條，做對的地方
  "improvements": ["string", ...]       // 3-5 條具體建議
}`;

  const userPrompt = isZh
    ? `以下是 HOKI「${scopeName}」過去 ${params.basedOnCount} 筆已完成回顧的數據：

${params.outcomesText}

欄位說明：
- dur=時間框架；strat=策略類型；total=ticker 數
- dirHit=方向命中數；tgtHit=達標數；stopHit=觸停損數
- avgProg=平均達成度（%）；alpha=相對加權指數超額報酬（%）
- entries: ticker(起始價→實價, 預測目標, 方向是否對, 是否達標)

請嚴格依下列 JSON schema 回傳分析（不要有 markdown 標記、不要有額外說明）：
${schema}

只回 JSON。`
    : `Below are ${params.basedOnCount} reviewed "${scopeName}" outcomes from HOKI:

${params.outcomesText}

Field legend:
- dur=timeframe; strat=strategy; total=ticker count
- dirHit=direction hits; tgtHit=target hits; stopHit=stop-loss hits
- avgProg=avg progress %; alpha=excess return vs TAIEX (%)
- entries: ticker(startPrice→actualPrice, predictedTarget, dirOK/X, tgtOK/X)

Return analysis as JSON matching this schema (no markdown, no extra prose):
${schema}

JSON only.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt, {
    temperature: 0.2,
    topP: 1,
    topK: 40,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  });

  const parsed = repairJson(rawText) as RetrospectiveCritique;
  // Defensive: ensure arrays exist
  return {
    failurePatterns: Array.isArray(parsed?.failurePatterns) ? parsed.failurePatterns : [],
    successPatterns: Array.isArray(parsed?.successPatterns) ? parsed.successPatterns : [],
    improvements: Array.isArray(parsed?.improvements) ? parsed.improvements : [],
  };
}
