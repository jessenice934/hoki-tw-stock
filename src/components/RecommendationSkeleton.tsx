import React from 'react';
import { motion } from 'motion/react';

/**
 * RecommendationSkeleton
 * -----------------------
 * 對齊 RecommendationCard 版型的骨架屏，在投資建議分析期間顯示。
 * 使用 `shimmer-bar` class（定義於 index.css）達成 shimmer 光澤動畫。
 *
 * 使用方式：
 *   {loading && Array.from({ length: 3 }).map((_, i) => (
 *     <RecommendationSkeleton key={i} delay={i * 0.1} />
 *   ))}
 */
interface Props {
  /** 淡入延遲秒數，用於讓三張 skeleton 依序出現（非必要） */
  delay?: number;
}

export default function RecommendationSkeleton({ delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-card p-6 rounded-2xl"
      aria-hidden="true"
    >
      {/* Header: Ticker + 公司名 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="shimmer-bar h-8 w-24 rounded-md mb-2" />
          <div className="shimmer-bar h-4 w-40 rounded-md mb-1.5" />
          <div className="shimmer-bar h-3 w-20 rounded-md" />
        </div>
        <div className="shimmer-bar h-8 w-20 rounded-full" />
      </div>

      {/* 4 個價格區塊 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {['slate', 'emerald', 'blue', 'red'].map((color, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 ${
              color === 'slate' ? 'bg-slate-50' :
              color === 'emerald' ? 'bg-emerald-50' :
              color === 'blue' ? 'bg-blue-50' : 'bg-red-50'
            }`}
          >
            <div className="shimmer-bar h-3 w-10 rounded mb-2" />
            <div className="shimmer-bar h-5 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* 潛在報酬 */}
      <div className="mb-6 bg-slate-50 rounded-xl p-4">
        <div className="shimmer-bar h-4 w-32 rounded" />
      </div>

      {/* 投資理由（三行） */}
      <div className="mb-6">
        <div className="shimmer-bar h-4 w-20 rounded mb-2" />
        <div className="shimmer-bar h-3 w-full rounded mb-1.5" />
        <div className="shimmer-bar h-3 w-full rounded mb-1.5" />
        <div className="shimmer-bar h-3 w-3/4 rounded" />
      </div>

      {/* 催化劑（兩行） */}
      <div className="mb-6">
        <div className="shimmer-bar h-4 w-16 rounded mb-2" />
        <div className="shimmer-bar h-3 w-4/5 rounded mb-1.5" />
        <div className="shimmer-bar h-3 w-3/5 rounded" />
      </div>

      {/* 熊市情境區塊 */}
      <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="shimmer-bar h-4 w-24 rounded mb-2" />
        <div className="shimmer-bar h-3 w-full rounded" />
      </div>

      {/* 信心指數 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="shimmer-bar h-4 w-20 rounded" />
          <div className="shimmer-bar h-5 w-10 rounded" />
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className="shimmer-bar h-full w-full" />
        </div>
      </div>

      {/* 18 信號 grid (12 quant + 6 persona) */}
      <div className="mb-6">
        <div className="shimmer-bar h-4 w-28 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="p-2 rounded-lg border border-slate-200 bg-slate-50">
              <div className="shimmer-bar h-3 w-3/4 rounded mb-1" />
              <div className="shimmer-bar h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
