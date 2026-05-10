import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Activity, TrendingUp, LineChart, Zap, Loader, ArrowRight, Pin } from 'lucide-react';
import { WatchlistItem } from '@/lib/storage';
import { getStockName } from '@/lib/stockNames';

interface QuickPredictState {
  loading: boolean;
  price?: number;
  currentPrice?: number | null;
  bullProb?: number | null;
  date?: string;
  taskId?: string;
  error?: boolean;
}

interface WatchlistSectionProps {
  items: WatchlistItem[];
  onRemove: (ticker: string) => void;
  onRefresh: () => void;
  loading: boolean;
  /** 切換釘選狀態 */
  onPin?: (ticker: string) => void;
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
  /** 一鍵隔日快速預測，回傳 { price, currentPrice, bullProb, taskId } 或 null（失敗/額度不足）。 */
  onQuickPredict?: (ticker: string) => Promise<{ price: number; currentPrice?: number | null; bullProb?: number | null; taskId: string } | null>;
  /** 「看詳細」點下去後，以 taskId 導到歷史紀錄並展開該筆。 */
  onViewDetail?: (taskId: string) => void;
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}


export default function WatchlistSection({
  items,
  onRemove,
  onRefresh,
  loading,
  onPin,
  onAnalyze,
  onQuickPredict,
  onViewDetail,
}: WatchlistSectionProps) {
  const { t } = useTranslation();
  const [quickPredicts, setQuickPredicts] = useState<Record<string, QuickPredictState>>({});

  const handleQuickPredict = useCallback(async (ticker: string) => {
    if (!onQuickPredict) return;
    setQuickPredicts(prev => ({ ...prev, [ticker]: { loading: true } }));
    const result = await onQuickPredict(ticker);
    if (result !== null) {
      setQuickPredicts(prev => ({
        ...prev,
        [ticker]: {
          loading: false,
          price: result.price,
          currentPrice: result.currentPrice,
          bullProb: result.bullProb,
          date: getTomorrowStr(),
          taskId: result.taskId,
        },
      }));
    } else {
      setQuickPredicts(prev => ({ ...prev, [ticker]: { loading: false, error: true } }));
    }
  }, [onQuickPredict]);

  // 任何一支股票正在快速預測時，鎖定整個介面
  const isAnyLoading = Object.values(quickPredicts).some(qp => qp.loading);

  // 釘選的排在最前面，其餘維持原順序
  const sortedItems = [...items].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-12 flex flex-col items-center justify-center min-h-80"
      >
        <TrendingUp className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-400 mb-2">{t('watchlist.empty')}</h2>
        <p className="text-slate-400 text-sm">{t('watchlist.add')}</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              {t('watchlist.title')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {t('watchlist.subtitle')}
            </p>
          </div>
        </div>
        <motion.button
          onClick={onRefresh}
          disabled={loading || isAnyLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Activity className="w-4 h-4" />
          {t('watchlist.refresh')}
        </motion.button>
      </div>

      {/* Stock Cards */}
      <div className="space-y-4">
        {sortedItems.map((item, idx) => (
          <motion.div
            key={item.ticker}
            layout
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, layout: { duration: 0.25, ease: 'easeInOut' } }}
            className={`glass-card p-4 md:p-5 ${item.pinned ? 'ring-1 ring-amber-300/60' : ''}`}
          >
            {/* Main row */}
            <div className="flex items-start gap-3 md:gap-4">

              {/* Info (takes all remaining space) */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {item.pinned && (
                    <Pin className="w-3 h-3 text-amber-500 flex-shrink-0 fill-amber-400" aria-hidden />
                  )}
                  <h3 className="text-base font-bold text-slate-900 leading-tight">{item.ticker}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-500 flex-shrink-0">
                    {formatDate(item.addedAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-500 truncate">
                  {(item.name && item.name !== item.ticker) ? item.name : (getStockName(item.ticker) ?? item.ticker)}
                </p>
                {/* Price — mobile only, shown below name */}
                {item.currentPrice && (
                  <div className="flex items-baseline gap-1 mt-1.5 md:hidden">
                    <span className="text-[11px] text-slate-400">{t('watchlist.current.price')}</span>
                    <span className="text-base font-bold text-slate-900 font-data">
                      NT${parseFloat(item.currentPrice).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Price — desktop only, large on the right */}
              {item.currentPrice && (
                <div className="hidden md:block text-right flex-shrink-0">
                  <p className="text-xs text-slate-400 mb-0.5">{t('watchlist.current.price')}</p>
                  <p className="text-2xl font-bold text-slate-900 font-data">
                    NT${parseFloat(item.currentPrice).toFixed(2)}
                  </p>
                </div>
              )}

              {/* Action buttons — smaller on mobile */}
              <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">

                {/* Quick Predict ⚡ */}
                {onQuickPredict && (
                  <motion.button
                    whileHover={!isAnyLoading ? { scale: 1.08 } : {}}
                    whileTap={!isAnyLoading ? { scale: 0.94 } : {}}
                    onClick={() => !isAnyLoading && handleQuickPredict(item.ticker)}
                    disabled={isAnyLoading}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-amber-100"
                    aria-label={t('watchlist.quickPredict')}
                    title={t('watchlist.quickPredict')}
                  >
                    {quickPredicts[item.ticker]?.loading
                      ? <Loader className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500 animate-spin" />
                      : <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                    }
                  </motion.button>
                )}

                {/* Full Predict 📊 */}
                {onAnalyze && (
                  <motion.button
                    whileHover={!isAnyLoading ? { scale: 1.08 } : {}}
                    whileTap={!isAnyLoading ? { scale: 0.94 } : {}}
                    onClick={() => !isAnyLoading && onAnalyze(item.ticker)}
                    disabled={isAnyLoading}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-blue-100"
                    aria-label={t('cta.analyze')}
                    title={t('cta.analyze')}
                  >
                    <LineChart className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
                  </motion.button>
                )}

                {/* Pin 📌 */}
                {onPin && (
                  <motion.button
                    whileHover={!isAnyLoading ? { scale: 1.08 } : {}}
                    whileTap={!isAnyLoading ? { scale: 0.94 } : {}}
                    onClick={() => !isAnyLoading && onPin(item.ticker)}
                    disabled={isAnyLoading}
                    className={`w-9 h-9 md:w-10 md:h-10 rounded-xl border flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                      item.pinned
                        ? 'bg-amber-100 border-amber-300 hover:bg-amber-200'
                        : 'bg-slate-100 border-slate-200 hover:bg-amber-50 hover:border-amber-200'
                    }`}
                    aria-label={item.pinned ? t('watchlist.unpin') : t('watchlist.pin')}
                    title={item.pinned ? t('watchlist.unpin') : t('watchlist.pin')}
                  >
                    <Pin className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-colors ${item.pinned ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`} />
                  </motion.button>
                )}

                {/* Delete 🗑 */}
                <motion.button
                  whileHover={!isAnyLoading ? { scale: 1.08 } : {}}
                  whileTap={!isAnyLoading ? { scale: 0.94 } : {}}
                  onClick={() => !isAnyLoading && onRemove(item.ticker)}
                  disabled={isAnyLoading}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-red-50 enabled:hover:border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
                </motion.button>
              </div>
            </div>

            {/* Quick Predict Result Row */}
            <AnimatePresence>
              {quickPredicts[item.ticker] && !quickPredicts[item.ticker].loading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 pt-3 border-t border-slate-100"
                >
                  {quickPredicts[item.ticker].error ? (
                    <p className="text-xs text-red-400">{t('watchlist.quickPredict.error')}</p>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-slate-400 mb-0.5">
                          {t('watchlist.quickPredict.label')}
                          <span className="ml-1.5 font-semibold text-amber-500">
                            {quickPredicts[item.ticker].date}
                          </span>
                        </p>
                        {/* 目標價 + 漲跌幅 + 看漲機率 */}
                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                          <p className="text-lg md:text-xl font-bold text-amber-600 font-data">
                            NT${quickPredicts[item.ticker].price!.toFixed(2)}
                          </p>
                          {(() => {
                            const qp = quickPredicts[item.ticker];
                            const base = qp.currentPrice ?? parseFloat(item.currentPrice ?? '0');
                            if (!base || !qp.price) return null;
                            const diff = qp.price - base;
                            const pct = (diff / base) * 100;
                            const up = diff >= 0;
                            return (
                              <>
                                <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {up ? '+' : ''}{diff.toFixed(2)} ({up ? '+' : ''}{pct.toFixed(1)}%)
                                </span>
                                {qp.bullProb != null && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                  }`}>
                                    {up ? '↗' : '↘'} {up ? t('watchlist.bullish') : t('watchlist.bearish')} {qp.bullProb}%
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      {(onViewDetail || onAnalyze) && (
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            const qp = quickPredicts[item.ticker];
                            if (qp?.taskId && onViewDetail) onViewDetail(qp.taskId);
                            else if (onAnalyze) onAnalyze(item.ticker);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors flex-shrink-0"
                        >
                          {t('watchlist.quickPredict.detail')}
                          <ArrowRight className="w-3 h-3" />
                        </motion.button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
