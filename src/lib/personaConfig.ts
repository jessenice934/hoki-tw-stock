/**
 * Shared persona configuration for 6 投資風格 personas.
 * Used by RecommendationCard and StockPredictionChart to avoid duplication.
 */
export const PERSONA_CONFIG: Record<string, { bg: string; border: string; scoreColor: string; icon: string }> = {
  value:       { bg: 'bg-amber-50',   border: 'border-amber-200',  scoreColor: 'text-amber-700',  icon: '💎' },
  trader:      { bg: 'bg-orange-50',  border: 'border-orange-200', scoreColor: 'text-orange-700', icon: '🌐' },
  growth:      { bg: 'bg-sky-50',     border: 'border-sky-200',    scoreColor: 'text-sky-700',    icon: '📈' },
  contrarian:  { bg: 'bg-red-50',     border: 'border-red-200',    scoreColor: 'text-red-700',    icon: '🔄' },
  innovation:  { bg: 'bg-violet-50',  border: 'border-violet-200', scoreColor: 'text-violet-700', icon: '🚀' },
  trump:       { bg: 'bg-rose-50',    border: 'border-rose-200',   scoreColor: 'text-rose-700',   icon: '🏛️' },
};
