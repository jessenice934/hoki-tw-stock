import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface LegalConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onShowTerms: () => void;
  onShowPrivacy: () => void;
}

/**
 * 首次進站強制同意 Modal。
 * 使用者必須勾選三項同意，才能使用本服務。
 * 勾選後寫入 localStorage('hoki_legal_consent')，下次不再顯示。
 */
export default function LegalConsentModal({
  open,
  onAccept,
  onShowTerms,
  onShowPrivacy,
}: LegalConsentModalProps) {
  const { t } = useTranslation();
  const [agreeNotAdvice, setAgreeNotAdvice] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const canContinue = agreeNotAdvice && agreeRisk && agreeTerms;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card w-full max-w-lg p-6 sm:p-8 pointer-events-auto shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">
                    {t('legal.consent.title')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t('legal.consent.subtitle')}
                  </p>
                </div>
              </div>

              {/* 核心聲明 */}
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 mb-5 text-xs text-rose-700 leading-relaxed space-y-1.5">
                <p>• {t('legal.consent.notice.1')}</p>
                <p>• {t('legal.consent.notice.2')}</p>
                <p>• {t('legal.consent.notice.3')}</p>
                <p>• {t('legal.consent.notice.4')}</p>
              </div>

              {/* 三項勾選 */}
              <div className="space-y-3 mb-5">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreeNotAdvice}
                    onChange={(e) => setAgreeNotAdvice(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                    {t('legal.consent.check.notAdvice')}
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreeRisk}
                    onChange={(e) => setAgreeRisk(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                    {t('legal.consent.check.risk')}
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                    {t('legal.consent.check.terms.prefix')}
                    <button
                      type="button"
                      onClick={onShowTerms}
                      className="text-blue-600 hover:text-blue-700 underline mx-1"
                    >
                      {t('legal.terms.title')}
                    </button>
                    {t('legal.consent.check.terms.mid')}
                    <button
                      type="button"
                      onClick={onShowPrivacy}
                      className="text-blue-600 hover:text-blue-700 underline mx-1"
                    >
                      {t('legal.privacy.title')}
                    </button>
                    {t('legal.consent.check.terms.suffix')}
                  </span>
                </label>
              </div>

              {/* 確認按鈕 */}
              <motion.button
                onClick={onAccept}
                disabled={!canContinue}
                whileHover={canContinue ? { scale: 1.01 } : {}}
                whileTap={canContinue ? { scale: 0.99 } : {}}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                  canContinue
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {t('legal.consent.accept')}
              </motion.button>

              <p className="text-[10px] text-slate-400 text-center mt-3 leading-relaxed">
                {t('legal.consent.reject.note')}
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
