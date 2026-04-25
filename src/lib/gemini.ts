// Gemini calls go through /api/gemini (server-side keys, never in browser bundle)
import { normalizeTwTicker, fetchTickerName } from './finance';

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
};

const VOLATILITY_GUARD_PROMPT = `VOLATILITY GUARD REQUIREMENTS:
- This rule applies CONSISTENTLY across all recommendations and predictions
- Maximum allowed gain is defined by timeframe: 1w=8%, 2w=10%, 3w=12%, 1m=15%
- If projected price exceeds this, CLAMP it to the maximum allowed
- Stop loss must be reasonable and within limits
- Apply this rule to EVERY recommendation - NO EXCEPTIONS
- Consistency check: All stocks analyzed in the same session should use identical volatility thresholds
- Cross-reference all prices: currentPrice + (currentPrice × maxGain%) = capped targetPrice`;

const SIGNAL_ENFORCEMENT_PROMPT = `SIGNAL SCORING ENFORCEMENT:
- At least 8 out of 12 quantitative signals must score positively (score >= 0.6) for ANY recommendation
- This is a STRICT THRESHOLD for the 12 quantitative signals
- 6 additional style-based scoring dimensions will be applied separately in post-processing
- Combined 18-dimension score (12 quant + 6 style) requires 12+ positive for final inclusion
- REPEAT: Only recommend stocks where 8+ quantitative signals are positive
- Do not make exceptions or override this rule
- Apply this rule to EVERY stock - NO EXCEPTIONS`;

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
// 階段 C-2: 數學鉗制 (Mathematical Clamping)
// getLimitMultiplier 階梯函數
// ============================================================
function getLimitMultiplier(duration: string): number {
  // 跟 VOLATILITY_GUARD 保持同步（2026-04-23 校準：1w 5→8, 2w 8→10, 3w 10→12, 1m 12→15）
  const multipliers: Record<string, number> = {
    '1w': 1.08,
    '2w': 1.10,
    '3w': 1.12,
    '1m': 1.15,
  };
  return multipliers[duration] || 1.15;
}

// ============================================================
// 階段 C: 後處理過濾器 (Post-processing Filters)
// ============================================================
function validateAndClampRecommendations(response: any, duration: string, sectorType?: string, lang?: string): any {
  const durationKey = duration as keyof typeof VOLATILITY_GUARD;
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

  // C-3: 量化訊號門檻過濾（12 量化訊號中需 8+ positive）
  // 注意：6 風格觀點在 persona analysis 後才整合為 18 維總分
  const validRecommendations = filteredRecommendations.filter((rec: any) => {
    const positiveSignals = rec.signals ? rec.signals.filter((sig: any) => sig.status === 'Positive').length : 0;
    if (positiveSignals < 8) {
      console.warn(
        `[Signal Threshold] Filtering out ${rec.ticker}: only ${positiveSignals}/12 quant signals positive (need 8+)`
      );
      return false;
    }
    return true;
  }).map((rec: any) => {
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
  const durationKey = duration as keyof typeof VOLATILITY_GUARD;
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
  const cacheKey = getCacheKey('advice', params.type, params.duration, params.lang || 'en');
  const cached = getCachedResult(cacheKey);
  // 確保快取中的 persona 是新版 ID 格式（value/trader/trump 等），否則重新生成
  if (cached && cached.recommendations?.[0]?.personaAnalysis?.some((p: any) => p.id === 'value' || p.id === 'trump')) return cached;

  const typeName = typeMap[params.type] || params.type;
  // 跟 VOLATILITY_GUARD 保持同步（2026-04-23 校準）
  const volatilityThresholds: Record<string, number> = {
    '1w': 8,
    '2w': 10,
    '3w': 12,
    '1m': 15,
  };
  const volatilityGuard = volatilityThresholds[params.duration] || 12;

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
2. Analyze from the perspective of all 10 master investors. Cross-reference all 12 quantitative signals.
3. ONLY recommend stocks where 8+ signals are positive (status='Positive').
4. Apply the volatility guard STRICTLY: maximum target gain ${volatilityGuard}%.
5. Include all 12 signals for each recommendation.
6. Include personaAnalysis with all 6 personas for each recommendation.
7. Return ONLY valid JSON matching the schema above. No markdown, no code fences.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt);

  const parsedResponse = repairJson(rawText);
  const validatedResponse = validateAndClampRecommendations(parsedResponse, params.duration, params.type, params.lang);

  // ═══ 18 維度整合計分：12 量化訊號 + 6 風格觀點（persona now included in main prompt） ═══
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
  const cacheKey = getCacheKey('prediction', params.ticker.toUpperCase(), params.timeframe, params.lang || 'en');
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

  // 跟 VOLATILITY_GUARD 保持同步（2026-04-23 校準）
  const volatilityThresholds: Record<string, number> = {
    '1w': 8,
    '2w': 10,
    '3w': 12,
    '1m': 15,
  };
  const volatilityGuard = volatilityThresholds[params.timeframe] || 12;

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

  // 抓即時價格 + 權威中文名（並行）
  const [livePrice, authoritativeName] = await Promise.all([
    fetchLivePrice(params.ticker.toUpperCase()),
    fetchTickerName(params.ticker),
  ]);
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

  const userPrompt = `${params.ticker.toUpperCase()} analysis, ${params.timeframe}, today=${todayStr}. ${priceInfo} ${referenceConstraint}${identityLock}
Provide 4 fundamental metrics, 3 scenarios(sum=100), sentiment, institutional, 2-3 S/R levels, key events in the timeframe, catalysts, bear case. Max gain: ${volatilityGuard}% for this timeframe. ${langInstruction} JSON only.`;

  const rawText = await callGeminiAPI(systemPrompt, userPrompt);

  const parsedResponse = repairJson(rawText);
  const validatedResponse = validateAndClampPrediction(parsedResponse, params.timeframe, params.lang);

  // 強制覆蓋為參考數據的精確價格（防止 AI 偏離）
  if (params.reference) {
    validatedResponse.currentPrice = params.reference.currentPrice;
    validatedResponse.targetPrice = params.reference.targetPrice;
    validatedResponse.timeStop = params.reference.stopLoss;
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
