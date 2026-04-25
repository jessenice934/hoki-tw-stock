import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';

interface TrialBannerProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  onLoginClick?: () => void;
  variant?: 'trial' | 'daily'; // trial = 未登入體驗, daily = 登入後每日額度
}

export default function TrialBanner({
  message,
  isVisible,
  onClose,
  onLoginClick,
  variant = 'trial',
}: TrialBannerProps) {
  const { t } = useTranslation();
  const titleKey = variant === 'daily' ? 'daily.warning.title' : 'trial.warning.title';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="fixed top-32 left-4 right-4 z-50 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3 max-w-md mx-auto"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-amber-700 font-medium">{t(titleKey)}</p>
            <p className="text-xs text-amber-600 mt-1">{message}</p>
            {variant === 'trial' && onLoginClick && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={onLoginClick}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline"
                >
                  {t('trial.action.login')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-amber-400 hover:text-amber-600"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
