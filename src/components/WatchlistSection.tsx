import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Trash2, Activity, TrendingUp, LineChart } from 'lucide-react';
import { WatchlistItem } from '@/lib/storage';

interface WatchlistSectionProps {
  items: WatchlistItem[];
  onRemove: (ticker: string) => void;
  onRefresh: () => void;
  loading: boolean;
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
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
}: WatchlistSectionProps) {
  const { t } = useTranslation();

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
            className="glass-card p-5 md:p-6 flex items-center gap-4"
          >
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-xl ${getTickerColor(item.ticker)} flex items-center justify-center flex-shrink-0`}>
              <span className="text-lg font-bold text-white">{item.ticker.charAt(0)}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-0.5">
                <h3 className="text-base font-bold text-slate-900">{item.ticker}</h3>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-xs text-slate-500">
                  {formatDate(item.addedAt)}
                </span>
              </div>
              <p className="text-sm text-slate-500 truncate">{item.name}</p>
            </div>

            {/* Price */}
            {item.currentPrice && (
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400 mb-0.5">{t('watchlist.current.price')}</p>
                <p className="text-2xl font-bold text-slate-900 font-data">
                  NT${Number(item.currentPrice).toFixed(2)}
                </p>
              </div>
            )}

            {/* Predict */}
            {onAnalyze && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onAnalyze(item.ticker)}
                className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center hover:bg-blue-100 transition-colors flex-shrink-0"
                aria-label={t('cta.analyze')}
                title={t('cta.analyze')}
              >
                <LineChart className="w-4 h-4 text-blue-600" />
              </motion.button>
            )}

            {/* Delete */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onRemove(item.ticker)}
              className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-4 h-4 text-slate-500" />
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
