import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Activity, TrendingUp, LineChart, Zap, Loader, ArrowRight } from 'lucide-react';
import { WatchlistItem } from '@/lib/storage';
import { getStockName } from '@/lib/stockNames';

interface QuickPredictState {
  loading: boolean;
  price?: number;
  date?: string;
  error?: boolean;
}

interface WatchlistSectionProps {
  items: WatchlistItem[];
  onRemove: (ticker: string) => void;
  onRefresh: () => void;
  loading: boolean;
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
  /** 一鍵隔日快速預測，回傳目標價或 null（失敗/額度不足）。 */
  onQuickPredict?: (ticker: string) => Promise<number | null>;
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

const tickerColors: Record<string, string> = {
  A: 'bg-blue-600', B: 'bg-emerald-600', C: 'bg-purple-600', D: 'bg-amber-600',
  E: 'bg-rose-600', F: 'bg-cyan-600', G: 'bg-indigo-600', H: 'bg-teal-600',
  I: 'bg-orange-600', J: 'bg-pink-600', K: 'bg-lime-600', L: 'bg-violet-600',
  M: 'bg-blue-500', N: 'bg-emerald-500', O: 'bg-purple-500', P: 'bg-amber-500',
  Q: 'bg-rose-500', R: 'bg-cyan-500', S: 'bg-indigo-500', T: 'bg-teal-500',
  U: 'bg-orange-500', V: 'bg-violet-500', W: 'bg-pink-500', X: 'bg-lime-500',
  Y: 'bg-blue-400', Z: 'bg-emerald-400',
};

function getTickerColor(ticker: string): string {
  const firstLetter = ticker.charAt(0).toUpperCase();
  return tickerColors[firstLetter] || 'bg-blue-600';
}

export default function WatchlistSection({
  items,
  onRemove,
  onRefresh,
  loading,
  onAnalyze,
  onQuickPredict,
}: WatchlistSectionProps) {
  const { t } = useTranslation();
  const [quickPredicts, setQuickPredicts] = useState<Record<string, QuickPredictState>>({});

  const handleQuickPredict = useCallback(async (ticker: string) => {
    if (!onQuickPredict) return;
    setQuickPredicts(prev => ({ ...prev, [ticker]: { loading: true } }));
    const price = await onQuickPredict(ticker);
    if (price !== null) {
      setQuickPredicts(prev => ({
        ...prev,
        [ticker]: { loading: false, price, date: getTomorrowStr() },
      }));
    } else {
      setQuickPredicts(prev => ({ ...prev, [ticker]: { loading: false, error: true } }));
    }
  }, [onQuickPredict]);

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
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-600 disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Activity className="w-4 h-4" />
          {t('watchlist.refresh')}
        </motion.button>
      </div>

      {/* Stock Cards */}
      <div className="space-y-4">
        {items.map((item, idx) => (
          <motion.div
            key={item.ticker}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="glass-card p-4 md:p-5"
          >
            {/* Main row */}
            <div className="flex items-start gap-3 md:gap-4">

              {/* Avatar — smaller on mobile */}
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${getTickerColor(item.ticker)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <span className="text-sm md:text-lg font-bold text-white">{item.ticker.charAt(0)}</span>
              </div>

              {/* Info (takes all remaining space) */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
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
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleQuickPredict(item.ticker)}
                    disabled={quickPredicts[item.ticker]?.loading}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center hover:bg-amber-100 transition-colors flex-shrink-0 disabled:opacity-50"
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
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onAnalyze(item.ticker)}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center hover:bg-blue-100 transition-colors flex-shrink-0"
                    aria-label={t('cta.analyze')}
                    title={t('cta.analyze')}
                  >
                    <LineChart className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
                  </motion.button>
                )}

                {/* Delete 🗑 */}
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onRemove(item.ticker)}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors flex-shrink-0"
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
                        <p className="text-lg md:text-xl font-bold text-amber-600 font-data">
                          NT${quickPredicts[item.ticker].price!.toFixed(2)}
                        </p>
                      </div>
                      {onAnalyze && (
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => onAnalyze(item.ticker)}
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
