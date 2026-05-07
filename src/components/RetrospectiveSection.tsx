import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  Sparkles, TrendingUp, TrendingDown, Target, Activity,
  AlertCircle, CheckCircle, Lightbulb, RefreshCw, Loader2, BarChart3,
} from 'lucide-react';
import {
  InvestmentTask, LessonScope, SystemLesson,
  getSystemLesson, saveSystemLesson, clearSystemLesson,
} from '@/lib/storage';
import {
  aggregateStats, serializeOutcomesForCritique, MIN_OUTCOMES_FOR_CRITIQUE,
  RetrospectiveStats, BreakdownRow, TickerEntry,
} from '@/lib/retrospective';
import { generateRetrospectiveCritique } from '@/lib/gemini';
import { getStockName } from '@/lib/stockNames';
import { cn } from '@/lib/utils';

interface Props {
  items: InvestmentTask[];
  userId?: string | null;
}

export default function RetrospectiveSection({ items, userId }: Props) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<LessonScope>('recommendation');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const stats = useMemo(() => aggregateStats(items, scope), [items, scope]);
  const lesson = getSystemLesson(scope, userId);

  const canCritique = stats.taskCount >= MIN_OUTCOMES_FOR_CRITIQUE;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const outcomesText = serializeOutcomesForCritique(items, scope);
      const result = await generateRetrospectiveCritique({
        scope,
        outcomesText,
        basedOnCount: stats.taskCount,
        lang: i18n.language,
      });
      const newLesson: SystemLesson = {
        scope,
        generatedAt: new Date().toISOString(),
        basedOnCount: stats.taskCount,
        failurePatterns: result.failurePatterns,
        successPatterns: result.successPatterns,
        improvements: result.improvements,
      };
      saveSystemLesson(newLesson, userId);
      forceTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearLesson = () => {
    clearSystemLesson(scope, userId);
    forceTick((n) => n + 1);
  };

  const tabs: { id: LessonScope; label: string }[] = [
    { id: 'recommendation', label: t('retrospective.tab.recommendation') },
    { id: 'prediction', label: t('retrospective.tab.prediction') },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('retrospective.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('retrospective.subtitle')}</p>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="glass-card rounded-full p-1.5 inline-flex gap-1">
        {tabs.map(({ id, label }) => (
          <motion.button
            key={id}
            onClick={() => setScope(id)}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-semibold transition-all',
              scope === id
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
            whileHover={{ scale: scope === id ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {label}
          </motion.button>
        ))}
      </div>

      {stats.taskCount === 0 ? (
        <EmptyState
          message={t('retrospective.empty', { type: tabs.find((tt) => tt.id === scope)?.label || '' })}
        />
      ) : (
        <>
          {/* Phase 1: Stats */}
          <StatsPanel stats={stats} t={t} />

          {/* Phase 2: AI critique */}
          <CritiquePanel
            stats={stats}
            lesson={lesson}
            canCritique={canCritique}
            generating={generating}
            error={error}
            onGenerate={handleGenerate}
            onClear={handleClearLesson}
            t={t}
          />
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Stats Panel (Phase 1)
// ────────────────────────────────────────────────────────────
function StatsPanel({
  stats,
  t,
}: {
  stats: RetrospectiveStats;
  t: (k: string, opts?: any) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          icon={<Activity className="w-4 h-4 text-slate-400" />}
          label={t('retrospective.metric.reviewed')}
          value={`${stats.taskCount}`}
          sub={t('retrospective.metric.reviewed.sub', { tickers: stats.tickerCount })}
        />
        <Metric
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
          label={t('retrospective.metric.direction')}
          value={`${stats.directionRate}%`}
          sub={`${stats.directionHit} / ${stats.tickerCount}`}
          tone={stats.directionRate >= 60 ? 'good' : stats.directionRate >= 40 ? 'neutral' : 'bad'}
        />
        <Metric
          icon={<Target className="w-4 h-4 text-blue-500" />}
          label={t('retrospective.metric.target')}
          value={`${stats.targetRate}%`}
          sub={`${stats.targetHit} / ${stats.tickerCount}`}
          tone={stats.targetRate >= 40 ? 'good' : stats.targetRate >= 20 ? 'neutral' : 'bad'}
        />
        <Metric
          icon={<Sparkles className="w-4 h-4 text-violet-500" />}
          label={t('retrospective.metric.alpha')}
          value={
            stats.avgAlpha !== null
              ? `${stats.avgAlpha >= 0 ? '+' : ''}${stats.avgAlpha}%`
              : '—'
          }
          sub={t('retrospective.metric.alpha.sub', { count: stats.alphaTaskCount })}
          tone={
            stats.avgAlpha === null
              ? 'neutral'
              : stats.avgAlpha >= 0
              ? 'good'
              : 'bad'
          }
        />
      </div>

      {/* Breakdown rows */}
      <div className="grid md:grid-cols-2 gap-4">
        <BreakdownCard
          title={t('retrospective.breakdown.timeframe')}
          rows={stats.byTimeframe}
          t={t}
        />
        {stats.scope === 'recommendation' && stats.byStrategy.length > 0 && (
          <BreakdownCard
            title={t('retrospective.breakdown.strategy')}
            rows={stats.byStrategy}
            t={t}
          />
        )}
        <BreakdownCard
          title={t('retrospective.breakdown.direction')}
          rows={stats.byDirection}
          t={t}
        />
      </div>

      {/* Predicted vs Actual — 完整對照表 */}
      <ComparisonTable rows={stats.allEntries} t={t} />

      {/* Top / worst performers */}
      <div className="grid md:grid-cols-2 gap-4">
        <PerformersCard
          title={t('retrospective.top.best')}
          rows={stats.topPerformers}
          tone="good"
          t={t}
        />
        <PerformersCard
          title={t('retrospective.top.worst')}
          rows={stats.worstPerformers}
          tone="bad"
          t={t}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Critique Panel (Phase 2)
// ────────────────────────────────────────────────────────────
function CritiquePanel({
  stats,
  lesson,
  canCritique,
  generating,
  error,
  onGenerate,
  onClear,
  t,
}: {
  stats: RetrospectiveStats;
  lesson: SystemLesson | null;
  canCritique: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  onClear: () => void;
  t: (k: string, opts?: any) => string;
}) {
  const remaining = MIN_OUTCOMES_FOR_CRITIQUE - stats.taskCount;

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{t('retrospective.critique.title')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t('retrospective.critique.subtitle')}</p>
          </div>
        </div>
        {lesson && (
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {t('retrospective.critique.clear')}
          </button>
        )}
      </div>

      {/* Not enough data */}
      {!canCritique && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600">
            {t('retrospective.critique.need.more', {
              remaining,
              min: MIN_OUTCOMES_FOR_CRITIQUE,
            })}
          </div>
        </div>
      )}

      {/* Lesson display */}
      {lesson && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            {t('retrospective.critique.based.on', {
              count: lesson.basedOnCount,
              date: new Date(lesson.generatedAt).toLocaleString(),
            })}
          </div>
          <LessonBlock
            icon={<TrendingDown className="w-4 h-4 text-rose-500" />}
            title={t('retrospective.critique.failure')}
            items={lesson.failurePatterns}
            tone="rose"
          />
          <LessonBlock
            icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
            title={t('retrospective.critique.success')}
            items={lesson.successPatterns}
            tone="emerald"
          />
          <LessonBlock
            icon={<Lightbulb className="w-4 h-4 text-amber-500" />}
            title={t('retrospective.critique.improvements')}
            items={lesson.improvements}
            tone="amber"
          />
        </div>
      )}

      {/* Action button */}
      {canCritique && (
        <div>
          <motion.button
            onClick={onGenerate}
            disabled={generating}
            whileHover={generating ? {} : { scale: 1.02 }}
            whileTap={generating ? {} : { scale: 0.98 }}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-colors',
              'bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:shadow-lg',
              'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('retrospective.critique.generating')}
              </>
            ) : lesson ? (
              <>
                <RefreshCw className="w-4 h-4" />
                {t('retrospective.critique.regenerate', { count: stats.taskCount })}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('retrospective.critique.generate', { count: stats.taskCount })}
              </>
            )}
          </motion.button>
          {error && (
            <p className="text-xs text-rose-500 text-center mt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Reusable bits
// ────────────────────────────────────────────────────────────
function Metric({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'neutral';
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-600'
    : tone === 'bad' ? 'text-rose-600'
    : 'text-slate-900';
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', valueColor)}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  t,
}: {
  title: string;
  rows: BreakdownRow[];
  t: (k: string, opts?: any) => string;
}) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">—</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="text-xs font-semibold text-slate-700 w-20 truncate flex-shrink-0">
                {translateBreakdownLabel(row.label, t)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>
                    {t('retrospective.breakdown.dir')} {row.directionHit}/{row.total}
                  </span>
                  <span className="font-semibold text-slate-700">{row.hitRate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-violet-500"
                    style={{ width: `${Math.max(0, Math.min(100, row.hitRate))}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerformersCard({
  title,
  rows,
  tone,
  t,
}: {
  title: string;
  rows: TickerEntry[];
  tone: 'good' | 'bad';
  t: (k: string, opts?: any) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        {tone === 'good' ? (
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-rose-500" />
        )}
        {title}
      </h3>
      <div className="space-y-3">
        {rows.map((r, i) => {
          const predictedPct = r.startPrice > 0
            ? ((r.targetPrice - r.startPrice) / r.startPrice) * 100
            : 0;
          const deviationPct = r.priceChangePct - predictedPct;
          return (
            <div
              key={`${r.ticker}-${i}`}
              className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5 space-y-1.5"
            >
              {/* Top row: ticker + actual change */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 text-sm">
                  {r.ticker}
                  {getStockName(r.ticker) && (
                    <span className="ml-1 text-xs font-medium text-slate-400">{getStockName(r.ticker)}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'font-bold text-sm flex-shrink-0',
                    r.priceChangePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  )}
                >
                  {r.priceChangePct >= 0 ? '+' : ''}
                  {r.priceChangePct.toFixed(1)}%
                </span>
              </div>
              {/* Bottom row: 起 → 預測 vs 實際 */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="text-slate-400">
                  {t('retrospective.compare.start')} ${r.startPrice.toFixed(2)}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-blue-600">
                  {t('retrospective.compare.target')} ${r.targetPrice.toFixed(2)}
                </span>
                <span className="text-slate-300">·</span>
                <span className={cn(
                  'font-semibold',
                  r.priceChangePct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                )}>
                  {t('retrospective.compare.actual')} ${r.actualPrice.toFixed(2)}
                </span>
                <span
                  className={cn(
                    'ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    Math.abs(deviationPct) <= 2
                      ? 'bg-emerald-100 text-emerald-700'
                      : Math.abs(deviationPct) <= 5
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  )}
                  title={t('retrospective.compare.deviation.tooltip')}
                >
                  Δ {deviationPct >= 0 ? '+' : ''}{deviationPct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Comparison Table — 預測 vs 實際 完整對照
// ────────────────────────────────────────────────────────────
function ComparisonTable({
  rows,
  t,
}: {
  rows: TickerEntry[];
  t: (k: string, opts?: any) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const PREVIEW = 8;
  const visibleRows = expanded ? rows : rows.slice(0, PREVIEW);
  const hasMore = rows.length > PREVIEW;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700">
          {t('retrospective.compare.title')}
        </h3>
        <span className="text-[11px] text-slate-400">
          {t('retrospective.compare.count', { count: rows.length })}
        </span>
      </div>

      {/* Desktop / wide: table */}
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="py-2 px-2 font-medium">{t('retrospective.compare.col.ticker')}</th>
              <th className="py-2 px-2 font-medium">{t('retrospective.compare.col.date')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.start')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.target')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.actual')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.predicted')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.actualPct')}</th>
              <th className="py-2 px-2 font-medium text-right">{t('retrospective.compare.col.deviation')}</th>
              <th className="py-2 px-2 font-medium text-center">{t('retrospective.compare.col.result')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => {
              const predictedPct = r.startPrice > 0
                ? ((r.targetPrice - r.startPrice) / r.startPrice) * 100
                : 0;
              const deviationPct = r.priceChangePct - predictedPct;
              return (
                <tr
                  key={`${r.ticker}-${r.taskDate}-${i}`}
                  className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                >
                  <td className="py-2 px-2 font-bold text-slate-900">
                    <span>{r.ticker}</span>
                    {getStockName(r.ticker) && (
                      <span className="block text-xs font-medium text-slate-400">{getStockName(r.ticker)}</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-500">
                    <div>{r.taskDate.slice(0, 10)}</div>
                    {r.duration && (
                      <div className="text-[10px] text-slate-400">{r.duration}</div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600 tabular-nums">
                    NT${r.startPrice.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-blue-600 font-semibold tabular-nums">
                    NT${r.targetPrice.toFixed(2)}
                  </td>
                  <td className={cn(
                    'py-2 px-2 text-right font-semibold tabular-nums',
                    r.priceChangePct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  )}>
                    NT${r.actualPrice.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                    {predictedPct >= 0 ? '+' : ''}{predictedPct.toFixed(1)}%
                  </td>
                  <td className={cn(
                    'py-2 px-2 text-right font-semibold tabular-nums',
                    r.priceChangePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  )}>
                    {r.priceChangePct >= 0 ? '+' : ''}{r.priceChangePct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold',
                      Math.abs(deviationPct) <= 2
                        ? 'bg-emerald-100 text-emerald-700'
                        : Math.abs(deviationPct) <= 5
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    )}>
                      {deviationPct >= 0 ? '+' : ''}{deviationPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                          r.directionCorrect
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        )}
                        title={t('retrospective.compare.dirHit')}
                      >
                        {r.directionCorrect ? '✓' : '✗'}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                          r.hitTarget
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-400'
                        )}
                        title={t('retrospective.compare.tgtHit')}
                      >
                        {r.hitTarget ? '★' : '·'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2.5">
        {visibleRows.map((r, i) => {
          const predictedPct = r.startPrice > 0
            ? ((r.targetPrice - r.startPrice) / r.startPrice) * 100
            : 0;
          const deviationPct = r.priceChangePct - predictedPct;
          return (
            <div
              key={`${r.ticker}-${r.taskDate}-${i}`}
              className="rounded-lg border border-slate-100 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    {r.ticker}
                    {getStockName(r.ticker) && (
                      <span className="ml-1 text-xs font-medium text-slate-400">{getStockName(r.ticker)}</span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {r.taskDate.slice(0, 10)}
                    {r.duration ? ` · ${r.duration}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                      r.directionCorrect
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    {r.directionCorrect ? '✓' : '✗'}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                      r.hitTarget
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    {r.hitTarget ? '★' : '·'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <div>
                  <div className="text-slate-400 text-[10px]">{t('retrospective.compare.col.start')}</div>
                  <div className="text-slate-700 font-semibold tabular-nums">NT${r.startPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">{t('retrospective.compare.col.target')}</div>
                  <div className="text-blue-600 font-semibold tabular-nums">NT${r.targetPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">{t('retrospective.compare.col.actual')}</div>
                  <div className={cn(
                    'font-semibold tabular-nums',
                    r.priceChangePct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  )}>
                    NT${r.actualPrice.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-50">
                <span className="text-slate-500">
                  {t('retrospective.compare.predicted.short')}{' '}
                  <span className="text-slate-700 font-semibold">
                    {predictedPct >= 0 ? '+' : ''}{predictedPct.toFixed(1)}%
                  </span>
                </span>
                <span className={cn(
                  'font-semibold',
                  r.priceChangePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {t('retrospective.compare.actual.short')}{' '}
                  {r.priceChangePct >= 0 ? '+' : ''}{r.priceChangePct.toFixed(1)}%
                </span>
                <span className={cn(
                  'px-1.5 py-0.5 rounded font-semibold tabular-nums',
                  Math.abs(deviationPct) <= 2
                    ? 'bg-emerald-100 text-emerald-700'
                    : Math.abs(deviationPct) <= 5
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                )}>
                  Δ {deviationPct >= 0 ? '+' : ''}{deviationPct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          {expanded
            ? t('retrospective.compare.collapse')
            : t('retrospective.compare.expand', { remaining: rows.length - PREVIEW })}
        </button>
      )}

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-100 border border-emerald-200" />
          {t('retrospective.compare.legend.close')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-100 border border-amber-200" />
          {t('retrospective.compare.legend.medium')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-100 border border-rose-200" />
          {t('retrospective.compare.legend.far')}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          ✓ {t('retrospective.compare.legend.dir')} · ★ {t('retrospective.compare.legend.tgt')}
        </span>
      </div>
    </div>
  );
}

function LessonBlock({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: 'rose' | 'emerald' | 'amber';
}) {
  if (items.length === 0) return null;
  const bgClass =
    tone === 'rose' ? 'bg-rose-50/50 border-rose-100'
    : tone === 'emerald' ? 'bg-emerald-50/50 border-emerald-100'
    : 'bg-amber-50/50 border-amber-100';

  return (
    <div className={cn('rounded-xl border p-4', bgClass)}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-xs font-bold text-slate-700">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
            <span className="text-slate-400 flex-shrink-0">{i + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-card p-12 flex flex-col items-center justify-center min-h-60">
      <BarChart3 className="w-12 h-12 text-slate-300 mb-3" />
      <p className="text-sm text-slate-400 text-center max-w-xs">{message}</p>
    </div>
  );
}

function translateBreakdownLabel(label: string, t: (k: string) => string): string {
  // 一些已知 label 對應 i18n key；找不到就原樣回傳
  const map: Record<string, string> = {
    aggressive: 'retrospective.label.aggressive',
    balanced: 'retrospective.label.balanced',
    conservative: 'retrospective.label.conservative',
    bullish: 'retrospective.label.bullish',
    bearish: 'retrospective.label.bearish',
  };
  const key = map[label];
  if (key) {
    const v = t(key);
    return v && v !== key ? v : label;
  }
  return label;
}
