import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle, Star, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

const PERSONA_CONFIG: Record<string, { bg: string; border: string; scoreColor: string; icon: string }> = {
  value:       { bg: 'bg-amber-50',   border: 'border-amber-200',  scoreColor: 'text-amber-700',  icon: '💎' },
  trader:      { bg: 'bg-orange-50',  border: 'border-orange-200', scoreColor: 'text-orange-700', icon: '🌐' },
  growth:      { bg: 'bg-sky-50',     border: 'border-sky-200',    scoreColor: 'text-sky-700',    icon: '📈' },
  contrarian:  { bg: 'bg-red-50',     border: 'border-red-200',    scoreColor: 'text-red-700',    icon: '🔄' },
  innovation:  { bg: 'bg-violet-50',  border: 'border-violet-200', scoreColor: 'text-violet-700', icon: '🚀' },
  trump:       { bg: 'bg-rose-50',    border: 'border-rose-200',   scoreColor: 'text-rose-700',   icon: '🏛️' },
};

interface Signal {
  name: string;
  status: 'Positive' | 'Negative' | 'Neutral';
  value?: string;
}

interface PersonaItem {
  id: 'value' | 'trader' | 'growth' | 'contrarian' | 'innovation' | 'trump';
  verdict: 'Buy' | 'Hold' | 'Avoid';
  score: number;
  headline: string;
  reasoning: string;
}

interface Recommendation {
  ticker: string;
  name: string;
  type: string;
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  rationale: string;
  catalysts: string[];
  bearCase: string;
  confidenceScore: number;
  signals: Signal[];
  personaAnalysis?: PersonaItem[];
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  onAddToWatchlist?: () => void;
  isWatched?: boolean;
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
}

export default function RecommendationCard({
  recommendation,
  onAddToWatchlist,
  isWatched = false,
  onAnalyze,
}: RecommendationCardProps) {
  const { t } = useTranslation();
  const potentialGain = (
    ((recommendation.targetPrice - recommendation.entryPrice) /
      recommendation.entryPrice) *
    100
  ).toFixed(2);
  const positiveSignals = recommendation.signals.filter(
    (s) => s.status === 'Positive'
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 25 }}
      className="glass-card p-6 rounded-2xl"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">
              {recommendation.ticker}
            </h3>
            <p className="text-slate-500">{recommendation.name}</p>
            <p className="text-sm text-slate-400 mt-1">{recommendation.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onAnalyze && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onAnalyze(recommendation.ticker)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all"
              aria-label={t('cta.analyze')}
            >
              <LineChart className="w-4 h-4" />
              {t('cta.analyze')}
            </motion.button>
          )}
          {onAddToWatchlist && (
            <motion.button
              whileHover={!isWatched ? { scale: 1.05 } : {}}
              whileTap={!isWatched ? { scale: 0.95 } : {}}
              onClick={!isWatched ? onAddToWatchlist : undefined}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                isWatched
                  ? 'bg-blue-100 text-blue-600 cursor-default'
                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
              )}
            >
              <Star className={cn('w-4 h-4', isWatched && 'fill-blue-600')} />
              {isWatched ? t('watchlist.tracked') : t('watchlist.track')}
            </motion.button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 items-stretch">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 mb-1">{t('ai.result.current')}</p>
          <p className="text-lg font-bold text-slate-900 font-data">
            NT${recommendation.currentPrice.toFixed(2)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-1">{t('ai.result.entry')}</p>
          <p className="text-lg font-bold text-blue-700 font-data">
            NT${recommendation.entryPrice.toFixed(2)}
          </p>
        </div>
        <div className="bg-emerald-100 ring-2 ring-emerald-400/60 rounded-xl p-3 shadow-md shadow-emerald-500/10 -my-0.5">
          <p className="text-xs font-semibold text-emerald-700 mb-1 tracking-wide">{t('ai.result.target')}</p>
          <p className="text-xl font-extrabold text-emerald-700 font-data">
            NT${recommendation.targetPrice.toFixed(2)}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-1">{t('ai.result.stoploss')}</p>
          <p className="text-lg font-bold text-red-700 font-data">
            NT${recommendation.stopLoss.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mb-6 bg-slate-50 rounded-xl p-4">
        <p className="text-sm text-slate-600 mb-2">
          <strong>{t('ai.result.potential')}</strong>
          <span className={parseFloat(potentialGain) > 0 ? 'text-emerald-600 font-data' : 'text-red-600 font-data'}>
            {potentialGain}%
          </span>
        </p>
      </div>

      <div className="mb-6">
        <p className="text-sm font-semibold text-slate-700 mb-2">
          {t('ai.rationale')}
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          {(() => {
            const clampRegex = /\s*\[(?:系統提示|Note:)[^\]]*\]/;
            const r = recommendation.rationale || '';
            const match = r.match(clampRegex);
            return match ? (
              <>
                {r.replace(clampRegex, '')}
                <span className="inline-block mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  {match[0].trim()}
                </span>
              </>
            ) : r;
          })()}
        </p>
      </div>

      {recommendation.catalysts && recommendation.catalysts.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-slate-700 mb-2">{t('ai.result.catalysts')}</p>
          <ul className="space-y-1">
            {recommendation.catalysts.map((catalyst, idx) => (
              <li key={idx} className="text-sm text-slate-500 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                <span>{catalyst}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendation.bearCase && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">{t('ai.result.bearcase')}</p>
              <p className="text-sm text-red-600">{recommendation.bearCase}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">
            {t('ai.result.confidence')}
          </p>
          <span className="text-lg font-bold text-blue-600 font-data">
            {recommendation.confidenceScore}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${recommendation.confidenceScore}%` }}
            transition={{ duration: 1, delay: 0.2 }}
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
          ></motion.div>
        </div>
      </div>

      {/* ═══ 18-Dimension Unified Grid (12 Quant + 6 Style) ═══ */}
      {recommendation.signals && recommendation.signals.length > 0 && (() => {
        const personaBuy = recommendation.personaAnalysis ? recommendation.personaAnalysis.filter(p => p.verdict === 'Buy').length : 0;
        const totalPositive = positiveSignals + personaBuy;
        return (
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-3">
              {t('ai.result.signals_18', { positive: totalPositive, defaultValue: `信號狀態：${totalPositive}/18 正向` })}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {recommendation.signals.map((signal, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'text-xs p-2 rounded-lg border',
                    signal.status === 'Positive'
                      ? 'bg-teal-50 border-teal-200 text-teal-700'
                      : signal.status === 'Negative'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                  )}
                >
                  <p className="font-semibold">{signal.name}</p>
                  <p className="text-xs">{signal.status}</p>
                  {signal.value && <p className="text-xs mt-1">{signal.value}</p>}
                </div>
              ))}
              {recommendation.personaAnalysis && recommendation.personaAnalysis.map((persona) => {
                const config = PERSONA_CONFIG[persona.id] || PERSONA_CONFIG['value'];
                const status = persona.verdict === 'Buy' ? 'Positive' : persona.verdict === 'Avoid' ? 'Negative' : 'Neutral';
                return (
                  <div
                    key={`persona-${persona.id}`}
                    className={cn(
                      'text-xs p-2 rounded-lg border',
                      status === 'Positive'
                        ? 'bg-teal-50 border-teal-200 text-teal-700'
                        : status === 'Negative'
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                    )}
                  >
                    <p className="font-semibold">{config.icon} {t(`prediction.persona.${persona.id}`)}</p>
                    <p className="text-xs">{status}</p>
                    <p className="text-xs mt-1">{persona.headline}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

    </motion.div>
  );
}
