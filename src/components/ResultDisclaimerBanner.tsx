import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

/**
 * 結果頁資訊說明帶
 * 顯示在投資參考 / 個股預測 / 持股健檢的結果卡最上方。
 * 中性視覺（非錯誤紅），明確告知：僅供參考、非投資建議、AI 生成可能有誤。
 */
export default function ResultDisclaimerBanner() {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-start gap-2.5">
      <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="text-xs font-semibold text-slate-700">
          {t('result.disclaimer.title')}
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {t('result.disclaimer.body')}
        </p>
      </div>
    </div>
  );
}
