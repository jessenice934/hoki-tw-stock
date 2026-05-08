import {
  cloudUpsertTask,
  cloudPatchTask,
  cloudDeleteTask,
  cloudFetchHistory,
  cloudUpsertWatchlistItem,
  cloudDeleteWatchlistItem,
  cloudFetchWatchlist,
  cloudUpsertLesson,
  cloudFetchLesson,
} from './cloudStorage';

export interface OutcomeEntry {
  ticker: string;
  startPrice: number;           // 起始價（建立分析時的 currentPrice）
  targetPrice: number;
  stopLoss: number;
  actualPrice: number;          // 檢視時實價
  priceChangePct: number;       // 相對起始價的變化 %
  directionCorrect: boolean;    // 走的方向是否符合預測（target > startPrice 代表看多）
  hitTarget: boolean;           // actualPrice 是否達到 targetPrice
  hitStop: boolean;             // actualPrice 是否跌破 stopLoss
  progressPct: number;          // 走到目標的進度 %（負值＝反向 / >100＝超越）
}

export interface TaskOutcome {
  reviewedAt: string;           // ISO timestamp
  entries: OutcomeEntry[];
  summary: {
    total: number;
    directionHit: number;
    targetHit: number;
    stopHit: number;
    avgProgress: number;        // 平均進度（排除反向）
    // ── 相對大盤（加權指數 ^TWII）表現 ────────────────────
    // 三個欄位都是 optional：加權指數歷史價抓取失敗時整組跳過，不阻擋 outcome 渲染。
    portfolioReturn?: number;   // 組合平均漲跌 %（equal-weight，= entries priceChangePct 平均）
    benchmarkReturn?: number;   // 同期加權指數漲跌 %
    alpha?: number;             // portfolioReturn - benchmarkReturn
  };
}

export interface InvestmentTask {
  id: string;
  type: 'recommendation' | 'healthcheck' | 'prediction';
  date: string;
  params?: any;
  result: string;
  outcome?: TaskOutcome;        // Option B：時間到後由使用者手動觸發「立即檢視」寫入
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  addedAt: string;
  targetPrice?: string;
  entryPrice?: string;
  currentPrice?: string;
}

// ============================================================
// Key helpers — 依帳號隔離
// ============================================================
function historyKey(userId?: string | null) {
  return userId ? `stock_ai_history_${userId}` : 'stock_ai_history_guest';
}
function watchlistKey(userId: string) {
  return `stock_ai_watchlist_${userId}`;
}
function dailyKey(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `daily_analysis_${userId}_${today}`;
}
/** 手動刪除的 task ID tombstone — 防止雲端 sync 把刪除的資料還原 */
function tombstoneKey(userId: string) {
  return `stock_ai_deleted_ids_${userId}`;
}
function getTombstones(userId: string): Set<string> {
  try {
    const data = localStorage.getItem(tombstoneKey(userId));
    return new Set(data ? JSON.parse(data) : []);
  } catch { return new Set(); }
}
function addTombstone(id: string, userId: string) {
  const set = getTombstones(userId);
  set.add(id);
  // 最多保留 500 筆，避免無限增長
  const arr = [...set].slice(-500);
  localStorage.setItem(tombstoneKey(userId), JSON.stringify(arr));
}

// ============================================================
// History
// ============================================================
export const saveTask = (task: InvestmentTask, userId?: string | null) => {
  const key = historyKey(userId);
  const history = getHistory(userId);
  localStorage.setItem(key, JSON.stringify([task, ...history]));
  if (userId) cloudUpsertTask(task, userId).catch(() => {});
};

export const getHistory = (userId?: string | null): InvestmentTask[] => {
  const data = localStorage.getItem(historyKey(userId));
  return data ? JSON.parse(data) : [];
};

export const removeTask = (id: string, userId?: string | null) => {
  const key = historyKey(userId);
  localStorage.setItem(key, JSON.stringify(getHistory(userId).filter(i => i.id !== id)));
  if (userId) {
    addTombstone(id, userId); // 防止 sync 把雲端刪除的資料還原
    cloudDeleteTask(id, userId).catch(() => {});
  }
};

export const clearHistory = (userId?: string | null) => {
  localStorage.removeItem(historyKey(userId));
};

/** 更新單一 task（用於寫入 outcome） */
export const updateTask = (
  id: string,
  patch: Partial<InvestmentTask>,
  userId?: string | null
) => {
  const key = historyKey(userId);
  const history = getHistory(userId);
  const next = history.map(t => (t.id === id ? { ...t, ...patch } : t));
  localStorage.setItem(key, JSON.stringify(next));
  if (userId) cloudPatchTask(id, patch, userId).catch(() => {});
};

// ============================================================
// System Lesson — Phase 2 AI 自我檢討（按類型分開：recommendation / prediction）
// ============================================================
export type LessonScope = 'recommendation' | 'prediction';

export interface SystemLesson {
  scope: LessonScope;
  generatedAt: string;            // ISO timestamp
  basedOnCount: number;           // 分析了多少筆 outcome
  failurePatterns: string[];      // 失準模式
  successPatterns: string[];      // 精準模式
  improvements: string[];         // 改進建議
}

function lessonKey(scope: LessonScope, userId?: string | null) {
  return userId
    ? `system_lesson_${scope}_${userId}`
    : `system_lesson_${scope}_guest`;
}

export const getSystemLesson = (
  scope: LessonScope,
  userId?: string | null
): SystemLesson | null => {
  const data = localStorage.getItem(lessonKey(scope, userId));
  return data ? JSON.parse(data) : null;
};

export const saveSystemLesson = (
  lesson: SystemLesson,
  userId?: string | null
) => {
  localStorage.setItem(lessonKey(lesson.scope, userId), JSON.stringify(lesson));
  if (userId) cloudUpsertLesson(lesson, userId).catch(() => {});
};

export const clearSystemLesson = (
  scope: LessonScope,
  userId?: string | null
) => {
  localStorage.removeItem(lessonKey(scope, userId));
};

// ============================================================
// Watchlist（僅登入用戶）
// ============================================================
export const addToWatchlist = (item: WatchlistItem, userId: string) => {
  const list = getWatchlist(userId);
  if (!list.find(i => i.ticker === item.ticker)) {
    localStorage.setItem(watchlistKey(userId), JSON.stringify([item, ...list]));
    cloudUpsertWatchlistItem(item, userId).catch(() => {});
  }
};

export const getWatchlist = (userId?: string | null): WatchlistItem[] => {
  if (!userId) return [];
  const data = localStorage.getItem(watchlistKey(userId));
  return data ? JSON.parse(data) : [];
};

export const removeFromWatchlist = (ticker: string, userId: string) => {
  localStorage.setItem(
    watchlistKey(userId),
    JSON.stringify(getWatchlist(userId).filter(i => i.ticker !== ticker))
  );
  cloudDeleteWatchlistItem(ticker, userId).catch(() => {});
};

export const updateWatchlistPrice = (ticker: string, price: string, userId: string) => {
  const updated = getWatchlist(userId).map(item =>
    item.ticker === ticker ? { ...item, currentPrice: price } : item
  );
  localStorage.setItem(watchlistKey(userId), JSON.stringify(updated));
  const updatedItem = updated.find(i => i.ticker === ticker);
  if (updatedItem) cloudUpsertWatchlistItem(updatedItem, userId).catch(() => {});
};

// ============================================================
// Trial（未登入，5 次總量）
// ============================================================
export interface TrialState {
  active: boolean;
  analysesUsed: number;
  maxAnalyses: number;
  startedAt: string;
}

export const getTrialState = (): TrialState => {
  const data = localStorage.getItem('trial_state');
  if (data) return JSON.parse(data);
  return { active: false, analysesUsed: 0, maxAnalyses: 5, startedAt: '' };
};

export const startTrial = (): TrialState => {
  const state: TrialState = {
    active: true,
    analysesUsed: 0,
    maxAnalyses: 5,
    startedAt: new Date().toISOString(),
  };
  localStorage.setItem('trial_state', JSON.stringify(state));
  return state;
};

export const incrementAnalysesUsed = (): TrialState => {
  let state = getTrialState();
  // Auto-start trial on first use — no need to click a button
  if (!state.active) {
    state = startTrial();
  }
  state.analysesUsed += 1;
  localStorage.setItem('trial_state', JSON.stringify(state));
  return state;
};

// ============================================================
// Daily quota（免費會員，每天 10 次）
// ============================================================
const FREE_DAILY_LIMIT = 10;

export const getDailyAnalysisCount = (userId: string): number => {
  const data = localStorage.getItem(dailyKey(userId));
  return data ? parseInt(data, 10) : 0;
};

export const incrementDailyAnalysis = (userId: string): void => {
  const count = getDailyAnalysisCount(userId);
  localStorage.setItem(dailyKey(userId), String(count + 1));
};

export const getDailyRemaining = (userId: string): number => {
  return Math.max(0, FREE_DAILY_LIMIT - getDailyAnalysisCount(userId));
};

// ============================================================
// canAnalyze / getAnalysesRemaining
// ============================================================
export const canAnalyze = (currentUser: any): boolean => {
  if (!currentUser) {
    const trial = getTrialState();
    // 未登入：直接依使用次數判斷，不需要先「啟動」
    return trial.analysesUsed < trial.maxAnalyses;
  }
  return true; // 初期開放：登入後無限制（未來可依 Pro 方案調整）
};

export const getAnalysesRemaining = (currentUser: any): number => {
  if (!currentUser) {
    const trial = getTrialState();
    return Math.max(0, trial.maxAnalyses - trial.analysesUsed);
  }
  return Infinity; // 初期開放：登入後無限制
};

// ============================================================
// Cloud Sync — 登入時呼叫，把雲端資料合併到 localStorage
// 策略：以 ID 為主鍵做 union merge，不覆蓋、不刪除，只增補
// ============================================================

/**
 * 同步歷史紀錄：
 * 1. 雲端沒資料 → 把本地資料上傳（舊裝置遷移）
 * 2. 雲端有資料 → 把本地獨有的紀錄補上去，再把合併結果存回 localStorage
 */
export async function syncHistoryFromCloud(userId: string): Promise<void> {
  try {
    const cloudRecords = await cloudFetchHistory(userId);
    const local = getHistory(userId);

    if (cloudRecords.length === 0) {
      // 新裝置或首次使用雲端 — 上傳本地資料
      if (local.length > 0) {
        await Promise.allSettled(local.map(t => cloudUpsertTask(t, userId)));
      }
      return;
    }

    // 找出本地有、雲端沒有的紀錄 → 上傳
    const cloudIds = new Set(cloudRecords.map(r => r.id));
    const localOnly = local.filter(r => !cloudIds.has(r.id));
    if (localOnly.length > 0) {
      await Promise.allSettled(localOnly.map(t => cloudUpsertTask(t, userId)));
    }

    // 合併後按日期排序，寫回 localStorage
    // 排除曾被手動刪除的 ID（tombstone），避免雲端 sync 還原已刪資料
    const tombstones = getTombstones(userId);
    const merged = [...cloudRecords, ...localOnly]
      .filter(r => !tombstones.has(r.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    localStorage.setItem(historyKey(userId), JSON.stringify(merged));
  } catch (e) {
    console.warn('[sync] syncHistoryFromCloud failed:', e);
  }
}

/**
 * 同步自選股：
 * 雲端為主，本地獨有的補上雲端。
 */
export async function syncWatchlistFromCloud(userId: string): Promise<void> {
  try {
    const cloudItems = await cloudFetchWatchlist(userId);
    const local = getWatchlist(userId);

    if (cloudItems.length === 0) {
      if (local.length > 0) {
        await Promise.allSettled(local.map(item => cloudUpsertWatchlistItem(item, userId)));
      }
      return;
    }

    const cloudTickers = new Set(cloudItems.map(i => i.ticker));
    const localOnly = local.filter(i => !cloudTickers.has(i.ticker));
    if (localOnly.length > 0) {
      await Promise.allSettled(localOnly.map(item => cloudUpsertWatchlistItem(item, userId)));
    }

    const merged = [...cloudItems, ...localOnly];
    localStorage.setItem(watchlistKey(userId), JSON.stringify(merged));
  } catch (e) {
    console.warn('[sync] syncWatchlistFromCloud failed:', e);
  }
}

/**
 * 同步 AI 自學紀錄（recommendation / prediction 兩種）
 */
export async function syncLessonsFromCloud(userId: string): Promise<void> {
  try {
    const scopes: LessonScope[] = ['recommendation', 'prediction'];
    await Promise.allSettled(
      scopes.map(async scope => {
        const cloudLesson = await cloudFetchLesson(scope, userId);
        if (cloudLesson) {
          localStorage.setItem(lessonKey(scope, userId), JSON.stringify(cloudLesson));
        } else {
          const local = getSystemLesson(scope, userId);
          if (local) cloudUpsertLesson(local, userId).catch(() => {});
        }
      })
    );
  } catch (e) {
    console.warn('[sync] syncLessonsFromCloud failed:', e);
  }
}
