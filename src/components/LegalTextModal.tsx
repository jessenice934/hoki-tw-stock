import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export type LegalDocType = 'terms' | 'privacy';

interface LegalTextModalProps {
  open: boolean;
  docType: LegalDocType;
  onClose: () => void;
}

/**
 * 顯示完整的 Terms of Service / Privacy Policy 文字。
 * 透過 docType 切換內容。
 */
export default function LegalTextModal({ open, docType, onClose }: LegalTextModalProps) {
  const { t } = useTranslation();

  const title = docType === 'terms' ? t('legal.terms.title') : t('legal.privacy.title');

  // 條款內容以多段組成，避免過長字串
  const sections: { heading: string; body: string }[] =
    docType === 'terms'
      ? [
          { heading: t('legal.terms.s1.h'), body: t('legal.terms.s1.b') },
          { heading: t('legal.terms.s2.h'), body: t('legal.terms.s2.b') },
          { heading: t('legal.terms.s3.h'), body: t('legal.terms.s3.b') },
          { heading: t('legal.terms.s4.h'), body: t('legal.terms.s4.b') },
          { heading: t('legal.terms.s5.h'), body: t('legal.terms.s5.b') },
          { heading: t('legal.terms.s6.h'), body: t('legal.terms.s6.b') },
          { heading: t('legal.terms.s7.h'), body: t('legal.terms.s7.b') },
        ]
      : [
          { heading: t('legal.privacy.s1.h'), body: t('legal.privacy.s1.b') },
          { heading: t('legal.privacy.s2.h'), body: t('legal.privacy.s2.b') },
          { heading: t('legal.privacy.s3.h'), body: t('legal.privacy.s3.b') },
          { heading: t('legal.privacy.s4.h'), body: t('legal.privacy.s4.b') },
          { heading: t('legal.privacy.s5.h'), body: t('legal.privacy.s5.b') },
          { heading: t('legal.privacy.s6.h'), body: t('legal.privacy.s6.b') },
          { heading: t('legal.privacy.s7.h'), body: t('legal.privacy.s7.b') },
        ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[210] bg-slate-900/50 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[211] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
                <p className="text-xs text-slate-400">{t('legal.meta.updated')}</p>
                {sections.map((s, idx) => (
                  <div key={idx}>
                    <h3 className="font-semibold text-slate-900 mb-1.5">{s.heading}</h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">{s.body}</p>
                  </div>
                ))}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 text-right">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  {t('legal.close')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
