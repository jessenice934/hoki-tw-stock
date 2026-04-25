/**
 * Task Outcome Review — 時間到期後使用者手動觸發「立即檢視」
 *
 * 比對當初預測的 targetPrice / stopLoss / currentPrice 與今天的實價，
 * 計算方向命中、達標進度、停損是否觸發等指標並回傳 TaskOutcome。
 *
 * 此模組純本地計算，不呼叫 Gemini，僅用 Yahoo Finance 抓即時價。
 */
import type { InvestmentTask, OutcomeEntry, TaskOutcome } from './storage';
import { fetchLivePricesForTickers } from './gemini';
import { fetchHistoricalPrices } from './finance';

/** ^TWII（台灣加權指數）用作市場大盤 benchmark */
const BENCHMARK_TICKER = '^TWII';

/**
 * 抓取加權指數從任務建立日到今天的累積報酬 %。
 * 失敗時 throw，由 reviewTask 端 catch 後 graceful skip。
 */
async function fetchBenchmarkReturn(taskDateISO: string): Promise<number> {
  const taskDate = new Date(taskDateISO);
  const daysSince = Math.ceil((Date.now() - taskDate.getTime()) / 86400000);
  // 多抓幾天當緩衝（週末、節慶、抓取延遲）
  const daysToFetch = Math.max(daysSince + 7, 30);

  const prices = await fetchHistoricalPrices(BENCHMARK_TICKER, daysToFetch);
  if (!prices.length) throw new Error('No TAIEX history');

  // 找 taskDate 當天或之後最近的交易日收盤
  const taskDateStr = taskDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const startEntry = prices.find(p => p.date >= taskDateStr);
  if (!startEntry) throw new Error('No TAIEX start price on/after task date');

  // 最新可得的收盤（陣列尾巴）
  const lastEntry = prices[prices.length - 1];
  if (startEntry.close <= 0) throw new Error('Invalid TAIEX start close');

  return ((lastEntry.close - startEntry.close) / startEntry.close) * 100;
}

// 最外層任一個 recommendation 或 prediction 結果都可能形狀不同，用寬鬆 any 接。
interface RawRecommendation {
  ticker?: string;
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

interface RawPrediction {
  ticker?: string;
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

function parseJson(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** 從 task.result 中抽出所有需要比對的 ticker / 價格清單 */
function extractTargets(task: InvestmentTask): RawRecommendation[] {
  const data = parseJson(task.result);
  if (!data) return [];

  if (task.type === 'recommendation') {
    const list: RawRecommendation[] = Array.isArray(data?.recommendations)
      ? data.recommendations
      : [];
    return list.filter(r => r.ticker && typeof r.currentPrice === 'number');
  }

  if (task.type === 'prediction') {
    const p: RawPrediction = data ?? {};
    if (p.ticker && typeof p.currentPrice === 'number') {
      return [p];
    }
  }

  return [];
}

/**
 * 單一 ticker 的 outcome 計算
 * progressPct 定義：
 *   actualPrice 從 startPrice 走到 targetPrice 的百分比
 *   = (actual - start) / (target - start) × 100
 *   看空（target < start）時會自動處理為負值方向
 *   走對方向會是正值、超越目標 >100、反向為負
 */
function computeEntry(
  ticker: string,
  startPrice: number,
  targetPrice: number,
  stopLoss: number,
  actualPrice: number
): OutcomeEntry {
  const bullish = targetPrice >= startPrice; // 預測多空方向
  const priceChangePct = ((actualPrice - startPrice) / startPrice) * 100;

  const directionCorrect = bullish
    ? actualPrice >= startPrice
    : actualPrice <= startPrice;

  const hitTarget = bullish
    ? actualPrice >= targetPrice
    : actualPrice <= targetPrice;

  const hitStop = bullish
    ? actualPrice <= stopLoss
    : actualPrice >= stopLoss;

  const range = targetPrice - startPrice;
  const progressPct =
    range === 0 ? 0 : ((actualPrice - startPrice) / range) * 100;

  return {
    ticker,
    startPrice,
    targetPrice,
    stopLoss,
    actualPrice,
    priceChangePct,
    directionCorrect,
    hitTarget,
    hitStop,
    progressPct,
  };
}

/**
 * 主函式：接收一個 task，回傳 outcome
 * - 僅 recommendation / prediction 支援；healthcheck 不走這條流程
 * - 抓即時價失敗會略過該 ticker（避免一個失敗就整個炸掉）
 */
export async function reviewTask(task: InvestmentTask): Promise<TaskOutcome> {
  const targets = extractTargets(task);
  if (targets.length === 0) {
    throw new Error('No reviewable tickers in this task');
  }

  const tickers = targets.map(t => t.ticker!.toUpperCase());
  const livePrices = await fetchLivePricesForTickers(tickers);

  const entries: OutcomeEntry[] = [];
  for (const t of targets) {
    const ticker = t.ticker!.toUpperCase();
    const actual = livePrices[ticker];
    const start = t.currentPrice ?? 0;
    const target = t.targetPrice ?? start;
    const stop = t.stopLoss ?? start;
    if (!actual || !start) continue;
    entries.push(computeEntry(ticker, start, target, stop, actual));
  }

  if (entries.length === 0) {
    throw new Error('Failed to fetch live prices for review');
  }

  const directionHit = entries.filter(e => e.directionCorrect).length;
  const targetHit = entries.filter(e => e.hitTarget).length;
  const stopHit = entries.filter(e => e.hitStop).length;
  const avgProgress =
    entries.reduce((sum, e) => sum + e.progressPct, 0) / entries.length;

  // ── 相對大盤績效（加權指數 ^TWII） ────────────────────────────────
  // equal-weight 組合報酬
  const portfolioReturn =
    entries.reduce((sum, e) => sum + e.priceChangePct, 0) / entries.length;

  // 加權指數同期報酬：抓取失敗不阻擋 outcome，僅省略 benchmark 欄位
  let benchmarkReturn: number | undefined;
  let alpha: number | undefined;
  try {
    benchmarkReturn = await fetchBenchmarkReturn(task.date);
    alpha = portfolioReturn - benchmarkReturn;
  } catch (err) {
    console.warn('[Outcome] Benchmark (^TWII) fetch failed; skipping vs-market comparison', err);
  }

  return {
    reviewedAt: new Date().toISOString(),
    entries,
    summary: {
      total: entries.length,
      directionHit,
      targetHit,
      stopHit,
      avgProgress: Math.round(avgProgress * 10) / 10,
      portfolioReturn: Math.round(portfolioReturn * 100) / 100,
      ...(benchmarkReturn !== undefined && {
        benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
        alpha: Math.round((alpha as number) * 100) / 100,
      }),
    },
  };
}
