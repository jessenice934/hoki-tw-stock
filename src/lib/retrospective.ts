/**
 * Retrospective stats aggregation — Phase 1
 *
 * 把 history 裡所有有 outcome 的任務聚合成可顯示的統計指標。
 * 純前端計算，不呼叫任何 API。
 */
import type { InvestmentTask, OutcomeEntry, LessonScope } from './storage';

export interface BreakdownRow {
  label: string;          // e.g. "1w" | "balanced"
  total: number;          // ticker 數
  directionHit: number;
  targetHit: number;
  hitRate: number;        // 0-100，方向命中率
  targetRate: number;     // 0-100，達標率
}

export interface TickerEntry {
  ticker: string;
  taskDate: string;       // ISO
  duration?: string;
  startPrice: number;
  targetPrice: number;
  actualPrice: number;
  priceChangePct: number;
  directionCorrect: boolean;
  hitTarget: boolean;
  progressPct: number;
}

export interface RetrospectiveStats {
  scope: LessonScope;
  taskCount: number;            // 有 outcome 的任務數
  tickerCount: number;          // 全部 ticker entry 數（recommendation 一筆可有多支）

  // 整體命中率
  directionHit: number;
  targetHit: number;
  stopHit: number;
  directionRate: number;        // %
  targetRate: number;           // %
  stopRate: number;             // %
  avgProgress: number;          // %

  // 大盤對比（只看有 alpha 的任務平均）
  avgAlpha: number | null;      // %
  alphaTaskCount: number;       // 有 alpha 數據的任務數

  // 細分
  byTimeframe: BreakdownRow[];
  byStrategy: BreakdownRow[];   // recommendation 才有
  byDirection: BreakdownRow[];  // bullish vs bearish

  // 排行
  topPerformers: TickerEntry[]; // 最猛 5
  worstPerformers: TickerEntry[]; // 最慘 5

  // 所有已回顧的 ticker entries（給對照表用，最新在前）
  allEntries: TickerEntry[];
}

/** 把 task + entries 攤平成 ticker-level rows，方便排行/分組 */
function flattenEntries(tasks: InvestmentTask[]): TickerEntry[] {
  const rows: TickerEntry[] = [];
  for (const task of tasks) {
    if (!task.outcome) continue;
    for (const e of task.outcome.entries) {
      rows.push({
        ticker: e.ticker,
        taskDate: task.date,
        duration: task.params?.duration,
        startPrice: e.startPrice,
        targetPrice: e.targetPrice,
        actualPrice: e.actualPrice,
        priceChangePct: e.priceChangePct,
        directionCorrect: e.directionCorrect,
        hitTarget: e.hitTarget,
        progressPct: e.progressPct,
      });
    }
  }
  return rows;
}

function buildBreakdown(
  rows: TickerEntry[],
  groupBy: (r: TickerEntry) => string | null
): BreakdownRow[] {
  const map = new Map<string, { total: number; dir: number; tgt: number }>();
  for (const r of rows) {
    const key = groupBy(r);
    if (!key) continue;
    const cur = map.get(key) || { total: 0, dir: 0, tgt: 0 };
    cur.total += 1;
    if (r.directionCorrect) cur.dir += 1;
    if (r.hitTarget) cur.tgt += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({
      label,
      total: v.total,
      directionHit: v.dir,
      targetHit: v.tgt,
      hitRate: v.total ? Math.round((v.dir / v.total) * 1000) / 10 : 0,
      targetRate: v.total ? Math.round((v.tgt / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** 主聚合函式：吃 history + scope，吐 stats */
export function aggregateStats(
  history: InvestmentTask[],
  scope: LessonScope
): RetrospectiveStats {
  // 篩選對應 scope 且有 outcome 的任務
  const tasks = history.filter(
    (t) => t.type === scope && !!t.outcome && t.outcome.entries.length > 0
  );

  const rows = flattenEntries(tasks);

  // 整體
  const tickerCount = rows.length;
  const directionHit = rows.filter((r) => r.directionCorrect).length;
  const targetHit = rows.filter((r) => r.hitTarget).length;
  const stopHit = tasks.reduce((s, t) => s + (t.outcome?.summary.stopHit || 0), 0);

  const directionRate = tickerCount
    ? Math.round((directionHit / tickerCount) * 1000) / 10
    : 0;
  const targetRate = tickerCount
    ? Math.round((targetHit / tickerCount) * 1000) / 10
    : 0;
  const stopRate = tickerCount
    ? Math.round((stopHit / tickerCount) * 1000) / 10
    : 0;
  const avgProgress = tickerCount
    ? Math.round((rows.reduce((s, r) => s + r.progressPct, 0) / tickerCount) * 10) /
      10
    : 0;

  // Alpha vs 加權指數 (^TWII)
  const alphaTasks = tasks.filter((t) => typeof t.outcome?.summary.alpha === 'number');
  const avgAlpha =
    alphaTasks.length > 0
      ? Math.round(
          (alphaTasks.reduce((s, t) => s + (t.outcome!.summary.alpha as number), 0) /
            alphaTasks.length) *
            100
        ) / 100
      : null;

  // 細分
  const byTimeframe = buildBreakdown(rows, (r) => r.duration || null);

  const byStrategy =
    scope === 'recommendation'
      ? buildBreakdown(rows, (r) => {
          // recommendation 的策略類型存在 task.params.type
          const task = tasks.find((t) =>
            t.outcome?.entries.some((e) => e.ticker === r.ticker)
          );
          return task?.params?.type || null;
        })
      : [];

  const byDirection = buildBreakdown(rows, (r) =>
    r.targetPrice >= r.startPrice ? 'bullish' : 'bearish'
  );

  // 排行（依 priceChangePct）
  const sorted = [...rows].sort((a, b) => b.priceChangePct - a.priceChangePct);
  const topPerformers = sorted.slice(0, 5);
  const worstPerformers = sorted.slice(-5).reverse();

  // 全部 entries — 依任務日期降冪（最新在前），同日內依 ticker 字母
  const allEntries = [...rows].sort((a, b) => {
    const dt = new Date(b.taskDate).getTime() - new Date(a.taskDate).getTime();
    return dt !== 0 ? dt : a.ticker.localeCompare(b.ticker);
  });

  return {
    scope,
    taskCount: tasks.length,
    tickerCount,
    directionHit,
    targetHit,
    stopHit,
    directionRate,
    targetRate,
    stopRate,
    avgProgress,
    avgAlpha,
    alphaTaskCount: alphaTasks.length,
    byTimeframe,
    byStrategy,
    byDirection,
    topPerformers,
    worstPerformers,
    allEntries,
  };
}

/**
 * 把 outcome 摘要序列化成 Gemini critique 的輸入。
 * 控制長度避免吃太多 token：只送關鍵欄位，每筆一行。
 */
export function serializeOutcomesForCritique(
  history: InvestmentTask[],
  scope: LessonScope
): string {
  const tasks = history.filter(
    (t) => t.type === scope && !!t.outcome && t.outcome.entries.length > 0
  );

  const lines: string[] = [];
  for (const task of tasks) {
    const dur = task.params?.duration || 'unknown';
    const strat = task.params?.type || '';
    const dateStr = task.date.slice(0, 10);
    const reviewedStr = task.outcome!.reviewedAt.slice(0, 10);
    const s = task.outcome!.summary;
    lines.push(
      `[${dateStr}→${reviewedStr}] dur=${dur}${strat ? ` strat=${strat}` : ''} ` +
        `total=${s.total} dirHit=${s.directionHit}/${s.total} ` +
        `tgtHit=${s.targetHit}/${s.total} stopHit=${s.stopHit}/${s.total} ` +
        `avgProg=${s.avgProgress}% ` +
        (typeof s.alpha === 'number' ? `alpha=${s.alpha}% ` : '') +
        `entries: ` +
        task.outcome!.entries
          .map(
            (e: OutcomeEntry) =>
              `${e.ticker}(${e.startPrice.toFixed(1)}→${e.actualPrice.toFixed(
                1
              )}, target ${e.targetPrice.toFixed(1)}, ${
                e.directionCorrect ? 'dirOK' : 'dirX'
              },${e.hitTarget ? 'tgtOK' : 'tgtX'})`
          )
          .join('; ')
    );
  }
  return lines.join('\n');
}

export const MIN_OUTCOMES_FOR_CRITIQUE = 5;
