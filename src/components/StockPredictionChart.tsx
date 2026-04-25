import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle,
  Star,
  Calendar,
  BarChart3,
  Shield,
  Activity,
  Gauge,
  Shuffle,
  Target,
  Zap,
  Users,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MonteCarloResult, EntryTimingResult } from '@/lib/finance';

// ─── Interfaces ───
interface TrendDataPoint {
  date: string;
  price: number;
  upperBand?: number;
  lowerBand?: number;
  bandWidth?: number;
  label?: string;
}

interface KeyEvent {
  date: string;
  type: 'earnings' | 'exDividend' | 'fda' | 'conference' | 'other';
  description: string;
}

interface PredictionResult {
  ticker: string;
  name?: string;
  currentPrice: number;
  targetPrice: number;
  prediction: {
    direction: 'Bullish' | 'Bearish' | 'Neutral';
    confidence: number;
    rationale: string;
  };
  predictionTrend: TrendDataPoint[];
  catalysts: string[];
  bearCase: string;
  technicals: {
    supportLevels?: { price: number; label: string }[];
    resistanceLevels?: { price: number; label: string }[];
    support?: number;
    resistance?: number;
  };
  timeStop: number;
  keyEvents?: KeyEvent[];
  technicalScore?: {
    overall: number;
    indicators: { name: string; score: number; direction: string; detail: string }[];
  };
  fundamentalScore?: {
    overall: number;
    metrics: { name: string; score: number; direction: string; detail: string }[];
  };
  institutionalActivity?: {
    netInstitutionalFlow: string;
    recentInsiderTrades: string;
    topHolderChange: string;
  };
  sentiment?: {
    newsRatio: { positive: number; negative: number; neutral: number };
    analystRatings: { buy: number; hold: number; sell: number };
    summary: string;
  };
  scenarios?: {
    bull: { probability: number; targetPrice: number; narrative: string };
    base: { probability: number; targetPrice: number; narrative: string };
    bear: { probability: number; targetPrice: number; narrative: string };
  } | null;
  riskMetrics?: {
    beta: number;
    maxDrawdownEstimate: number;
    sharpeRatio: number;
  };
  personaAnalysis?: {
    id: 'value' | 'trader' | 'growth' | 'contrarian' | 'innovation' | 'trump';
    verdict: 'Buy' | 'Hold' | 'Avoid';
    score: number;
    headline: string;
    reasoning: string;
  }[];
}

const PERSONA_CONFIG: Record<string, { bg: string; border: string; scoreColor: string; icon: string }> = {
  value:       { bg: 'bg-amber-50',   border: 'border-amber-200',  scoreColor: 'text-amber-700',  icon: '💎' },
  trader:      { bg: 'bg-orange-50',  border: 'border-orange-200', scoreColor: 'text-orange-700', icon: '🌐' },
  growth:      { bg: 'bg-sky-50',     border: 'border-sky-200',    scoreColor: 'text-sky-700',    icon: '📈' },
  contrarian:  { bg: 'bg-red-50',     border: 'border-red-200',    scoreColor: 'text-red-700',    icon: '🔄' },
  innovation:  { bg: 'bg-violet-50',  border: 'border-violet-200', scoreColor: 'text-violet-700', icon: '🚀' },
  trump:       { bg: 'bg-rose-50',    border: 'border-rose-200',   scoreColor: 'text-rose-700',   icon: '🏛️' },
};

interface StockPredictionChartProps {
  result: PredictionResult;
  monteCarloResult?: MonteCarloResult | null;
  entryTimingResult?: EntryTimingResult | null;
  volatilityMetrics?: { atr: number; historicalVol: number; beta: number } | null;
  onAddToWatchlist?: () => void;
  isWatched?: boolean;
  aiAnalyzing?: boolean;
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
}

// ─── Helpers ───
const ScoreBar = ({ score, color = 'blue' }: { score: number; color?: string }) => {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-600 to-blue-400',
    green: 'from-emerald-600 to-emerald-400',
    red: 'from-red-600 to-red-400',
    amber: 'from-amber-600 to-amber-400',
  };
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        transition={{ duration: 1, delay: 0.2 }}
        className={`h-full bg-gradient-to-r ${colorMap[color] || colorMap.blue}`}
      />
    </div>
  );
};

const DirectionBadge = ({ direction, t }: { direction: string; t: any }) => {
  const config: Record<string, { bg: string; text: string; key: string }> = {
    Bullish: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', key: 'prediction.score.bullish' },
    Bearish: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', key: 'prediction.score.bearish' },
    Neutral: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', key: 'prediction.score.neutral' },
    Positive: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', key: 'prediction.score.positive' },
    Negative: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', key: 'prediction.score.negative' },
  };
  const c = config[direction] || config.Neutral;
  return (
    <span className={cn('px-2 py-0.5 rounded-md text-xs font-semibold border', c.bg, c.text)}>
      {t(c.key)}
    </span>
  );
};

const StackedBar = ({ segments }: { segments: { value: number; color: string; label: string }[] }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-1 w-full">
      <div className="flex-1 flex rounded-full overflow-hidden h-3">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={seg.color}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex gap-2 ml-2 flex-shrink-0">
        {segments.map((seg, i) => (
          <span key={i} className="text-xs text-slate-500">{seg.label}: {seg.value}</span>
        ))}
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="glass-card p-3 rounded-lg shadow-lg">
        <p className="text-sm font-semibold text-slate-900">{d?.date}</p>
        <p className="text-sm text-blue-600 font-bold">
          NT${d?.price?.toFixed(2)}
        </p>
        {d?.upperBand && (
          <p className="text-xs text-slate-400">
            NT${d.lowerBand?.toFixed(2)} ~ ${d.upperBand?.toFixed(2)}
          </p>
        )}
        {d?.label && <p className="text-xs text-slate-500 mt-1">{d.label}</p>}
      </div>
    );
  }
  return null;
};

// ─── Main Component ───
export default function StockPredictionChart({ result, monteCarloResult, entryTimingResult, volatilityMetrics, onAddToWatchlist, isWatched = false, aiAnalyzing = false, onAnalyze }: StockPredictionChartProps) {
  const { t } = useTranslation();
  const [whatIfScenario, setWhatIfScenario] = React.useState<string | null>(null);

  const {
    ticker, currentPrice, targetPrice, prediction, predictionTrend,
    catalysts, bearCase, technicals, timeStop,
    keyEvents, technicalScore, fundamentalScore,
    institutionalActivity, sentiment, scenarios, riskMetrics,
  } = result;

  // Chart data — filter any trend points with non-finite price
  const safeCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 1;
  const data = (predictionTrend || [])
    .filter((d) => d && Number.isFinite(d.price) && d.price > 0)
    .map((d) => ({
      ...d,
      price: d.price,
      lowerBand: Number.isFinite(d.lowerBand) && d.lowerBand! > 0 ? d.lowerBand : d.price * 0.98,
      upperBand: Number.isFinite(d.upperBand) && d.upperBand! > 0 ? d.upperBand : d.price * 1.02,
    }));

  const allPrices = data.flatMap(d => [d.price, d.upperBand as number, d.lowerBand as number]);
  const supportLevels = (technicals?.supportLevels || []).filter(s => Number.isFinite(s?.price) && s.price > 0);
  const resistanceLevels = (technicals?.resistanceLevels || []).filter(r => Number.isFinite(r?.price) && r.price > 0);
  if (Number.isFinite(timeStop) && (timeStop as number) > 0) allPrices.push(timeStop);
  else allPrices.push(safeCurrentPrice * 0.9);
  if (Number.isFinite(targetPrice) && (targetPrice as number) > 0) allPrices.push(targetPrice);
  else allPrices.push(safeCurrentPrice * 1.1);
  supportLevels.forEach(s => allPrices.push(s.price));
  resistanceLevels.forEach(r => allPrices.push(r.price));

  const validPrices = allPrices.filter(p => Number.isFinite(p) && p > 0);
  let minPrice = (validPrices.length > 0 ? Math.min(...validPrices) : safeCurrentPrice * 0.9) * 0.97;
  let maxPrice = (validPrices.length > 0 ? Math.max(...validPrices) : safeCurrentPrice * 1.1) * 1.03;
  // Final sanity: ensure finite & strictly ordered; otherwise Recharts blanks
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    minPrice = safeCurrentPrice * 0.9;
    maxPrice = safeCurrentPrice * 1.1;
  }

  const potentialReturn = currentPrice > 0 ? (((targetPrice - currentPrice) / currentPrice) * 100).toFixed(2) : '0';

  const directionColor = prediction?.direction === 'Bullish' ? 'text-emerald-600' : prediction?.direction === 'Bearish' ? 'text-red-600' : 'text-slate-500';
  const DirectionIcon = prediction?.direction === 'Bullish' ? TrendingUp : prediction?.direction === 'Bearish' ? TrendingDown : Minus;

  // Event dates for chart markers
  const eventDates = new Set((keyEvents || []).map(e => e.date));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ═══ Section 1: Header + Price Summary ═══ */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-slate-900">{ticker}</h3>
              {result.name && (
                <span className="text-base font-medium text-slate-500">{result.name}</span>
              )}
            </div>
            <div className={`flex items-center gap-1 ${directionColor}`}>
              <DirectionIcon className="w-5 h-5" />
              <span className="text-sm font-bold">{prediction?.direction}</span>
            </div>
            <span className="text-sm font-bold text-blue-600 font-data">
              {prediction?.confidence}%
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {onAnalyze && ticker && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onAnalyze(ticker)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all"
                aria-label={t('cta.analyze')}
              >
                <LineChartIcon className="w-4 h-4" />
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-data">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">{t('prediction.chart.current')}</p>
            <p className="text-lg font-bold text-slate-900">
              NT${currentPrice?.toFixed(2)}
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">{t('prediction.chart.target')}</p>
            <p className="text-lg font-bold text-blue-600">
              NT${targetPrice?.toFixed(2)}
            </p>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">{t('prediction.chart.stoploss')}</p>
            <p className="text-lg font-bold text-red-600">
              NT${timeStop?.toFixed(2)}
            </p>
          </div>
          <div className={cn('rounded-xl p-3', parseFloat(potentialReturn) >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
            <p className="text-xs text-slate-400 mb-1">{t('prediction.chart.potential')}</p>
            <p className={cn('text-lg font-bold font-data', parseFloat(potentialReturn) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {parseFloat(potentialReturn) >= 0 ? '+' : ''}{potentialReturn}%
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Chart with Confidence Band ═══ */}
      {data.length > 0 && (
        <div className="glass-card p-6 relative">
          {aiAnalyzing && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600">{t('ai.thinking')}</p>
            </div>
          )}
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis domain={[minPrice, maxPrice]} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <Tooltip content={<CustomTooltip />} />

              {/* Confidence band: upper and lower boundary lines */}
              <Line type="monotone" dataKey="upperBand" stroke="#8C95C0" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="lowerBand" stroke="#8C95C0" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />

              {/* Main price line with gradient fill — HOKI 染靛 */}
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2E3D6B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2E3D6B" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="price" stroke="#2E3D6B" strokeWidth={2.5} fill="url(#priceGradient)" dot={{ fill: '#2E3D6B', r: 2.5, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#2E3D6B' }} />

              {/* Support levels — 台股紅漲：支撐位 = 反彈起點 = 朱紅 */}
              {supportLevels.map((s, i) => (
                <ReferenceLine key={`s${i}`} y={s.price} stroke="#C8553D" strokeDasharray="6 4" strokeWidth={1} label={{ value: s.label, position: 'left', fill: '#C8553D', fontSize: 10 }} />
              ))}

              {/* Resistance levels — 上方壓力 = 金箔（中性警示，不用綠避免與下檔混淆） */}
              {resistanceLevels.map((r, i) => (
                <ReferenceLine key={`r${i}`} y={r.price} stroke="#C8A85C" strokeDasharray="6 4" strokeWidth={1} label={{ value: r.label, position: 'left', fill: '#A88838', fontSize: 10 }} />
              ))}

              {/* Target line（觀察目標）= 染靛主色  / Stop（風險觀察線）= 松綠（台股綠跌） */}
              <ReferenceLine y={targetPrice} stroke="#3F4E89" strokeDasharray="8 4" strokeWidth={1.5} />
              <ReferenceLine y={timeStop} stroke="#5C7C5C" strokeDasharray="8 4" strokeWidth={1.5} />

              {/* Key event markers */}
              {(keyEvents || []).map((evt, i) => {
                const matchPoint = data.find(d => d.date === evt.date);
                if (!matchPoint) return null;
                return (
                  <ReferenceDot
                    key={`evt${i}`}
                    x={evt.date}
                    y={matchPoint.price}
                    r={6}
                    fill="#f59e0b"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-0.5 bg-blue-600 rounded" /><span className="text-xs text-slate-500">{t('prediction.chart.trend')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-3 bg-blue-100 rounded-sm opacity-60" /><span className="text-xs text-slate-500">{t('prediction.chart.confidenceBand')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-0 border-t-2 border-dashed border-blue-400" /><span className="text-xs text-slate-500">{t('prediction.chart.targetline')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-0 border-t-2 border-dashed border-red-400" /><span className="text-xs text-slate-500">{t('prediction.chart.stoplossline')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-0 border-t border-dashed border-emerald-500" /><span className="text-xs text-slate-500">{t('prediction.chart.supportLevel')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-0 border-t border-dashed border-amber-500" /><span className="text-xs text-slate-500">{t('prediction.chart.resistanceLevel')}</span>
            </div>
            {(keyEvents || []).length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
                <div className="w-3 h-3 rounded-full bg-amber-400" /><span className="text-xs text-slate-500">{t('prediction.chart.events')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Section 3: Scenario Analysis ═══ */}
      {scenarios && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            {t('prediction.scenarios')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'bull', data: scenarios.bull, color: 'emerald', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-700' },
              { key: 'base', data: scenarios.base, color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700' },
              { key: 'bear', data: scenarios.bear, color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
            ].map(({ key, data: sc, bgColor, borderColor, textColor }) => (
              <motion.div
                key={key}
                className={cn('rounded-xl p-4 border', bgColor, borderColor)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: key === 'bull' ? 0.15 : key === 'base' ? 0.25 : 0.35 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className={cn('text-sm font-bold', textColor)}>
                    {t(`prediction.scenarios.${key}`)}
                  </h5>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold font-data', textColor, `${bgColor}`)}>
                    {sc?.probability}%
                  </span>
                </div>
                <p className={cn('text-xl font-bold font-data mb-2', textColor)}>
                  NT${sc?.targetPrice?.toFixed(2)}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">{sc?.narrative}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ Section 4: Technical Score ═══ */}
      {technicalScore && technicalScore.indicators.length > 0 && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              {t('prediction.technicalScore')}
            </h4>
            <span className="text-2xl font-bold text-blue-600 font-data">
              {technicalScore.overall}
            </span>
          </div>
          <ScoreBar score={technicalScore.overall} />
          <div className="mt-4 space-y-3">
            {technicalScore.indicators.map((ind, i) => {
              const nameMap: Record<string, string> = {
                RSI: 'prediction.technicalScore.rsi',
                MACD: 'prediction.technicalScore.macd',
                Bollinger: 'prediction.technicalScore.bollinger',
                MA_Alignment: 'prediction.technicalScore.maAlignment',
                Granville: 'prediction.technicalScore.granville',
              };
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-24 md:w-32 flex-shrink-0">
                    <p className="text-xs font-semibold text-slate-700">{t(nameMap[ind.name] || ind.name)}</p>
                  </div>
                  <div className="flex-1"><ScoreBar score={ind.score} color={ind.direction === 'Bullish' ? 'green' : ind.direction === 'Bearish' ? 'red' : 'blue'} /></div>
                  <span className="text-xs font-bold text-slate-600 w-8 text-right font-data">{ind.score}</span>
                  <DirectionBadge direction={ind.direction} t={t} />
                </div>
              );
            })}
          </div>
          {technicalScore.indicators.length > 0 && (
            <div className="mt-3 space-y-1">
              {technicalScore.indicators.map((ind, i) => (
                <p key={i} className="text-xs text-slate-500">
                  <span className="font-semibold">{t(`prediction.technicalScore.${ind.name === 'MA_Alignment' ? 'maAlignment' : ind.name === 'Granville' ? 'granville' : ind.name.toLowerCase()}` as any)}:</span> {ind.detail}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ Section 5: Fundamental Score ═══ */}
      {fundamentalScore && fundamentalScore.metrics.length > 0 && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              {t('prediction.fundamentalScore')}
            </h4>
            <span className="text-2xl font-bold text-blue-600 font-data">
              {fundamentalScore.overall}
            </span>
          </div>
          <ScoreBar score={fundamentalScore.overall} />
          <div className="mt-4 space-y-3">
            {fundamentalScore.metrics.map((m, i) => {
              const nameMap: Record<string, string> = {
                PE_vs_Peers: 'prediction.fundamentalScore.pe',
                Revenue_Growth: 'prediction.fundamentalScore.revenueGrowth',
                FCF_Yield: 'prediction.fundamentalScore.fcf',
                Debt_Ratio: 'prediction.fundamentalScore.debtRatio',
              };
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-24 md:w-32 flex-shrink-0">
                    <p className="text-xs font-semibold text-slate-700">{t(nameMap[m.name] || m.name)}</p>
                  </div>
                  <div className="flex-1"><ScoreBar score={m.score} color={m.direction === 'Positive' ? 'green' : m.direction === 'Negative' ? 'red' : 'blue'} /></div>
                  <span className="text-xs font-bold text-slate-600 w-8 text-right">{m.score}</span>
                  <DirectionBadge direction={m.direction} t={t} />
                </div>
              );
            })}
          </div>
          {fundamentalScore.metrics.length > 0 && (
            <div className="mt-3 space-y-1">
              {fundamentalScore.metrics.map((m, i) => (
                <p key={i} className="text-xs text-slate-500">
                  <span className="font-semibold">{t(`prediction.fundamentalScore.${m.name === 'PE_vs_Peers' ? 'pe' : m.name === 'Revenue_Growth' ? 'revenueGrowth' : m.name === 'FCF_Yield' ? 'fcf' : 'debtRatio'}` as any)}:</span> {m.detail}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ Section 6: Sentiment ═══ */}
      {sentiment && (sentiment.newsRatio.positive + sentiment.newsRatio.negative + sentiment.newsRatio.neutral > 0 || sentiment.analystRatings.buy + sentiment.analystRatings.hold + sentiment.analystRatings.sell > 0) && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4">{t('prediction.sentiment')}</h4>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">{t('prediction.sentiment.news')}</p>
              <StackedBar segments={[
                { value: sentiment.newsRatio.positive, color: 'bg-emerald-400', label: t('prediction.sentiment.positive') },
                { value: sentiment.newsRatio.neutral, color: 'bg-slate-300', label: t('prediction.sentiment.neutral') },
                { value: sentiment.newsRatio.negative, color: 'bg-red-400', label: t('prediction.sentiment.negative') },
              ]} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">{t('prediction.sentiment.analyst')}</p>
              <StackedBar segments={[
                { value: sentiment.analystRatings.buy, color: 'bg-emerald-400', label: t('prediction.sentiment.buy') },
                { value: sentiment.analystRatings.hold, color: 'bg-amber-300', label: t('prediction.sentiment.hold') },
                { value: sentiment.analystRatings.sell, color: 'bg-red-400', label: t('prediction.sentiment.sell') },
              ]} />
            </div>
            {sentiment.summary && <p className="text-sm text-slate-500 leading-relaxed">{sentiment.summary}</p>}
          </div>
        </motion.div>
      )}

      {/* ═══ Section 7: Institutional / Insider ═══ */}
      {institutionalActivity && (institutionalActivity.recentInsiderTrades || institutionalActivity.topHolderChange) && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4">{t('prediction.institutional')}</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 w-28 flex-shrink-0">{t('prediction.institutional.flow')}</span>
              <span className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold',
                institutionalActivity.netInstitutionalFlow === 'Accumulating' ? 'bg-emerald-50 text-emerald-700' :
                institutionalActivity.netInstitutionalFlow === 'Distributing' ? 'bg-red-50 text-red-700' :
                'bg-slate-100 text-slate-600'
              )}>
                {t(`prediction.institutional.${institutionalActivity.netInstitutionalFlow.toLowerCase()}`)}
              </span>
            </div>
            {institutionalActivity.recentInsiderTrades && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">{t('prediction.institutional.insider')}</p>
                <p className="text-sm text-slate-600">{institutionalActivity.recentInsiderTrades}</p>
              </div>
            )}
            {institutionalActivity.topHolderChange && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">{t('prediction.institutional.topHolder')}</p>
                <p className="text-sm text-slate-600">{institutionalActivity.topHolderChange}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ Section 8: Risk Metrics ═══ */}
      {riskMetrics && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4">{t('prediction.riskMetrics')}</h4>
          <div className="grid grid-cols-3 gap-4 font-data">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.riskMetrics.beta')}</p>
              <p className={cn('text-2xl font-bold', riskMetrics.beta > 1.5 ? 'text-orange-600' : riskMetrics.beta > 1 ? 'text-amber-600' : 'text-emerald-600')}>
                {riskMetrics.beta?.toFixed(2)}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.riskMetrics.maxDrawdown')}</p>
              <p className="text-2xl font-bold text-red-600">
                {riskMetrics.maxDrawdownEstimate?.toFixed(1)}%
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.riskMetrics.sharpe')}</p>
              <p className={cn('text-2xl font-bold', riskMetrics.sharpeRatio >= 1 ? 'text-emerald-600' : riskMetrics.sharpeRatio >= 0.5 ? 'text-amber-600' : 'text-red-600')}>
                {riskMetrics.sharpeRatio?.toFixed(2)}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Section 9: Key Events ═══ */}
      {keyEvents && keyEvents.length > 0 && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {t('prediction.chart.events')}
          </h4>
          <div className="space-y-2">
            {keyEvents.map((evt, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <span className="text-xs font-bold text-slate-500 w-20 flex-shrink-0 font-data">{evt.date.slice(5)}</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
                  {t(`prediction.eventType.${evt.type}`)}
                </span>
                <span className="text-sm text-slate-600">{evt.description}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ Section 10: Rationale ═══ */}
      {prediction?.rationale && (
        <div className="glass-card p-6">
          <p className="text-sm font-semibold text-slate-700 mb-2">{t('ai.rationale')}</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            {(() => {
              const clampRegex = /\s*\[⚡[^\]]*\]/;
              const r = prediction.rationale || '';
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
      )}

      {/* ═══ Section 11: Catalysts ═══ */}
      {catalysts && catalysts.length > 0 && (
        <div className="glass-card p-6">
          <p className="text-sm font-semibold text-slate-700 mb-3">{t('prediction.catalysts')}</p>
          <ul className="space-y-2">
            {catalysts.map((c, i) => (
              <li key={i} className="text-sm text-slate-500 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══ Section 12: Bear Case ═══ */}
      {bearCase && (
        <div className="glass-card p-6 border-red-200 bg-red-50/50">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">{t('prediction.bearcase')}</p>
              <p className="text-sm text-red-600">{bearCase}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Section 13: Monte Carlo Simulation ═══ */}
      {monteCarloResult && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-blue-600" />
            {t('prediction.monteCarlo')}
          </h4>
          <p className="text-xs text-slate-400 mb-4">{t('prediction.monteCarlo.subtitle', { count: 500 })}</p>

          {/* Monte Carlo Band Chart — filter out non-finite percentile values */}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monteCarloResult.dates
              .map((date, i) => ({
                date,
                p5: monteCarloResult.percentiles.p5[i],
                p25: monteCarloResult.percentiles.p25[i],
                p50: monteCarloResult.percentiles.p50[i],
                p75: monteCarloResult.percentiles.p75[i],
                p95: monteCarloResult.percentiles.p95[i],
              }))
              .filter(d =>
                Number.isFinite(d.p5) && Number.isFinite(d.p25) &&
                Number.isFinite(d.p50) && Number.isFinite(d.p75) &&
                Number.isFinite(d.p95)
              )} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} domain={['auto', 'auto']} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="glass-card p-3 rounded-lg shadow-lg">
                    <p className="text-xs font-semibold text-slate-700">{d?.date}</p>
                    <p className="text-xs text-red-500">{t('prediction.monteCarlo.p5')}: ${d?.p5?.toFixed(2)}</p>
                    <p className="text-xs text-amber-500">P25: ${d?.p25?.toFixed(2)}</p>
                    <p className="text-xs text-blue-600 font-bold font-data">{t('prediction.monteCarlo.median')}: ${d?.p50?.toFixed(2)}</p>
                    <p className="text-xs text-amber-500">P75: ${d?.p75?.toFixed(2)}</p>
                    <p className="text-xs text-emerald-500">{t('prediction.monteCarlo.p95')}: ${d?.p95?.toFixed(2)}</p>
                  </div>
                );
              }} />
              <defs>
                <linearGradient id="mc95" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DDE0F0" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#DDE0F0" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="mc75" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8C95C0" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8C95C0" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="p95" stroke="none" fill="url(#mc95)" />
              <Area type="monotone" dataKey="p75" stroke="none" fill="url(#mc75)" />
              <Area type="monotone" dataKey="p25" stroke="none" fill="#fff" fillOpacity={1} />
              <Area type="monotone" dataKey="p5" stroke="none" fill="#fff" fillOpacity={1} />
              {/* Monte Carlo 樂觀帶（p95）= 朱紅淺 / 悲觀帶（p5）= 松綠淺 — 台股紅漲綠跌 */}
              <Line type="monotone" dataKey="p95" stroke="#E8B5A6" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="p5" stroke="#B6C8B8" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="p50" stroke="#2E3D6B" strokeWidth={2.5} dot={false} />
              {targetPrice && <ReferenceLine y={targetPrice} stroke="#C8553D" strokeDasharray="6 4" strokeWidth={1} />}
              {timeStop && <ReferenceLine y={timeStop} stroke="#5C7C5C" strokeDasharray="6 4" strokeWidth={1} />}
            </ComposedChart>
          </ResponsiveContainer>

          {/* MC Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 font-data">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.monteCarlo.median')}</p>
              <p className="text-lg font-bold text-blue-600">
                NT${monteCarloResult.finalPriceDistribution.median.toFixed(2)}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.monteCarlo.aboveTarget')}</p>
              <p className="text-lg font-bold text-emerald-600">
                {monteCarloResult.probabilityAboveTarget.toFixed(1)}%
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.monteCarlo.belowStop')}</p>
              <p className="text-lg font-bold text-red-600">
                {monteCarloResult.probabilityBelowStop.toFixed(1)}%
              </p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.monteCarlo.var95')}</p>
              <p className="text-lg font-bold text-amber-600">
                NT${monteCarloResult.var95.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Final Range */}
          <div className="mt-3 bg-slate-50 rounded-xl p-3 font-data">
            <p className="text-xs text-slate-400 mb-2">{t('prediction.monteCarlo.finalRange')}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-500">
                NT${monteCarloResult.finalPriceDistribution.p5.toFixed(2)}
              </span>
              <div className="flex-1 h-2 bg-gradient-to-r from-red-200 via-blue-300 to-emerald-200 rounded-full" />
              <span className="text-xs font-bold text-emerald-500">
                NT${monteCarloResult.finalPriceDistribution.p95.toFixed(2)}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Section 14: Volatility Metrics ═══ */}
      {volatilityMetrics && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
          <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-600" />
            {t('prediction.volatility')}
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.volatility.atr')}</p>
              <p className="text-2xl font-bold text-slate-900 font-data">
                NT${volatilityMetrics.atr.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('prediction.volatility.atrDesc')}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.volatility.historical')}</p>
              <p className={cn('text-2xl font-bold font-data', volatilityMetrics.historicalVol > 0.4 ? 'text-red-600' : volatilityMetrics.historicalVol > 0.25 ? 'text-amber-600' : 'text-emerald-600')}>
                {(volatilityMetrics.historicalVol * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('prediction.volatility.historicalDesc')}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{t('prediction.volatility.beta')}</p>
              <p className={cn('text-2xl font-bold font-data', volatilityMetrics.beta > 1.5 ? 'text-red-600' : volatilityMetrics.beta > 1 ? 'text-amber-600' : 'text-emerald-600')}>
                {volatilityMetrics.beta.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('prediction.volatility.betaDesc')}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Section 15: Entry Timing Score ═══ */}
      {entryTimingResult && (
        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              {t('prediction.entryTiming')}
            </h4>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-blue-600 font-data">
                {entryTimingResult.score}
              </span>
              <span className={cn(
                'px-3 py-1 rounded-full text-xs font-bold',
                entryTimingResult.recommendation === 'strong_buy' ? 'bg-emerald-100 text-emerald-700' :
                entryTimingResult.recommendation === 'buy' ? 'bg-emerald-50 text-emerald-600' :
                entryTimingResult.recommendation === 'neutral' ? 'bg-slate-100 text-slate-600' :
                entryTimingResult.recommendation === 'sell' ? 'bg-red-50 text-red-600' :
                'bg-red-100 text-red-700'
              )}>
                {t(`prediction.entryTiming.${entryTimingResult.recommendation}`)}
              </span>
            </div>
          </div>

          {/* Score bar */}
          <div className="relative w-full h-4 bg-gradient-to-r from-red-200 via-amber-200 via-50% to-emerald-200 rounded-full mb-4 overflow-hidden">
            <motion.div
              initial={{ left: '0%' }}
              animate={{ left: `${Math.min(100, Math.max(0, entryTimingResult.score))}%` }}
              transition={{ duration: 1.2, delay: 0.3 }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white border-2 border-blue-600 rounded-full shadow-md"
            />
          </div>

          {/* Signals */}
          <div className="space-y-2.5 mt-4">
            {entryTimingResult.signals.map((sig, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-28 flex-shrink-0">
                  <p className="text-xs font-semibold text-slate-700">{sig.name}</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500">{sig.value}</p>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded-md text-xs font-semibold border',
                  sig.signal === 'buy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  sig.signal === 'sell' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-slate-50 text-slate-600 border-slate-200'
                )}>
                  {t(`prediction.entryTiming.signal.${sig.signal}`)}
                </span>
                <span className="text-xs text-slate-400 w-8 text-right font-data">
                  {sig.weight}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ Section 16: What-If Scenarios ═══ */}
      <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
        <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          {t('prediction.whatIf')}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'marketDrop', impact: -(volatilityMetrics?.beta ?? (riskMetrics?.beta ?? 1)) * 5, color: 'red' },
            { key: 'marketRally', impact: (volatilityMetrics?.beta ?? (riskMetrics?.beta ?? 1)) * 5, color: 'emerald' },
            { key: 'earningsBeat', impact: 8, color: 'emerald' },
            { key: 'earningsMiss', impact: -10, color: 'red' },
          ].map(({ key, impact, color }) => {
            const impactPrice = currentPrice * (1 + impact / 100);
            const isSelected = whatIfScenario === key;
            return (
              <motion.button
                key={key}
                onClick={() => setWhatIfScenario(isSelected ? null : key)}
                className={cn(
                  'rounded-xl p-4 text-left border transition-all',
                  isSelected
                    ? color === 'emerald' ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'
                    : 'bg-slate-50 border-transparent hover:border-slate-200'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <p className="text-xs font-semibold text-slate-700 mb-1">{t(`prediction.whatIf.${key}`)}</p>
                <p className={cn('text-lg font-bold font-data', color === 'emerald' ? 'text-emerald-600' : 'text-red-600')}>
                  {impact >= 0 ? '+' : ''}{impact.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-400 mt-1 font-data">
                  → ${impactPrice.toFixed(2)}
                </p>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══ Section 17: 6 Investment Style Persona Analysis ═══ */}
      {Array.isArray(result.personaAnalysis) && result.personaAnalysis.length > 0 && (() => {
        const personas = result.personaAnalysis!;
        const buyCount = personas.filter(p => p.verdict === 'Buy').length;
        const avoidCount = personas.filter(p => p.verdict === 'Avoid').length;
        const total = personas.length;
        const consensusKey = buyCount >= total - 1 ? 'strong_buy'
          : buyCount > total / 2 ? 'lean_buy'
          : avoidCount > total / 2 ? 'cautious'
          : 'divided';
        const consensusColor = consensusKey === 'strong_buy' ? 'bg-emerald-100 text-emerald-700'
          : consensusKey === 'lean_buy' ? 'bg-sky-100 text-sky-700'
          : consensusKey === 'cautious' ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700';

        return (
          <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {t('prediction.persona.title')}
              </h4>
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', consensusColor)}>
                {t('prediction.persona.consensus')}: {t(`prediction.persona.consensus.${consensusKey}`)}
              </span>
            </div>
            <div className="space-y-3">
              {personas.map((persona, i) => {
                const config = PERSONA_CONFIG[persona.id] || PERSONA_CONFIG['value'];
                return (
                  <motion.div
                    key={persona.id}
                    className={cn('rounded-xl p-4 border', config.bg, config.border)}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">{config.icon}</span>
                          <span className="text-sm font-bold text-slate-800">
                            {t(`prediction.persona.${persona.id}`)}
                          </span>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-bold',
                            persona.verdict === 'Buy'   ? 'bg-emerald-100 text-emerald-700' :
                            persona.verdict === 'Avoid' ? 'bg-red-100 text-red-700' :
                                                          'bg-slate-100 text-slate-600'
                          )}>
                            {t(`prediction.persona.verdict.${persona.verdict.toLowerCase()}`)}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 mb-1 italic">「{persona.headline}」</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{persona.reasoning}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className={cn('text-2xl font-bold font-data', config.scoreColor)}>{persona.score}</p>
                        <p className="text-xs text-slate-400">{t('prediction.persona.conviction')}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <ScoreBar
                        score={persona.score}
                        color={persona.verdict === 'Buy' ? 'green' : persona.verdict === 'Avoid' ? 'red' : 'blue'}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })()}

    </motion.div>
  );
}
