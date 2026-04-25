import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Loader,
  ChevronRight,
  Upload,
  Lock,
} from 'lucide-react';
import HomeHero from '@/components/HomeHero';
import Logo from '@/components/Logo';
import RecommendationCard from '@/components/RecommendationCard';
import HealthCheckCard from '@/components/HealthCheckCard';
import WatchlistSection from '@/components/WatchlistSection';
import HistorySection from '@/components/HistorySection';
import RetrospectiveSection from '@/components/RetrospectiveSection';
import StockPredictionChart from '@/components/StockPredictionChart';
import LoginModal from '@/components/LoginModal';
import ProfileMenu from '@/components/ProfileMenu';
import { fetchCurrentUser, logout as authLogout, onAuthChange, User } from '@/lib/auth';
import {
  generateInvestmentAdvice,
  analyzePortfolio,
  fetchCurrentPrices,
  analyzeSingleStock,
  extractPortfolioFromImage,
} from '@/lib/gemini';
import {
  saveTask,
  getHistory,
  removeTask,
  updateTask,
  getWatchlist,
  removeFromWatchlist,
  addToWatchlist,
  updateWatchlistPrice,
  canAnalyze,
  getAnalysesRemaining,
  incrementAnalysesUsed,
  incrementDailyAnalysis,
  getDailyRemaining,
  getTrialState,
  startTrial,
} from '@/lib/storage';
import { reviewTask } from '@/lib/outcome';
import { identifyUser, resetAnalytics, track } from '@/lib/analytics';
import TrialBanner from '@/components/TrialBanner';
import RecommendationSkeleton from '@/components/RecommendationSkeleton';
import AnalysisProgress from '@/components/AnalysisProgress';
import LegalConsentModal from '@/components/LegalConsentModal';
import LegalTextModal, { LegalDocType } from '@/components/LegalTextModal';
import ResultDisclaimerBanner from '@/components/ResultDisclaimerBanner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';
import {
  fetchHistoricalPrices,
  runMonteCarloSimulation,
  calculateATR,
  calculateHistoricalVolatility,
  calculateBeta,
  calculateEntryTiming,
  calculateRSI,
  calculateSMA,
  calculateGranville,
  calculateVolumeProfile,
  MonteCarloResult,
  EntryTimingResult,
} from '@/lib/finance';
import { useDropzone } from 'react-dropzone';

type Tab = 'home' | 'recommend' | 'prediction' | 'health' | 'watchlist' | 'history' | 'retrospective';

/** 將原始 API 錯誤轉為用戶友善訊息 */
function friendlyError(msg: string, lang: string): string {
  const isZh = lang === 'zh';
  if (msg.includes('All API keys exhausted') || msg.includes('all retry attempts failed')) {
    return isZh
      ? 'AI 服務暫時無法使用，請稍後再試。'
      : 'AI service is temporarily unavailable. Please try again later.';
  }
  if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
    const isDaily = msg.toLowerCase().includes('daily') || msg.toLowerCase().includes('per day');
    return isZh
      ? (isDaily
          ? 'AI 服務今日免費額度已用完，請明天再試。'
          : 'AI 請求太頻繁，請稍等 1 分鐘後再試。')
      : (isDaily
          ? 'Daily AI quota exhausted. Please try again tomorrow.'
          : 'Too many requests. Please wait a minute and try again.');
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('400')) {
    return isZh
      ? 'API 金鑰無效或已過期，請聯繫管理員。'
      : 'API key is invalid or expired. Please contact the administrator.';
  }
  if (
    msg.includes('503') ||
    msg.toLowerCase().includes('overloaded') ||
    msg.toLowerCase().includes('high demand') ||
    msg.toLowerCase().includes('unavailable')
  ) {
    return isZh
      ? 'AI 模型目前使用人數較多，請稍等約 30 秒後重試一次。'
      : 'AI model is busy right now. Please wait ~30 seconds and try again.';
  }
  if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
    return isZh
      ? 'AI 回應時間過長已中斷，請稍候再試一次（通常一分鐘內就會恢復）。'
      : 'AI response took too long and was cut off. Please try again shortly (usually recovers within a minute).';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return isZh
      ? 'AI 模型暫時無法使用，請稍後再試。'
      : 'AI model is temporarily unavailable. Please try again later.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
    return isZh
      ? '網路連線失敗，請檢查網路後重試。'
      : 'Network connection failed. Please check your connection and try again.';
  }
  if (msg.includes('Failed to parse')) {
    return isZh
      ? 'AI 回應格式異常，請重試一次。'
      : 'AI response format error. Please try again.';
  }
  // 截短過長的原始錯誤
  if (msg.length > 120) {
    return msg.slice(0, 120) + '...';
  }
  return msg;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState(() => getHistory(null));
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<ReturnType<typeof getWatchlist>>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedDuration, setSelectedDuration] = useState('1w');
  const [customDuration, setCustomDuration] = useState('');
  const [selectedType, setSelectedType] = useState('ai');
  const [predictionTicker, setPredictionTicker] = useState('');
  const [predictionDuration, setPredictionDuration] = useState('1w');
  const [predictionCustomDuration, setPredictionCustomDuration] = useState('');
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [entryTimingResult, setEntryTimingResult] = useState<EntryTimingResult | null>(null);
  const [volatilityMetrics, setVolatilityMetrics] = useState<{ atr: number; historicalVol: number; beta: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [showTrialWarning, setShowTrialWarning] = useState(false);
  const [trialWarningMessage, setTrialWarningMessage] = useState('');
  const [trialWarningVariant, setTrialWarningVariant] = useState<'trial' | 'daily'>('trial');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [trialState, setTrialState] = useState(getTrialState);

  // 法律同意 Gate
  const [legalConsentOpen, setLegalConsentOpen] = useState(() => {
    return localStorage.getItem('hoki_legal_consent') !== '1';
  });
  const [legalTextOpen, setLegalTextOpen] = useState(false);
  const [legalTextType, setLegalTextType] = useState<LegalDocType>('terms');

  const refreshTrialState = () => {
    setTrialState(getTrialState());
    if (currentUser) {
      setDailyRemaining(getDailyRemaining(currentUser.id));
    }
  };

  // 在分析完成後顯示適當的額度提醒（登入者看日額度、未登入者看體驗額度）
  const maybeShowQuotaWarning = () => {
    const remaining = getAnalysesRemaining(currentUser);
    if (remaining > 0 && remaining <= 3) {
      if (currentUser) {
        setTrialWarningVariant('daily');
        setTrialWarningMessage(t('daily.warning.remaining', { count: remaining }));
      } else {
        setTrialWarningVariant('trial');
        setTrialWarningMessage(t('trial.warning.remaining', { count: remaining }));
      }
      setShowTrialWarning(true);
    }
  };

  const [dailyRemaining, setDailyRemaining] = useState<number>(10);

  // 關掉瀏覽器對 scroll 位置的自動記憶，每次重整/返回都從頁面頂端開始
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    // Initial session + subscribe to auth state changes (login/logout/switch account)
    fetchCurrentUser().then((user) => {
      setCurrentUser(user);
      setHistory(getHistory(user?.id));
      setWatchlist(getWatchlist(user?.id));
      if (user) {
        setDailyRemaining(getDailyRemaining(user.id));
        identifyUser(user);
      }
    });
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user);
      setHistory(getHistory(user?.id));
      setWatchlist(getWatchlist(user?.id));
      if (user) {
        setDailyRemaining(getDailyRemaining(user.id));
        identifyUser(user);
      } else {
        // 登出：把後續事件切回匿名
        resetAnalytics();
      }
    });
    return unsubscribe;
  }, []);

  const handleRecommendation = async (formData: any) => {
    // Check if user can analyze
    if (!canAnalyze(currentUser)) {
      if (currentUser) {
        setError(t('daily.limit.reached'));
      } else {
        setLoginOpen(true);
      }
      return;
    }

    setLoading(true);
    setError(null);
    track('analysis_started', {
      type: 'recommendation',
      duration: formData.duration,
      strategy: formData.type,
      is_logged_in: !!currentUser,
    });
    try {
      const advice = await generateInvestmentAdvice({
        type: formData.type,
        profitTarget: parseFloat(formData.profitTarget),
        riskTolerance: parseFloat(formData.riskTolerance),
        duration: formData.duration,
        lang: i18n.language,
      });
      setResult({ type: 'recommendation', data: advice });
      const task = {
        id: Date.now().toString(),
        type: 'recommendation' as const,
        date: new Date().toISOString(),
        params: formData,
        result: JSON.stringify(advice),
      };
      saveTask(task, currentUser?.id);
      if (!currentUser) { incrementAnalysesUsed(); refreshTrialState(); }
      else { incrementDailyAnalysis(currentUser.id); refreshTrialState(); }
      setHistory(getHistory(currentUser?.id));

      track('analysis_completed', {
        type: 'recommendation',
        duration: formData.duration,
        result_count: advice?.recommendations?.length ?? 0,
      });
      maybeShowQuotaWarning();
    } catch (err) {
      track('analysis_failed', { type: 'recommendation' });
      setError(friendlyError(err instanceof Error ? err.message : 'Failed to generate recommendations', i18n.language));
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async (portfolioText: string) => {
    // Check if user can analyze
    if (!canAnalyze(currentUser)) {
      if (currentUser) {
        setError(t('daily.limit.reached'));
      } else {
        setLoginOpen(true);
      }
      return;
    }

    setLoading(true);
    setError(null);
    track('analysis_started', {
      type: 'healthcheck',
      is_logged_in: !!currentUser,
    });
    try {
      const health = await analyzePortfolio({ portfolio: portfolioText, lang: i18n.language });
      setResult({ type: 'health', data: health });
      const task = {
        id: Date.now().toString(),
        type: 'healthcheck' as const,
        date: new Date().toISOString(),
        params: { portfolio: portfolioText },
        result: JSON.stringify(health),
      };
      saveTask(task, currentUser?.id);
      if (!currentUser) { incrementAnalysesUsed(); refreshTrialState(); }
      else { incrementDailyAnalysis(currentUser.id); refreshTrialState(); }
      setHistory(getHistory(currentUser?.id));

      track('analysis_completed', {
        type: 'healthcheck',
        holdings_count: health?.holdingsAnalysis?.length ?? 0,
        score: health?.portfolioScore,
      });
      maybeShowQuotaWarning();
    } catch (err) {
      track('analysis_failed', { type: 'healthcheck' });
      setError(friendlyError(err instanceof Error ? err.message : 'Failed to analyze portfolio', i18n.language));
    } finally {
      setLoading(false);
    }
  };

  const handleAddToWatchlist = (recommendation: any) => {
    if (!currentUser) { setLoginOpen(true); return; }
    const item = {
      ticker: recommendation.ticker,
      name: recommendation.name,
      addedAt: new Date().toISOString(),
      entryPrice: recommendation.entryPrice?.toString(),
      targetPrice: recommendation.targetPrice?.toString(),
      currentPrice: recommendation.currentPrice?.toString(),
    };
    addToWatchlist(item, currentUser!.id);
    setWatchlist(getWatchlist(currentUser?.id));
  };

  const handleRefreshPrices = async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    try {
      const tickers = watchlist.map(w => w.ticker);
      const prices = await fetchCurrentPrices(tickers);
      for (const [ticker, price] of Object.entries(prices)) {
        if (typeof price === 'number') {
          updateWatchlistPrice(ticker, price.toFixed(2), currentUser!.id);
        }
      }
      setWatchlist(getWatchlist(currentUser?.id));
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handlePrediction = async () => {
    if (!predictionTicker.trim()) return;

    // Check if user can analyze
    if (!canAnalyze(currentUser)) {
      if (currentUser) {
        setError(t('daily.limit.reached'));
      } else {
        setLoginOpen(true);
      }
      return;
    }

    setLoading(true);
    setError(null);
    setPredictionResult(null);
    setMonteCarloResult(null);
    setEntryTimingResult(null);
    setVolatilityMetrics(null);

    const dur = predictionDuration === 'custom' ? predictionCustomDuration : predictionDuration;
    const tickerUpper = predictionTicker.trim().toUpperCase();

    track('analysis_started', {
      type: 'prediction',
      ticker: tickerUpper,
      duration: dur,
      is_logged_in: !!currentUser,
    });

    // Parse duration to days
    const parseDays = (d: string): number => {
      if (d === '1w') return 7;
      if (d === '2w') return 14;
      if (d === '3w') return 21;
      if (d === '1m') return 30;
      const match = d.match(/(\d+)\s*(月|month|m)/i);
      if (match) return parseInt(match[1]) * 30;
      const weekMatch = d.match(/(\d+)\s*(週|week|w)/i);
      if (weekMatch) return parseInt(weekMatch[1]) * 7;
      const dayMatch = d.match(/(\d+)\s*(天|day|d)/i);
      if (dayMatch) return parseInt(dayMatch[1]);
      return 14;
    };
    const forecastDays = parseDays(dur);

    try {
      // ═══ Phase 1: 本地計算（免費、即時）═══
      // 同步取歷史數據 + 加權指數基準（365 天：為了支援 Granville 的 SMA200 計算）
      const [stockHistory, spyHistory] = await Promise.all([
        fetchHistoricalPrices(tickerUpper, 365),
        fetchHistoricalPrices('^TWII', 365),
      ]);

      const rawLastClose = stockHistory.length > 0
        ? stockHistory[stockHistory.length - 1].close
        : 0;
      const currentPrice = Number.isFinite(rawLastClose) && rawLastClose > 0 ? rawLastClose : 0;

      if (currentPrice === 0) {
        throw new Error(i18n.language === 'zh' ? '無法取得最新收盤價，請稍後再試' : 'Could not fetch latest close price. Please try again.');
      }

      // 本地技術指標
      let localTechnicalScore: any = null;
      let localRiskMetrics: any = null;
      let localAtr = 0;
      let localVol = 0;
      let localBeta = 1;

      if (stockHistory.length > 15) {
        try { localAtr = calculateATR(stockHistory); } catch { /* */ }
        try { localVol = calculateHistoricalVolatility(stockHistory); } catch { /* */ }
        try { localBeta = calculateBeta(stockHistory, spyHistory); } catch { /* */ }
        setVolatilityMetrics({ atr: localAtr, historicalVol: localVol, beta: localBeta });

        // 建立本地技術面評分
        try {
          const rsi = calculateRSI(stockHistory);
          const sma20 = calculateSMA(stockHistory, 20);
          const sma50 = calculateSMA(stockHistory, 50);
          const latestSma20 = sma20[sma20.length - 1];
          const latestSma50 = sma50.length > 0 ? sma50[sma50.length - 1] : latestSma20;
          const vp = calculateVolumeProfile(stockHistory);

          // RSI 評分
          const rsiScore = rsi < 30 ? 85 : rsi < 40 ? 70 : rsi > 70 ? 15 : rsi > 60 ? 35 : 50;
          const rsiDir = rsi < 40 ? 'Bullish' : rsi > 60 ? 'Bearish' : 'Neutral';

          // SMA 排列評分
          const aboveSma20 = currentPrice > latestSma20;
          const sma20Above50 = latestSma20 > latestSma50;
          const maScore = aboveSma20 && sma20Above50 ? 80 : aboveSma20 ? 60 : !aboveSma20 ? 25 : 45;
          const maDir = maScore >= 60 ? 'Bullish' : maScore <= 35 ? 'Bearish' : 'Neutral';

          // Bollinger Band 評分（用 SMA20 ± 2*stddev 近似）
          const last20Closes = stockHistory.slice(-20).map(p => p.close);
          const mean20 = last20Closes.reduce((s, v) => s + v, 0) / 20;
          const std20 = Math.sqrt(last20Closes.reduce((s, v) => s + (v - mean20) ** 2, 0) / 20);
          const bbUpper = mean20 + 2 * std20;
          const bbLower = mean20 - 2 * std20;
          const bbRange = bbUpper - bbLower;
          const bbPos = bbRange > 0 ? (currentPrice - bbLower) / bbRange : 0.5;
          const bbScore = bbPos < 0.2 ? 80 : bbPos > 0.8 ? 20 : 50;
          const bbDir = bbPos < 0.3 ? 'Bullish' : bbPos > 0.7 ? 'Bearish' : 'Neutral';

          // Volume 趨勢評分（用作 MACD 替代）
          const volScore = vp.volumeRatio > 1.3 && currentPrice > latestSma20 ? 75 : vp.volumeRatio > 1.3 ? 30 : 50;
          const volDir = volScore >= 60 ? 'Bullish' : volScore <= 35 ? 'Bearish' : 'Neutral';

          // Granville 八大法則（需要 SMA200，資料不足時自動 fallback 為中性）
          const granville = calculateGranville(stockHistory, currentPrice);
          const granvilleDetail = granville.rule
            ? (i18n.language === 'zh'
                ? `${granville.signal === 'buy' ? '買點' : '賣點'} ${granville.rule}　MA200: $${granville.sma200.toFixed(2)}`
                : `${granville.signal === 'buy' ? 'Buy' : 'Sell'} Signal ${granville.rule} · MA200: $${granville.sma200.toFixed(2)}`)
            : (i18n.language === 'zh'
                ? `無明確訊號　MA200: $${granville.sma200.toFixed(2)}`
                : `No clear signal · MA200: $${granville.sma200.toFixed(2)}`);

          const overall = Math.round(
            rsiScore * 0.25 + maScore * 0.25 + granville.score * 0.25 + bbScore * 0.125 + volScore * 0.125,
          );

          localTechnicalScore = {
            overall,
            indicators: [
              { name: 'RSI', score: rsiScore, direction: rsiDir, detail: `RSI(14) = ${rsi.toFixed(1)}` },
              { name: 'MA_Alignment', score: maScore, direction: maDir, detail: `SMA20: $${latestSma20.toFixed(2)}, SMA50: $${latestSma50.toFixed(2)}` },
              { name: 'Granville', score: granville.score, direction: granville.direction, detail: granvilleDetail },
              { name: 'Bollinger', score: bbScore, direction: bbDir, detail: `BB Position: ${(bbPos * 100).toFixed(0)}%` },
              { name: 'MACD', score: volScore, direction: volDir, detail: `Volume Ratio: ${vp.volumeRatio.toFixed(2)}x` },
            ],
          };

          localRiskMetrics = {
            beta: localBeta,
            maxDrawdownEstimate: localVol * 100 * Math.sqrt(forecastDays / 252) * 1.5,
            sharpeRatio: stockHistory.length > 30 ? (() => {
              const returns = [];
              for (let i = 1; i < stockHistory.length; i++) {
                returns.push(stockHistory[i].close / stockHistory[i - 1].close - 1);
              }
              const avgR = returns.reduce((s, r) => s + r, 0) / returns.length;
              const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - avgR) ** 2, 0) / returns.length);
              return stdR > 0 ? (avgR * 252) / (stdR * Math.sqrt(252)) : 0;
            })() : 0,
          };
        } catch { /* graceful fallback */ }

        // Monte Carlo 模擬
        const mc = runMonteCarloSimulation(
          currentPrice,
          stockHistory,
          forecastDays,
          500,
          undefined, // targetPrice not known yet
          undefined,
        );
        setMonteCarloResult(mc);

        // 用 MC 中位數路徑生成預測趨勢線
        const predictionTrend = mc.dates.map((date, i) => ({
          date,
          price: mc.percentiles.p50[i],
          upperBand: mc.percentiles.p75[i],
          lowerBand: mc.percentiles.p25[i],
        }));

        // 進場時機（先用空 support levels，AI 分析後會更新）
        const entry = calculateEntryTiming(stockHistory, currentPrice, []);
        setEntryTimingResult(entry);

        // ═══ 先建立本地結果，讓畫面立即顯示 ═══
        const mcTarget = mc.finalPriceDistribution.median;
        const mcDirection = mcTarget > currentPrice ? 'Bullish' : mcTarget < currentPrice ? 'Bearish' : 'Neutral';
        const localResult: any = {
          ticker: tickerUpper,
          currentPrice,
          targetPrice: mcTarget,
          prediction: {
            direction: mcDirection,
            confidence: Math.round(mc.probabilityAboveTarget || 50),
            rationale: '',
          },
          predictionTrend,
          catalysts: [],
          bearCase: '',
          technicals: { supportLevels: [], resistanceLevels: [] },
          timeStop: mc.finalPriceDistribution.p5,
          keyEvents: [],
          technicalScore: localTechnicalScore,
          fundamentalScore: null,
          institutionalActivity: null,
          sentiment: null,
          scenarios: null,
          riskMetrics: localRiskMetrics,
        };
        setPredictionResult(localResult);
        setAiAnalyzing(true);

        // ═══ Phase 2: AI 分析（非阻塞，豐富文字內容）═══
        // 查找歷史參考：只在「同 timeframe」且「24 小時內」才對齊市場推薦價格
        // 超過時間或 timeframe 不同 → 不套用 reference，AI 重新評估（局勢可能已改變）
        const REFERENCE_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours
        let reference: any;
        const recentHistory = getHistory(currentUser?.id);
        const now = Date.now();
        for (const item of recentHistory) {
          if (item.type !== 'recommendation') continue;
          // timeframe 必須相同
          if (item.params?.duration !== dur) continue;
          // 必須在 24 小時內產生
          const itemTime = new Date(item.date).getTime();
          if (isNaN(itemTime) || now - itemTime > REFERENCE_FRESHNESS_MS) continue;
          try {
            const parsed = JSON.parse(item.result);
            const matchRec = parsed.recommendations?.find((r: any) => r.ticker === tickerUpper);
            if (matchRec) {
              reference = {
                currentPrice: matchRec.currentPrice,
                entryPrice: matchRec.entryPrice,
                targetPrice: matchRec.targetPrice,
                stopLoss: matchRec.stopLoss,
                duration: dur,
              };
              break;
            }
          } catch { /* */ }
        }

        try {
          const aiResult = await analyzeSingleStock({ ticker: tickerUpper, timeframe: dur, lang: i18n.language, reference });

          // 用 AI 目標價重新生成趨勢線（結合 AI 方向 + MC 波動性）
          const aiTarget = aiResult.targetPrice || localResult.targetPrice;
          const aiStop = aiResult.timeStop || localResult.timeStop;
          const mcUpdatedForTrend = runMonteCarloSimulation(
            currentPrice, stockHistory, forecastDays, 500,
            aiTarget, aiStop,
          );

          // 生成有方向性的趨勢線：MC 波動 + 漸進式漂移到 AI 目標
          // 開頭 MC 權重高（自然波動），結尾目標權重高（逼近目標價）
          const mcDailyNoise: number[] = [0]; // 提取 MC 的日間波動模式
          for (let i = 1; i < mcUpdatedForTrend.percentiles.p50.length; i++) {
            const prev = mcUpdatedForTrend.percentiles.p50[i - 1];
            const curr = mcUpdatedForTrend.percentiles.p50[i];
            mcDailyNoise.push(prev > 0 ? (curr / prev - 1) : 0);
          }

          const updatedTrend = mcUpdatedForTrend.dates.map((date, i) => {
            const n = mcUpdatedForTrend.dates.length;
            const progress = i / (n - 1 || 1);
            // 基準路徑：平滑漂移到目標
            const basePath = currentPrice + (aiTarget - currentPrice) * (1 - Math.pow(1 - progress, 1.5));
            // 加入 MC 的每日波動噪音
            const noise = mcDailyNoise[i] || 0;
            const noiseScale = currentPrice * 0.008; // ~0.8% 日波動
            const price = basePath + noise * noiseScale * (n - 1);
            // Band 隨時間擴大
            const bandWidth = currentPrice * 0.015 * (1 + progress * 3);
            return {
              date,
              price,
              upperBand: price + bandWidth,
              lowerBand: price - bandWidth,
            };
          });

          // 合併 AI 文字分析 + 本地圖表數據
          const mergedResult = {
            ...localResult,
            name: aiResult.name || localResult.name,
            targetPrice: aiTarget,
            prediction: {
              direction: aiResult.prediction?.direction || localResult.prediction.direction,
              confidence: aiResult.prediction?.confidence || localResult.prediction.confidence,
              rationale: aiResult.prediction?.rationale || '',
            },
            catalysts: aiResult.catalysts || [],
            bearCase: aiResult.bearCase || '',
            technicals: aiResult.technicals || localResult.technicals,
            timeStop: aiStop,
            keyEvents: aiResult.keyEvents || [],
            fundamentalScore: aiResult.fundamentalScore || null,
            institutionalActivity: aiResult.institutionalActivity || null,
            sentiment: aiResult.sentiment || null,
            scenarios: aiResult.scenarios || null,
            technicalScore: localTechnicalScore || aiResult.technicalScore,
            riskMetrics: localRiskMetrics || aiResult.riskMetrics,
            predictionTrend: updatedTrend,
            personaAnalysis: aiResult.personaAnalysis || null,
          };
          setPredictionResult(mergedResult);
          setAiAnalyzing(false);

          // 更新 MC 結果（已含 target/stop 機率）
          setMonteCarloResult(mcUpdatedForTrend);

          // 用 AI 的支撐位更新進場時機
          const supportLevels = (aiResult.technicals?.supportLevels || []).map((s: any) => s.price);
          if (supportLevels.length > 0) {
            const updatedEntry = calculateEntryTiming(stockHistory, currentPrice, supportLevels);
            setEntryTimingResult(updatedEntry);
          }

          // 存完整合併結果
          const task = {
            id: Date.now().toString(),
            type: 'prediction' as const,
            date: new Date().toISOString(),
            params: { ticker: tickerUpper, duration: dur },
            result: JSON.stringify(mergedResult),
          };
          saveTask(task, currentUser?.id);
          if (!currentUser) { incrementAnalysesUsed(); refreshTrialState(); }
          else { incrementDailyAnalysis(currentUser.id); refreshTrialState(); }
          setHistory(getHistory(currentUser?.id));

          track('analysis_completed', {
            type: 'prediction',
            ticker: tickerUpper,
            duration: dur,
            direction: mergedResult.prediction?.direction,
            confidence: mergedResult.prediction?.confidence,
            ai_enriched: true,
          });
          maybeShowQuotaWarning();
        } catch (aiErr) {
          setAiAnalyzing(false);
          // AI analysis failed — local results already displayed
          // AI 失敗也沒關係，本地結果已經顯示
          const task = {
            id: Date.now().toString(),
            type: 'prediction' as const,
            date: new Date().toISOString(),
            params: { ticker: tickerUpper, duration: dur },
            result: JSON.stringify(localResult),
          };
          saveTask(task, currentUser?.id);
          if (!currentUser) { incrementAnalysesUsed(); refreshTrialState(); }
          else { incrementDailyAnalysis(currentUser.id); refreshTrialState(); }
          setHistory(getHistory(currentUser?.id));

          track('analysis_completed', {
            type: 'prediction',
            ticker: tickerUpper,
            duration: dur,
            ai_enriched: false, // AI 失敗只有本地結果
          });
          maybeShowQuotaWarning();
        }
      } else {
        throw new Error(i18n.language === 'zh' ? '無法取得歷史數據，請確認股票代號是否正確' : 'Cannot fetch historical data. Please verify the ticker symbol.');
      }
    } catch (err) {
      track('analysis_failed', { type: 'prediction', ticker: tickerUpper });
      setError(friendlyError(err instanceof Error ? err.message : 'Failed to generate prediction', i18n.language));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: Tab) => {
    if (loading) return; // 分析進行中，禁止切換頁籤
    setActiveTab(tab);
    setResult(null);
    setError(null);
    setUploadedFile(null);
    setPredictionResult(null);
    setMonteCarloResult(null);
    setEntryTimingResult(null);
    setVolatilityMetrics(null);
    setAiAnalyzing(false);
    // 每次切換 tab / 回首頁 / 點 logo → 回到頁面頂端
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  /**
   * 從其他頁面（推薦卡、健檢卡、自選股）跳到「個股預測」並自動填入 ticker。
   * 少一次手動打字 / 複製貼上。
   */
  const handleAnalyzeTicker = (ticker: string) => {
    if (loading) return; // 分析進行中不跳轉
    switchTab('prediction');
    setPredictionTicker(ticker.toUpperCase());
  };

  const navItems = [
    { id: 'recommend' as Tab, label: t('nav.recommend') },
    { id: 'prediction' as Tab, label: t('nav.prediction') },
    { id: 'health' as Tab, label: t('nav.healthcheck') },
    { id: 'watchlist' as Tab, label: t('nav.watchlist') },
    { id: 'history' as Tab, label: t('nav.history') },
    { id: 'retrospective' as Tab, label: t('nav.retrospective') },
  ];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="absolute inset-0 -z-10 atmosphere"></div>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 items-center justify-between px-8 py-3 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <motion.button
          onClick={() => switchTab('home')}
          className="flex items-center gap-2.5"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Logo size={36} className="rounded-xl" />
          <span className="text-lg font-bold tracking-[0.08em] text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>HOKI</span>
        </motion.button>

        <div className="flex items-center gap-1">
          {navItems.map(({ id, label }) => (
            <motion.button
              key={id}
              onClick={() => switchTab(id)}
              disabled={loading && activeTab !== id}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === id
                  ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500'
                  : loading
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              )}
              whileHover={loading ? {} : { y: -1 }}
              whileTap={loading ? {} : { scale: 0.97 }}
            >
              {label}
            </motion.button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {!currentUser && trialState.analysesUsed < trialState.maxAnalyses && (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-50 text-blue-600 border border-blue-200">
              {t('trial.status', { used: trialState.analysesUsed, max: trialState.maxAnalyses })}
            </span>
          )}
          {/* 初期開放：登入後不顯示額度 badge */}
          {currentUser ? (
            <ProfileMenu
              user={currentUser}
              onLogout={() => {
                void authLogout();
              }}
            />
          ) : (
            <motion.button
              onClick={() => setLoginOpen(true)}
              className="btn-primary text-sm font-semibold"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t('login')}
            </motion.button>
          )}
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200/60">
        <div className="flex items-center justify-between px-4 py-3">
          <motion.button
            onClick={() => switchTab('home')}
            className="flex items-center gap-2.5"
            whileTap={{ scale: 0.98 }}
          >
            <Logo size={36} className="rounded-xl" />
            <span className="text-lg font-bold tracking-[0.08em] text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>HOKI</span>
          </motion.button>
          <div className="flex items-center gap-2">
            {!currentUser && trialState.analysesUsed < trialState.maxAnalyses && (
              <span className="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-blue-50 text-blue-600 border border-blue-200">
                {trialState.maxAnalyses - trialState.analysesUsed}/{trialState.maxAnalyses}
              </span>
            )}
            {/* 初期開放：登入後不顯示額度 badge */}
            {currentUser ? (
              <ProfileMenu
                user={currentUser}
                onLogout={() => {
                  void authLogout();
                }}
              />
            ) : (
              <motion.button
                onClick={() => setLoginOpen(true)}
                className="btn-primary px-3 py-1.5 text-xs font-semibold"
                whileTap={{ scale: 0.98 }}
              >
                {t('login')}
              </motion.button>
            )}
          </div>
        </div>
        <div className="flex justify-center px-1.5 pb-2 gap-0.5 overflow-x-auto no-scrollbar">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              disabled={loading && activeTab !== id}
              className={cn(
                'px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0',
                activeTab === id
                  ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500'
                  : loading
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <div className="md:pt-16 pt-24 pb-8">
        <AnimatePresence mode="wait">
          {/* HOME */}
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <HomeHero
                onNavigate={switchTab}
                currentUser={currentUser}
                trialState={trialState}
                onStartTrial={() => {
                  startTrial();
                  refreshTrialState();
                  setHistory(getHistory(currentUser?.id));
                  setActiveTab('recommend');
                }}
              />
            </motion.div>
          )}

          {/* RECOMMEND */}
          {activeTab === 'recommend' && (
            <motion.div
              key="recommend"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                {!result ? (
                  <motion.div
                    className="glass-card p-6 md:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                      {t('nav.recommend')}
                    </h1>
                    <p className="text-sm text-slate-400 mb-6">{t('hero.subtitle')}</p>

                    <div className="space-y-6">
                      {/* Stock Type */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-500 mb-2">
                          {t('form.type')}
                        </label>
                        <select
                          value={selectedType}
                          onChange={(e) => setSelectedType(e.target.value)}
                          disabled={loading}
                          className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3.5 pr-10 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="ai">{t('form.type.ai')}</option>
                          <option value="tech">{t('form.type.tech')}</option>
                          <option value="semi">{t('form.type.semi')}</option>
                          <option value="dividend">{t('form.type.dividend')}</option>
                          <option value="aggressive">{t('form.type.aggressive')}</option>
                          <option value="etf">{t('form.type.etf')}</option>
                          <option value="biotech">{t('form.type.biotech')}</option>
                          <option value="shipping">{t('form.type.shipping')}</option>
                        </select>
                      </div>

                      {/* Duration Pills */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-500 mb-3">
                          {t('form.duration')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(['1w', '2w', '3w', '1m', 'custom'] as const).map((dur) => (
                            <button
                              key={dur}
                              type="button"
                              onClick={() => !loading && setSelectedDuration(dur)}
                              disabled={loading}
                              className={cn(
                                'px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                                selectedDuration === dur
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md'
                                  : loading
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              )}
                            >
                              {t(`form.duration.${dur}`)}
                            </button>
                          ))}
                        </div>

                        {selectedDuration === 'custom' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3"
                          >
                            <input
                              type="text"
                              value={customDuration}
                              onChange={(e) => setCustomDuration(e.target.value)}
                              disabled={loading}
                              placeholder={t('form.duration.custom.placeholder')}
                              className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </motion.div>
                        )}

                        <p className="text-xs text-slate-400 mt-2">{t('form.duration.note')}</p>
                      </div>

                      {/* Submit */}
                      <motion.button
                        onClick={() => {
                          handleRecommendation({
                            type: selectedType,
                            duration: selectedDuration === 'custom' ? customDuration : selectedDuration,
                          });
                        }}
                        disabled={loading}
                        className="btn-primary w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {loading ? (
                          <Loader className="w-5 h-5 animate-spin" />
                        ) : (
                          <Zap className="w-5 h-5" />
                        )}
                        {t('form.submit')}
                      </motion.button>

                    </div>
                  </motion.div>
                ) : result.type === 'recommendation' ? (
                  <div className="space-y-6">
                    <ResultDisclaimerBanner />
                    <div className="glass-card p-6">
                      <h2 className="text-2xl font-bold text-slate-900 mb-4">
                        {t('ai.result.title')}
                      </h2>
                      <p className="text-slate-600 mb-4">{result.data.summary}</p>
                      <p className="text-sm text-slate-500">
                        <strong>{t('ai.result.risk')}:</strong> {result.data.riskLevel}
                      </p>
                    </div>

                    <div className="grid gap-6">
                      {result.data.recommendations?.map((rec: any, idx: number) => (
                        <RecommendationCard
                          key={idx}
                          recommendation={rec}
                          onAddToWatchlist={() => handleAddToWatchlist(rec)}
                          isWatched={watchlist.some(w => w.ticker === rec.ticker)}
                          onAnalyze={handleAnalyzeTicker}
                        />
                      ))}
                    </div>

                    {result.data.riskWarnings?.length > 0 && (
                      <div className="glass-card p-6 border-red-200 bg-red-50">
                        <h3 className="text-lg font-bold text-red-700 mb-3">{t('ai.result.riskwarnings')}</h3>
                        <ul className="space-y-2">
                          {result.data.riskWarnings.map((warning: string, idx: number) => (
                            <li key={idx} className="text-sm text-red-600 flex items-start gap-2">
                              <span className="text-red-400 mt-1">&bull;</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <motion.button
                      onClick={() => setResult(null)}
                      className="btn-outline w-full"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t('ai.new.analysis')}
                    </motion.button>
                  </div>
                ) : null}

                {error && (
                  <motion.div className="glass-card p-6 border-red-200 bg-red-50 mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-red-700"><strong>{t('ai.error')}</strong> {error}</p>
                  </motion.div>
                )}

                {loading && (
                  <div className="mt-6 space-y-6">
                    {/* 分階段進度條 */}
                    <AnalysisProgress
                      lang={i18n.language}
                      variant="recommendation"
                      estimatedSeconds={40}
                    />
                    {/* 三張 skeleton 卡片 */}
                    <div className="grid gap-6">
                      {[0, 1, 2].map((i) => (
                        <RecommendationSkeleton key={i} delay={i * 0.08} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* PREDICTION */}
          {activeTab === 'prediction' && (
            <motion.div
              key="prediction"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                {(!predictionResult || loading || aiAnalyzing) ? (
                  <motion.div
                    className="glass-card p-6 md:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                      {t('prediction.title')}
                    </h1>
                    <p className="text-sm text-slate-400 mb-6">{t('prediction.subtitle')}</p>

                    <div className="space-y-6">
                      {/* Ticker Input */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-500 mb-2">
                          {t('prediction.ticker')}
                        </label>
                        <input
                          type="text"
                          value={predictionTicker}
                          onChange={(e) => setPredictionTicker(
                            e.target.value
                              .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                              .replace(/\u3000/g, ' ')
                              .toUpperCase()
                          )}
                          disabled={loading}
                          placeholder={t('prediction.ticker.placeholder')}
                          className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors font-data disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* Duration Pills */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-500 mb-3">
                          {t('prediction.duration')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(['1w', '2w', '3w', '1m', 'custom'] as const).map((dur) => (
                            <button
                              key={dur}
                              type="button"
                              onClick={() => !loading && setPredictionDuration(dur)}
                              disabled={loading}
                              className={cn(
                                'px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                                predictionDuration === dur
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md'
                                  : loading
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              )}
                            >
                              {t(`form.duration.${dur}`)}
                            </button>
                          ))}
                        </div>

                        {predictionDuration === 'custom' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3"
                          >
                            <input
                              type="text"
                              value={predictionCustomDuration}
                              onChange={(e) => setPredictionCustomDuration(e.target.value)}
                              disabled={loading}
                              placeholder={t('form.duration.custom.placeholder')}
                              className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </motion.div>
                        )}

                        <p className="text-xs text-slate-400 mt-2">{t('form.duration.note')}</p>
                      </div>

                      {/* Submit */}
                      <motion.button
                        onClick={handlePrediction}
                        disabled={loading || !predictionTicker.trim()}
                        className="btn-primary w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {loading ? (
                          <Loader className="w-5 h-5 animate-spin" />
                        ) : (
                          <Zap className="w-5 h-5" />
                        )}
                        {t('prediction.submit')}
                      </motion.button>

                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    <ResultDisclaimerBanner />
                    <ErrorBoundary>
                      <StockPredictionChart
                        result={predictionResult}
                        monteCarloResult={monteCarloResult}
                        entryTimingResult={entryTimingResult}
                        volatilityMetrics={volatilityMetrics}
                        aiAnalyzing={aiAnalyzing}
                        onAddToWatchlist={() => {
                          if (!currentUser) { setLoginOpen(true); return; }
                          const item = {
                            ticker: predictionResult.ticker,
                            name: predictionResult.ticker,
                            addedAt: new Date().toISOString(),
                            targetPrice: predictionResult.targetPrice?.toString(),
                            currentPrice: predictionResult.currentPrice?.toString(),
                          };
                          addToWatchlist(item, currentUser!.id);
                          setWatchlist(getWatchlist(currentUser?.id));
                        }}
                        isWatched={watchlist.some(w => w.ticker === predictionResult.ticker)}
                      />
                    </ErrorBoundary>
                    <motion.button
                      onClick={() => { setPredictionResult(null); setPredictionTicker(''); }}
                      className="btn-outline w-full"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t('prediction.new')}
                    </motion.button>
                  </div>
                )}

                {error && (
                  <motion.div className="glass-card p-6 border-red-200 bg-red-50 mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-red-700"><strong>{t('ai.error')}</strong> {error}</p>
                  </motion.div>
                )}

                {(loading || aiAnalyzing) && (
                  <div className="mt-6">
                    <AnalysisProgress
                      lang={i18n.language}
                      variant="prediction"
                      estimatedSeconds={aiAnalyzing ? 35 : 8}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* HEALTH CHECK */}
          {activeTab === 'health' && (
            <motion.div
              key="health"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                {!result ? (
                  <motion.div
                    className="glass-card p-6 md:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                      {t('health.title')}
                    </h1>
                    <p className="text-sm text-slate-400 mb-6">{t('health.upload.label')}</p>

                    {/* Upload Dropzone */}
                    <div
                      {...getRootProps()}
                      className={cn(
                        'border-2 border-dashed rounded-2xl p-10 md:p-16 flex flex-col items-center justify-center cursor-pointer transition-all',
                        isDragActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/30'
                      )}
                    >
                      <input {...getInputProps()} />
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
                        <Upload className="w-7 h-7 text-blue-500" />
                      </div>
                      {uploadedFile ? (
                        <p className="text-slate-900 font-medium text-center">{uploadedFile.name}</p>
                      ) : (
                        <>
                          <p className="text-slate-600 text-center text-sm md:text-base mb-2">
                            {t('health.upload.text')}
                          </p>
                          <p className="text-slate-400 text-xs">
                            {t('health.upload.formats')}
                          </p>
                        </>
                      )}
                    </div>

                    {uploadedFile && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={async () => {
                          // 額度檢查移到最前面，避免圖片路徑白費一次 API 呼叫
                          if (!canAnalyze(currentUser)) {
                            if (currentUser) setError(t('daily.limit.reached'));
                            else setLoginOpen(true);
                            return;
                          }
                          if (uploadedFile.name.endsWith('.csv')) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              handleHealthCheck(e.target?.result as string);
                            };
                            reader.readAsText(uploadedFile);
                          } else {
                            // 圖片上傳：先用 Gemini Vision 提取持股資料
                            setLoading(true);
                            setError(null);
                            try {
                              const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const dataUrl = reader.result as string;
                                  resolve(dataUrl.split(',')[1]);
                                };
                                reader.readAsDataURL(uploadedFile);
                              });
                              const mimeType = uploadedFile.type || 'image/png';
                              const extractedText = await extractPortfolioFromImage(base64, mimeType, i18n.language);
                              setLoading(false);
                              handleHealthCheck(extractedText);
                            } catch (err) {
                              setLoading(false);
                              setError(friendlyError(err instanceof Error ? err.message : 'Failed to extract portfolio from image', i18n.language));
                            }
                          }
                        }}
                        disabled={loading}
                        className="btn-primary w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {loading && <Loader className="w-5 h-5 animate-spin" />}
                        {t('health.submit')}
                      </motion.button>
                    )}
                  </motion.div>
                ) : result.type === 'health' ? (
                  <div className="space-y-6">
                    <ResultDisclaimerBanner />
                    <HealthCheckCard
                      result={result.data}
                      onAddToWatchlist={(ticker) => {
                        if (!currentUser) { setLoginOpen(true); return; }
                        const item = {
                          ticker,
                          name: ticker,
                          addedAt: new Date().toISOString(),
                        };
                        addToWatchlist(item, currentUser!.id);
                        setWatchlist(getWatchlist(currentUser?.id));
                      }}
                      watchedTickers={watchlist.map(w => w.ticker)}
                      onAnalyze={handleAnalyzeTicker}
                    />
                    <motion.button
                      onClick={() => { setResult(null); setUploadedFile(null); }}
                      className="btn-outline w-full"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t('ai.new.healthcheck')}
                    </motion.button>
                  </div>
                ) : null}

                {error && (
                  <motion.div className="glass-card p-6 border-red-200 bg-red-50 mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-red-700"><strong>{t('ai.error')}</strong> {error}</p>
                  </motion.div>
                )}

                {loading && !uploadedFile && (
                  <div className="mt-6">
                    <AnalysisProgress
                      lang={i18n.language}
                      variant="healthcheck"
                      estimatedSeconds={25}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* WATCHLIST */}
          {activeTab === 'watchlist' && (
            <motion.div
              key="watchlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                {!currentUser ? (
                  <motion.div
                    className="glass-card p-12 flex flex-col items-center justify-center text-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 mb-2">{t('watchlist.locked.title')}</h2>
                      <p className="text-sm text-slate-500">{t('watchlist.locked.desc')}</p>
                    </div>
                    <motion.button
                      onClick={() => setLoginOpen(true)}
                      className="btn-primary mt-2"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {t('watchlist.locked.cta')}
                    </motion.button>
                  </motion.div>
                ) : (
                <WatchlistSection
                  items={watchlist}
                  onRemove={(ticker) => {
                    removeFromWatchlist(ticker, currentUser!.id);
                    setWatchlist(getWatchlist(currentUser?.id));
                  }}
                  onRefresh={handleRefreshPrices}
                  loading={loading}
                  onAnalyze={handleAnalyzeTicker}
                />
                )}
              </div>
            </motion.div>
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                <HistorySection
                  items={history}
                  onRemove={(id) => {
                    removeTask(id, currentUser?.id);
                    setHistory(getHistory(currentUser?.id));
                  }}
                  onAddToWatchlist={(ticker, name, prices) => {
                    if (!currentUser) { setLoginOpen(true); return; }
                    const item = {
                      ticker,
                      name: name || ticker,
                      addedAt: new Date().toISOString(),
                      currentPrice: prices?.currentPrice,
                      targetPrice: prices?.targetPrice,
                    };
                    addToWatchlist(item, currentUser!.id);
                    setWatchlist(getWatchlist(currentUser?.id));
                  }}
                  onReview={async (id) => {
                    const task = history.find(h => h.id === id);
                    if (!task) return;
                    setReviewingId(id);
                    try {
                      const outcome = await reviewTask(task);
                      updateTask(id, { outcome }, currentUser?.id);
                      setHistory(getHistory(currentUser?.id));
                    } finally {
                      setReviewingId(null);
                    }
                  }}
                  reviewingId={reviewingId}
                  watchedTickers={watchlist.map(w => w.ticker)}
                  onAnalyze={handleAnalyzeTicker}
                />
              </div>
            </motion.div>
          )}

          {/* RETROSPECTIVE */}
          {activeTab === 'retrospective' && (
            <motion.div
              key="retrospective"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 md:px-8 py-8"
            >
              <div className="max-w-3xl mx-auto">
                <RetrospectiveSection
                  items={history}
                  userId={currentUser?.id}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Disclaimer + Legal Links */}
      <footer className="px-6 pb-8 pt-4">
        <div className="max-w-md mx-auto space-y-3 text-center">
          <div className="flex items-start justify-center gap-2 text-slate-500 text-[11px] leading-relaxed">
            <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="text-center">{t('footer.disclaimer')}</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => {
                setLegalTextType('terms');
                setLegalTextOpen(true);
              }}
              className="hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
            >
              {t('legal.terms.title')}
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => {
                setLegalTextType('privacy');
                setLegalTextOpen(true);
              }}
              className="hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
            >
              {t('legal.privacy.title')}
            </button>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={(user) => setCurrentUser(user)}
      />

      {/* Trial / Daily Quota Warning Banner */}
      <TrialBanner
        variant={trialWarningVariant}
        message={trialWarningMessage}
        isVisible={showTrialWarning}
        onClose={() => setShowTrialWarning(false)}
        onLoginClick={() => {
          setShowTrialWarning(false);
          setLoginOpen(true);
        }}
      />

      {/* Legal Consent Gate (first-visit) */}
      <LegalConsentModal
        open={legalConsentOpen}
        onAccept={() => {
          localStorage.setItem('hoki_legal_consent', '1');
          localStorage.setItem('hoki_legal_consent_at', new Date().toISOString());
          setLegalConsentOpen(false);
        }}
        onShowTerms={() => {
          setLegalTextType('terms');
          setLegalTextOpen(true);
        }}
        onShowPrivacy={() => {
          setLegalTextType('privacy');
          setLegalTextOpen(true);
        }}
      />

      {/* Legal Text Modal (ToS / Privacy) */}
      <LegalTextModal
        open={legalTextOpen}
        docType={legalTextType}
        onClose={() => setLegalTextOpen(false)}
      />
    </div>
  );
}
