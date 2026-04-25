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

// ============================================================
// History
// ============================================================
export const saveTask = (task: InvestmentTask, userId?: string | null) => {
  const key = historyKey(userId);
  const history = getHistory(userId);
  localStorage.setItem(key, JSON.stringify([task, ...history]));
};

export const getHistory = (userId?: string | null): InvestmentTask[] => {
  const data = localStorage.getItem(historyKey(userId));
  return data ? JSON.parse(data) : [];
};

export const removeTask = (id: string, userId?: string | null) => {
  const key = historyKey(userId);
  localStorage.setItem(key, JSON.stringify(getHistory(userId).filter(i => i.id !== id)));
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
};

export const updateWatchlistPrice = (ticker: string, price: string, userId: string) => {
  const updated = getWatchlist(userId).map(item =>
    item.ticker === ticker ? { ...item, currentPrice: price } : item
  );
  localStorage.setItem(watchlistKey(userId), JSON.stringify(updated));
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
