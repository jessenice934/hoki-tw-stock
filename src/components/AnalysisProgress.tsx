import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * AnalysisProgress
 * -----------------
 * 投資建議 / 個股預測分析期間顯示的「假進度條 + 分階段文案」。
 *
 * 核心設計：
 * - 從 0% 起步，以時間為基底推進到約 92%（非 100%，保留「完成」的感覺）
 * - 文案分階段切換，給用戶「正在做不同事情」的進展感
 * - 真正完成（loading 變 false）時，由父層卸載本元件；不要手動推到 100%
 *
 * 使用方式：
 *   {loading && <AnalysisProgress lang={i18n.language} variant="recommendation" />}
 */

type Lang = 'zh' | 'en' | string;
type Variant = 'recommendation' | 'prediction' | 'healthcheck';

interface Props {
  lang?: Lang;
  variant?: Variant;
  /** 預估完成時間（秒），用來讓進度推進速度與實際耗時對齊。預設 40。 */
  estimatedSeconds?: number;
}

/** 分階段文案：每階段的起始百分比（含）+ 顯示文字 */
interface Stage {
  from: number;
  text: { zh: string; en: string };
}

const STAGES_RECOMMENDATION: Stage[] = [
  { from: 0,  text: { zh: '連線 AI 投資大師…',       en: 'Connecting to AI analysts…' } },
  { from: 10, text: { zh: '抓取即時股價與市場資料…',    en: 'Fetching live prices & market data…' } },
  { from: 25, text: { zh: '分析 12 項量化指標…',      en: 'Analyzing 12 quantitative signals…' } },
  { from: 50, text: { zh: '交叉比對 6 種投資風格觀點…', en: 'Cross-referencing 6 investor personas…' } },
  { from: 75, text: { zh: '套用波動率守則、過濾風險…',  en: 'Applying volatility guard & filters…' } },
  { from: 88, text: { zh: '整合分析結果…',            en: 'Finalizing recommendations…' } },
];

const STAGES_PREDICTION: Stage[] = [
  { from: 0,  text: { zh: '抓取歷史股價…',            en: 'Fetching historical prices…' } },
  { from: 15, text: { zh: '蒙地卡羅模擬（10,000 次）…', en: 'Monte Carlo simulation (10,000 paths)…' } },
  { from: 30, text: { zh: 'AI 深度分析基本面…',        en: 'AI analyzing fundamentals…' } },
  { from: 55, text: { zh: '評估機構動向與市場情緒…',    en: 'Evaluating institutional flow & sentiment…' } },
  { from: 78, text: { zh: '生成情境分析與催化劑…',     en: 'Generating scenarios & catalysts…' } },
  { from: 90, text: { zh: '整合分析結果…',            en: 'Finalizing analysis…' } },
];

const STAGES_HEALTHCHECK: Stage[] = [
  { from: 0,  text: { zh: '解析持倉結構…',    en: 'Parsing portfolio…' } },
  { from: 30, text: { zh: '計算板塊分布…',    en: 'Calculating sector allocation…' } },
  { from: 60, text: { zh: '評估集中度風險…',   en: 'Assessing concentration risk…' } },
  { from: 85, text: { zh: '整合健診結果…',    en: 'Finalizing health check…' } },
];

function pickStages(variant: Variant): Stage[] {
  if (variant === 'prediction') return STAGES_PREDICTION;
  if (variant === 'healthcheck') return STAGES_HEALTHCHECK;
  return STAGES_RECOMMENDATION;
}

function pickText(lang: Lang, stage: Stage): string {
  return lang?.startsWith('zh') ? stage.text.zh : stage.text.en;
}

export default function AnalysisProgress({
  lang = 'zh',
  variant = 'recommendation',
  estimatedSeconds = 40,
}: Props) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(Date.now());
  const stages = pickStages(variant);

  useEffect(() => {
    startRef.current = Date.now();
    let raf = 0;

    // 以時間為基底推進，但用 easing 函數讓「前快後慢」，接近 92% 時減速到幾乎停止
    const tick = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      // 歸一化：elapsed / estimated 超過 1 時逼近 0.92 上限
      const ratio = Math.min(elapsed / estimatedSeconds, 1.5);
      // ease-out：前期推進快，後期慢下來
      const eased = 1 - Math.pow(1 - Math.min(ratio, 1), 2.2);
      // 最高只到 92%，保留完成時的視覺跳動感
      const next = Math.min(eased * 92, 92);
      setProgress(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [estimatedSeconds]);

  // 找目前應顯示的階段文字（progress 落在哪個區段）
  let currentStage = stages[0];
  for (const stage of stages) {
    if (progress >= stage.from) currentStage = stage;
  }
  const text = pickText(lang, currentStage);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="glass-card p-5 mb-6"
      role="status"
      aria-live="polite"
    >
      {/* 文字 + 百分比 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* 旋轉點點，比 <Loader /> 更輕盈 */}
          <div className="flex gap-1 flex-shrink-0">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-blue-500"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={currentStage.from}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="text-sm text-slate-600 truncate"
            >
              {text}
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="text-xs text-slate-400 font-data flex-shrink-0 ml-3">
          {Math.round(progress)}%
        </span>
      </div>

      {/* 進度條 */}
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
          style={{ width: `${progress}%` }}
          transition={{ ease: 'linear', duration: 0.1 }}
        />
      </div>

      {/* 深度分析小提示（只在 >20 秒後顯示） */}
      {progress > 50 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-slate-400 mt-3"
        >
          {lang?.startsWith('zh')
            ? '深度分析中，通常需要 30–40 秒，請稍候'
            : 'Deep analysis in progress, typically 30–40 seconds'}
        </motion.p>
      )}
    </motion.div>
  );
}
