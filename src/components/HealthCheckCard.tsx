import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  CheckCircle,
  AlertCircle,
  TrendingDown,
  PieChart as PieIcon,
  Star,
  LineChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTOR_ZH: Record<string, string> = {
  'Information Technology': '資訊科技',
  'Technology': '科技',
  'Communication Services': '通訊服務',
  'Consumer Discretionary': '非必需消費',
  'Consumer Staples': '必需消費',
  'Health Care': '醫療保健',
  'Healthcare': '醫療保健',
  'Financials': '金融',
  'Financial Services': '金融服務',
  'Energy': '能源',
  'Materials': '原材料',
  'Industrials': '工業',
  'Real Estate': '房地產',
  'Utilities': '公用事業',
  'Diversified US': '美國多元化',
  'Diversified International': '國際多元化',
  'ETF': 'ETF',
};

interface HoldingAnalysis {
  ticker: string;
  assessment: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  recommendation: string;
}

interface DiversificationAnalysis {
  sectorExposure: Record<string, number>;
  concentration: string;
  correlationIssues?: string[];
}

interface HealthCheckResult {
  overallHealth: string;
  portfolioScore: number;
  holdingsAnalysis: HoldingAnalysis[];
  diversificationAnalysis: DiversificationAnalysis;
  recommendations: string[];
  rebalancingSuggestions?: string[];
}

interface HealthCheckCardProps {
  result: HealthCheckResult;
  onAddToWatchlist?: (ticker: string) => void;
  watchedTickers?: string[];
  /** 跳到個股預測並自動填入 ticker。沒傳就不顯示按鈕。 */
  onAnalyze?: (ticker: string) => void;
}

const getRiskColor = (level: string) => {
  switch (level) {
    case 'Low':
      return 'text-emerald-600 bg-emerald-50';
    case 'Medium':
      return 'text-amber-600 bg-amber-50';
    case 'High':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-slate-500 bg-slate-50';
  }
};

export default function HealthCheckCard({ result, onAddToWatchlist, watchedTickers = [], onAnalyze }: HealthCheckCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {t('health.result.title')}
            </h2>
            <p className="text-slate-500">{result.overallHealth}</p>
          </div>
          <motion.div
            className="text-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                  fill="none"
                />
                <motion.circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="#2563EB"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${(result.portfolioScore / 100) * 251.2} 251.2`}
                  initial={{ strokeDasharray: '0 251.2' }}
                  animate={{
                    strokeDasharray: `${(result.portfolioScore / 100) * 251.2} 251.2`,
                  }}
                  transition={{ duration: 1.5, delay: 0.3 }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-blue-600 font-data">
                  {result.portfolioScore}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <PieIcon className="w-5 h-5 text-blue-600" />
          {t('health.result.sector')}
        </h3>
        <div className="space-y-3">
          {Object.entries(result.diversificationAnalysis.sectorExposure).map(
            ([sector, percentage]) => (
              <div key={sector}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-slate-700">
                    {i18n.language === 'zh' ? (SECTOR_ZH[sector] || sector) : sector}
                  </p>
                  <p className="text-sm font-bold text-blue-600 font-data">
                    {percentage.toFixed(1)}%
                  </p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                  ></motion.div>
                </div>
              </div>
            )
          )}
        </div>
      </motion.div>

      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-xl font-bold text-slate-900 mb-4">{t('health.result.holdings')}</h3>
        <div className="space-y-4">
          {result.holdingsAnalysis.map((holding, idx) => (
            <motion.div
              key={idx}
              className="border border-gray-200 rounded-lg p-4 bg-slate-50/50"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-lg text-slate-900">{holding.ticker}</h4>
                  {onAnalyze && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onAnalyze(holding.ticker)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                      aria-label={t('cta.analyze')}
                    >
                      <LineChart className="w-3 h-3" />
                      {t('cta.analyze')}
                    </motion.button>
                  )}
                  {onAddToWatchlist && (
                    <motion.button
                      whileHover={!watchedTickers.includes(holding.ticker) ? { scale: 1.05 } : {}}
                      whileTap={!watchedTickers.includes(holding.ticker) ? { scale: 0.95 } : {}}
                      onClick={() => !watchedTickers.includes(holding.ticker) && onAddToWatchlist(holding.ticker)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all',
                        watchedTickers.includes(holding.ticker)
                          ? 'bg-blue-100 text-blue-600 cursor-default'
                          : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                      )}
                    >
                      <Star className={cn('w-3 h-3', watchedTickers.includes(holding.ticker) && 'fill-blue-600')} />
                      {watchedTickers.includes(holding.ticker) ? t('watchlist.tracked') : t('watchlist.track')}
                    </motion.button>
                  )}
                </div>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold',
                    getRiskColor(holding.riskLevel)
                  )}
                >
                  {holding.riskLevel} {t('health.result.risk.label')}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-2">{holding.assessment}</p>
              <div className="flex items-center gap-2">
                {holding.recommendation === 'Hold' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <p className="text-sm text-slate-600">
                  <strong>{t('health.result.action')}</strong> {holding.recommendation}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <h3 className="text-xl font-bold text-slate-900 mb-4">{t('health.result.diversification')}</h3>
        <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-gray-200">
          <p className="text-sm text-slate-600">{result.diversificationAnalysis.concentration}</p>
        </div>
        {result.diversificationAnalysis.correlationIssues &&
          result.diversificationAnalysis.correlationIssues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-700 mb-2">
                {t('health.result.correlation')}
              </p>
              <ul className="space-y-1">
                {result.diversificationAnalysis.correlationIssues.map(
                  (issue, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-amber-600 flex items-start gap-2"
                    >
                      <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{issue}</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          )}
      </motion.div>

      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <h3 className="text-xl font-bold text-slate-900 mb-4">{t('health.result.recommendations')}</h3>
        <ul className="space-y-3">
          {result.recommendations.map((rec, idx) => (
            <motion.li
              key={idx}
              className="text-sm text-slate-600 flex items-start gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + idx * 0.1 }}
            >
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>{rec}</span>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      {result.rebalancingSuggestions && result.rebalancingSuggestions.length > 0 && (
        <motion.div
          className="glass-card p-6 border-blue-200 bg-blue-50/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <h3 className="text-xl font-bold text-blue-700 mb-4">
            {t('health.result.rebalancing')}
          </h3>
          <ul className="space-y-2">
            {result.rebalancingSuggestions.map((suggestion, idx) => (
              <li
                key={idx}
                className="text-sm text-blue-600 flex items-start gap-2"
              >
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}
