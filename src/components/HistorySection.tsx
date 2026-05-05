import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Clock, ChevronRight, ChevronDown, AlertCircle, CheckCircle, X, Search, Target, TrendingDown, Sparkles } from 'lucide-react';
import { InvestmentTask, TaskOutcome, OutcomeEntry } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { getStockName } from '@/lib/stockNames';
import RecommendationCard from './RecommendationCard';
import HealthCheckCard from './HealthCheckCard';
import StockPredictionChart from './StockPredictionChart';

interface HistorySectionProps {
  items: InvestmentTask[];
  onRemove: (id: string) => void;
  onAddToWatchlist?: (ticker: string, name?: string, prices?: { currentPrice?: string; targetPrice?: string }) => void;
  onReview?: (id: string) => Promise<void>;
  reviewingId?: string | null;
  watchedTickers?: string[];
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
  /** 自動切換到指定 tab 並展開指定 task（從外部導航用，例如自選追蹤快速預測後的「看詳細」）。 */
  autoExpandId?: string | null;
  autoExpandTab?: HistoryTab;
}

type HistoryTab = 'recommendation' | 'prediction' | 'healthcheck';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function getDateRange(dateStr: string, params?: any): string | null {
  if (!params?.duration) return null;
  const totalDays = parseDurationDays(params.duration);
  if (!totalDays) return null;
  const start = new Date(dateStr);
  const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  return `${start.getFullYear()}/${fmt(start)} \u2013 ${fmt(end)}`;
}

function parseDurationDays(dur: string): number | null {
  if (dur === '1w') return 7;
  if (dur === '2w') return 14;
  if (dur === '3w') return 21;
  if (dur === '1m') return 30;
  // 自定義: 嘗試解析 "3 個月" / "2 months" / "90 days" 等
  const monthMatch = dur.match(/(\d+)\s*(?:個月|months?|m)/i);
  if (monthMatch) return parseInt(monthMatch[1]) * 30;
  const weekMatch = dur.match(/(\d+)\s*(?:週|weeks?|w)/i);
  if (weekMatch) return parseInt(weekMatch[1]) * 7;
  const dayMatch = dur.match(/(\d+)\s*(?:天|days?|d)/i);
  if (dayMatch) return parseInt(dayMatch[1]);
  return null;
}

function getDaysUntilAnalysis(dateStr: string, params?: any): number | null {
  if (!params?.duration) return null;
  const totalDays = parseDurationDays(params.duration);
  if (!totalDays) return null;
  const start = new Date(dateStr);
  const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function parseResult(result: string): any {
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export default function HistorySection({ items, onRemove, onAddToWatchlist, onReview, reviewingId, watchedTickers = [], onAnalyze, autoExpandId, autoExpandTab }: HistorySectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<HistoryTab>('recommendation');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // 外部導航：從自選追蹤「看詳細」跳進來時，自動切 tab + 展開該筆
  useEffect(() => {
    if (!autoExpandId) return;
    if (autoExpandTab) setActiveTab(autoExpandTab);
    setExpandedId(autoExpandId);
    // 讓 DOM 渲染後滾動到該項目
    setTimeout(() => {
      document.getElementById(`history-item-${autoExpandId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, [autoExpandId, autoExpandTab]);

  const handleReviewClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onReview) return;
    setReviewError(null);
    try {
      await onReview(id);
      // 檢視成功後同時展開該項分析內容，省去再點一次
      setExpandedId(id);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Review failed');
    }
  };

  const recommendItems = items.filter(i => i.type === 'recommendation');
  const predictionItems = items.filter(i => i.type === 'prediction');
  const healthItems = items.filter(i => i.type === 'healthcheck');
  const currentItems = activeTab === 'recommendation' ? recommendItems : activeTab === 'prediction' ? predictionItems : healthItems;

  const toggleExpand = (id: string) => {
    const isOpening = expandedId !== id;
    setExpandedId(isOpening ? id : null);
    if (isOpening) {
      // Framer Motion 展開動畫 duration=0.3s，等動畫完成後再 scroll
      // 用 window.scrollTo 精確計算，避免 scrollIntoView 被動畫中途位置誤導
      setTimeout(() => {
        const el = document.getElementById(`history-item-${id}`);
        if (!el) return;
        const navHeight = window.innerWidth >= 768 ? 72 : 104;
        const top = el.getBoundingClientRect().top + window.scrollY - navHeight - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }, 380);
    }
  };

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: 'recommendation', label: t('history.tab.recommend') },
    { id: 'prediction', label: t('nav.prediction') },
    { id: 'healthcheck', label: t('history.tab.health') },
  ];

  const TabSwitcher = () => (
    <div className="sticky top-24 md:top-[61px] z-40 -mx-4 px-4 md:-mx-8 md:px-8 pt-3 pb-3 bg-white/90 backdrop-blur-xl">
      <div className="flex justify-center">
        <div className="glass-card rounded-full p-1.5 inline-flex w-full max-w-lg">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setExpandedId(null); }}
              className={cn(
                'flex-1 py-3 rounded-full text-sm font-semibold transition-all',
                activeTab === id
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <TabSwitcher />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 flex flex-col items-center justify-center min-h-80"
        >
          <Clock className="w-16 h-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-bold text-slate-400 mb-2">{t('history.empty')}</h2>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TabSwitcher />

      {/* Items */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {currentItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-12 flex flex-col items-center justify-center min-h-60"
            >
              <Clock className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-slate-400">{t('history.empty')}</p>
            </motion.div>
          ) : (
            currentItems.map((item, idx) => {
              const isExpanded = expandedId === item.id;
              const resultData = parseResult(item.result);

              return (
                <motion.div
                  key={item.id}
                  id={`history-item-${item.id}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="space-y-0 scroll-mt-28 md:scroll-mt-20"
                >
                  {/* Summary Row (clickable) */}
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className={cn(
                      'glass-card p-5 md:p-6 flex items-center gap-4 cursor-pointer transition-all hover:border-blue-200',
                      isExpanded && 'border-blue-200 bg-blue-50/30 rounded-b-none'
                    )}
                  >
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-emerald-600" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900">
                          {activeTab === 'recommendation'
                            ? t('history.recommend.title')
                            : activeTab === 'prediction'
                            ? `${t('prediction.title')}${item.params?.ticker ? ` - ${item.params.ticker}${getStockName(item.params.ticker) ? ` ${getStockName(item.params.ticker)}` : ''}` : ''}`
                            : t('history.health.title')}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-xs text-slate-500">
                          {formatDate(item.date)}
                        </span>
                        {/* Prediction quick stats from result data */}
                        {activeTab === 'prediction' && resultData && (
                          <>
                            {resultData.prediction?.direction && (
                              <span className={cn(
                                'px-2 py-0.5 rounded-md text-xs font-semibold border',
                                resultData.prediction.direction === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                resultData.prediction.direction === 'Bearish' ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-slate-50 text-slate-600 border-slate-200'
                              )}>
                                {resultData.prediction.direction} {resultData.prediction.confidence ? `${resultData.prediction.confidence}%` : ''}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Prediction: show price info from result even without duration */}
                      {activeTab === 'prediction' && resultData && (
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs font-data">
                          {resultData.currentPrice && (
                            <span className="text-slate-500">NT${resultData.currentPrice.toFixed(2)}</span>
                          )}
                          {resultData.targetPrice && (
                            <span className="text-blue-600">→ ${resultData.targetPrice.toFixed(2)}</span>
                          )}
                          {resultData.currentPrice && resultData.targetPrice && (
                            <span className={cn(
                              'font-semibold',
                              resultData.targetPrice >= resultData.currentPrice ? 'text-emerald-600' : 'text-red-600'
                            )}>
                              ({resultData.targetPrice >= resultData.currentPrice ? '+' : ''}{(((resultData.targetPrice - resultData.currentPrice) / resultData.currentPrice) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}

                      {(activeTab === 'recommendation' || activeTab === 'prediction') && (
                        <div className="space-y-1.5 mt-2">
                          {getDateRange(item.date, item.params) && (
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs text-slate-500">
                                ~ {getDateRange(item.date, item.params)}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-600">
                                <CheckCircle className="w-3 h-3" />
                                {t('history.expert.approved')}
                              </span>
                            </div>
                          )}
                          {(() => {
                            const daysLeft = getDaysUntilAnalysis(item.date, item.params);
                            if (daysLeft === null) return null;

                            // 若這次推薦沒有任何標的（AI 判定無適合標的）→ 沒有東西可追蹤，
                            // 不顯示倒數、檢視按鈕、outcome summary
                            if (
                              item.type === 'recommendation' &&
                              (resultData?.recommendations?.length || 0) === 0
                            ) {
                              return null;
                            }

                            const isReviewing = reviewingId === item.id;

                            // 已檢視 → 顯示 outcome summary badge
                            if (item.outcome) {
                              const s = item.outcome.summary;
                              return (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 font-semibold">
                                    <Sparkles className="w-3 h-3" />
                                    {t('history.outcome.reviewed')}
                                  </span>
                                  <span className="text-xs text-slate-600">
                                    {t('history.outcome.summary', {
                                      dir: s.directionHit,
                                      hit: s.targetHit,
                                      total: s.total,
                                      avg: s.avgProgress.toFixed(0),
                                    })}
                                  </span>
                                </div>
                              );
                            }

                            // 未到期 → 顯示倒數
                            if (daysLeft > 0) {
                              return (
                                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>{t('history.auto.analyze', { days: daysLeft })}</span>
                                </div>
                              );
                            }

                            // 已到期、未檢視 → 自動回顧中（App.tsx useEffect 會處理）
                            // 顯示輕量 loading 指示，若自動失敗才顯示手動按鈕
                            return (
                              <div className="flex items-center gap-2 flex-wrap">
                                {isReviewing ? (
                                  <div className="flex items-center gap-1.5 text-xs text-blue-600">
                                    <div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-600 rounded-full animate-spin" />
                                    <span>{t('history.review.loading')}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <div className="w-3 h-3 border-2 border-slate-300/40 border-t-slate-400 rounded-full animate-spin" />
                                    <span>{t('history.auto.reviewing')}</span>
                                  </div>
                                )}
                                {reviewError && (
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={(e) => handleReviewClick(e, item.id)}
                                    disabled={isReviewing || !onReview}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors"
                                  >
                                    <Search className="w-3 h-3" />
                                    {t('history.review.retry')}
                                  </motion.button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      </motion.div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                        className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <AnimatePresence>
                    {isExpanded && resultData && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="border border-t-0 border-gray-200 rounded-b-2xl bg-slate-50/50 p-4 md:p-6 space-y-4">
                          {/* Close button */}
                          <div className="flex justify-end">
                            <button
                              onClick={() => setExpandedId(null)}
                              className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                              <X className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>

                          {/* Outcome review section (if reviewed) */}
                          {item.outcome && <OutcomeDetail outcome={item.outcome} />}

                          {/* Recommendation results */}
                          {activeTab === 'recommendation' && resultData && (
                            <div className="space-y-4">
                              {resultData.summary && (
                                <div className="glass-card p-5">
                                  <h4 className="text-sm font-bold text-slate-700 mb-2">{t('ai.result.title')}</h4>
                                  <p className="text-sm text-slate-600">{resultData.summary}</p>
                                  {resultData.riskLevel && (
                                    <p className="text-xs text-slate-500 mt-2">
                                      <strong>{t('ai.result.risk')}:</strong> {resultData.riskLevel}
                                    </p>
                                  )}
                                </div>
                              )}
                              {resultData.recommendations?.map((rec: any, i: number) => (
                                <RecommendationCard
                                  key={i}
                                  recommendation={rec}
                                  onAddToWatchlist={onAddToWatchlist ? () => onAddToWatchlist(rec.ticker, rec.name, {
                                    currentPrice: rec.currentPrice?.toFixed(2),
                                    targetPrice: rec.targetPrice?.toFixed(2),
                                  }) : undefined}
                                  isWatched={watchedTickers.includes(rec.ticker)}
                                  onAnalyze={onAnalyze}
                                />
                              ))}
                              {resultData.riskWarnings?.length > 0 && (
                                <div className="glass-card p-5 border-red-200 bg-red-50">
                                  <h4 className="text-sm font-bold text-red-700 mb-2">{t('ai.result.riskwarnings')}</h4>
                                  <ul className="space-y-1">
                                    {resultData.riskWarnings.map((w: string, i: number) => (
                                      <li key={i} className="text-xs text-red-600 flex items-start gap-2">
                                        <span className="text-red-400 mt-0.5">&bull;</span>
                                        <span>{w}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Prediction results */}
                          {activeTab === 'prediction' && resultData && (
                            <StockPredictionChart
                              result={resultData}
                              onAddToWatchlist={onAddToWatchlist ? () => onAddToWatchlist(
                                resultData.ticker,
                                resultData.ticker,
                                {
                                  currentPrice: resultData.currentPrice?.toFixed(2),
                                  targetPrice: resultData.targetPrice?.toFixed(2),
                                }
                              ) : undefined}
                              isWatched={watchedTickers.includes(resultData.ticker)}
                              onAnalyze={onAnalyze}
                            />
                          )}

                          {/* Health check results */}
                          {activeTab === 'healthcheck' && resultData && (
                            <HealthCheckCard
                              result={resultData}
                              onAddToWatchlist={onAddToWatchlist ? (ticker) => onAddToWatchlist(ticker, ticker) : undefined}
                              watchedTickers={watchedTickers}
                              onAnalyze={onAnalyze}
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Outcome Detail — 分析結果檢視（時間到期後的實績比對）
// ============================================================
function OutcomeDetail({ outcome }: { outcome: TaskOutcome }) {
  const { t } = useTranslation();
  const s = outcome.summary;
  const reviewedDate = new Date(outcome.reviewedAt);
  const reviewedStr = `${reviewedDate.getFullYear()}/${String(reviewedDate.getMonth() + 1).padStart(2, '0')}/${String(reviewedDate.getDate()).padStart(2, '0')}`;

  return (
    <div className="glass-card p-5 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-bold text-blue-900">{t('history.outcome.title')}</h4>
        <span className="text-xs text-slate-400">{t('history.outcome.reviewed.at', { date: reviewedStr })}</span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs text-slate-500 mb-1">{t('history.outcome.stat.direction')}</p>
          <p className="text-lg font-bold text-slate-900">{s.directionHit}/{s.total}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {((s.directionHit / s.total) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs text-slate-500 mb-1">{t('history.outcome.stat.target')}</p>
          <p className="text-lg font-bold text-emerald-600">{s.targetHit}/{s.total}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {((s.targetHit / s.total) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs text-slate-500 mb-1">{t('history.outcome.stat.stop')}</p>
          <p className={cn('text-lg font-bold', s.stopHit === 0 ? 'text-emerald-600' : 'text-rose-600')}>
            {s.stopHit}/{s.total}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {((s.stopHit / s.total) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs text-slate-500 mb-1">{t('history.outcome.stat.progress')}</p>
          <p className={cn('text-lg font-bold', s.avgProgress >= 0 ? 'text-blue-600' : 'text-rose-600')}>
            {s.avgProgress >= 0 ? '+' : ''}{s.avgProgress.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* vs 加權指數 (TAIEX) benchmark */}
      {s.benchmarkReturn !== undefined && s.portfolioReturn !== undefined && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-slate-900">
              {t('history.outcome.vs.title')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 text-center">
              <p className="text-[11px] text-blue-600 font-semibold mb-1">
                {t('history.outcome.portfolio')}
              </p>
              <p className={cn(
                'text-xl font-bold font-data',
                s.portfolioReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {s.portfolioReturn >= 0 ? '+' : ''}{s.portfolioReturn.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
              <p className="text-[11px] text-slate-600 font-semibold mb-1">
                {t('history.outcome.benchmark')}
              </p>
              <p className={cn(
                'text-xl font-bold font-data',
                s.benchmarkReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {s.benchmarkReturn >= 0 ? '+' : ''}{s.benchmarkReturn.toFixed(2)}%
              </p>
            </div>
          </div>
          {s.alpha !== undefined && (
            <div className={cn(
              'flex items-center justify-center gap-2 py-2 rounded-lg flex-wrap',
              s.alpha > 0.1 ? 'bg-emerald-50 border border-emerald-200' :
              s.alpha < -0.1 ? 'bg-rose-50 border border-rose-200' :
              'bg-slate-100 border border-slate-200'
            )}>
              <span className={cn(
                'text-sm font-bold font-data',
                s.alpha > 0.1 ? 'text-emerald-700' :
                s.alpha < -0.1 ? 'text-rose-700' : 'text-slate-700'
              )}>
                Alpha {s.alpha >= 0 ? '+' : ''}{s.alpha.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className={cn(
                'text-xs font-semibold',
                s.alpha > 0.1 ? 'text-emerald-700' :
                s.alpha < -0.1 ? 'text-rose-700' : 'text-slate-700'
              )}>
                {s.alpha > 0.1 ? t('history.outcome.alpha.outperform') :
                 s.alpha < -0.1 ? t('history.outcome.alpha.underperform') :
                 t('history.outcome.alpha.even')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Per-ticker breakdown */}
      <div className="space-y-2">
        {outcome.entries.map((e) => (
          <OutcomeRow key={e.ticker} entry={e} />
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-400 mt-4 italic">
        {t('history.outcome.disclaimer')}
      </p>
    </div>
  );
}

function OutcomeRow({ entry }: { entry: OutcomeEntry }) {
  const { t } = useTranslation();
  const bullish = entry.targetPrice >= entry.startPrice;
  const predictedChangePct = entry.startPrice !== 0
    ? ((entry.targetPrice - entry.startPrice) / entry.startPrice) * 100
    : 0;
  // 多空兩種情境下「是否超越目標」
  const exceeded = bullish
    ? entry.actualPrice >= entry.targetPrice
    : entry.actualPrice <= entry.targetPrice;
  const gapAbs = Math.abs(entry.actualPrice - entry.targetPrice);

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3 md:p-4">
      {/* Header: ticker + status badge */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="font-bold text-slate-900 text-base">
          {entry.ticker}
          {getStockName(entry.ticker) && (
            <span className="ml-1.5 text-sm font-medium text-slate-500">{getStockName(entry.ticker)}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.hitStop ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
              <TrendingDown className="w-3 h-3" />
              {t('history.outcome.hit.stop')}
            </span>
          ) : entry.hitTarget ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-semibold">
              <Target className="w-3 h-3" />
              {t('history.outcome.hit.target')}
            </span>
          ) : entry.directionCorrect ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 font-semibold">
              <CheckCircle className="w-3 h-3" />
              {t('history.outcome.direction.correct')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-600 font-semibold">
              <X className="w-3 h-3" />
              {t('history.outcome.direction.wrong')}
            </span>
          )}
        </div>
      </div>

      {/* 雙欄比分卡：HOKI 預估 vs 實際達到 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* HOKI 預估 */}
        <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Sparkles className="w-3 h-3 text-blue-500" />
            <p className="text-[11px] text-blue-600 font-semibold">{t('history.outcome.predicted')}</p>
          </div>
          <p className="text-lg font-bold text-slate-900 font-data">NT${entry.targetPrice.toFixed(2)}</p>
          <p className={cn(
            'text-xs font-semibold mt-0.5',
            predictedChangePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {predictedChangePct >= 0 ? '+' : ''}{predictedChangePct.toFixed(1)}%
          </p>
        </div>

        {/* 實際達到 */}
        <div className={cn(
          'rounded-lg border p-3 text-center',
          exceeded ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
        )}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className={cn('w-3 h-3', exceeded ? 'text-emerald-600' : 'text-slate-500')} />
            <p className={cn(
              'text-[11px] font-semibold',
              exceeded ? 'text-emerald-700' : 'text-slate-600'
            )}>
              {t('history.outcome.actual')}
            </p>
          </div>
          <p className="text-lg font-bold text-slate-900 font-data">NT${entry.actualPrice.toFixed(2)}</p>
          <p className={cn(
            'text-xs font-semibold mt-0.5',
            entry.priceChangePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {entry.priceChangePct >= 0 ? '+' : ''}{entry.priceChangePct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* 落差 + 起點 + 達標進度 */}
      <div className="flex items-center justify-between text-xs flex-wrap gap-2 mb-1.5">
        <span className="text-slate-400">
          {t('history.outcome.start.label')} ${entry.startPrice.toFixed(2)}
        </span>
        <span className={cn(
          'font-semibold',
          exceeded ? 'text-emerald-600' :
          entry.directionCorrect ? 'text-blue-600' : 'text-rose-600'
        )}>
          {exceeded
            ? t('history.outcome.gap.exceeded', { amount: gapAbs.toFixed(2) })
            : t('history.outcome.gap.short', { amount: gapAbs.toFixed(2) })}
          {' · '}
          {entry.progressPct >= 0 ? '+' : ''}{entry.progressPct.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all',
            entry.progressPct < 0 ? 'bg-rose-400' :
            entry.progressPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
          )}
          style={{ width: `${Math.min(100, Math.max(0, Math.abs(entry.progressPct)))}%` }}
        />
      </div>
    </div>
  );
}
