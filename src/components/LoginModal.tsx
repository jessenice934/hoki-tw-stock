import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, User as UserIcon, Loader, Eye, EyeOff, Chrome } from 'lucide-react';
import { login, register, loginWithOAuth, User } from '@/lib/auth';
import { cn, isInAppBrowser } from '@/lib/utils';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

type Mode = 'login' | 'register';

export default function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Register-mode consent checkboxes (legal)
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  // Google OAuth is primary. Email form is collapsed until user clicks "continue with email".
  const [showEmailForm, setShowEmailForm] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening; focus email only when the form is expanded
  useEffect(() => {
    if (open) {
      setError(null);
      setSuccessMessage(null);
      setShowEmailForm(false);
    }
  }, [open, mode]);

  useEffect(() => {
    if (showEmailForm) {
      setTimeout(() => emailInputRef.current?.focus(), 100);
    }
  }, [showEmailForm]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const resetFields = () => {
    setEmail('');
    setName('');
    setPassword('');
    setError(null);
    setSuccessMessage(null);
    setAgeConfirmed(false);
    setRiskConfirmed(false);
    setShowEmailForm(false);
  };

  const registerBlocked = mode === 'register' && (!ageConfirmed || !riskConfirmed);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccessMessage(null);
    setShowEmailForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (mode === 'register') {
        const res = await register(email, name, password);
        if (res.ok && res.needsConfirmation) {
          // Email confirmation is required — don't log in, show guidance instead.
          setSuccessMessage(t('auth.register.check_email', { email }));
        } else if (res.ok) {
          onSuccess(res.user);
          resetFields();
          onClose();
        } else {
          setError(t(`auth.error.${res.error}`));
        }
      } else {
        const res = await login(email, password);
        if (res.ok) {
          onSuccess(res.user);
          resetFields();
          onClose();
        } else {
          setError(t(`auth.error.${res.error}`));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card w-full max-w-md p-8 pointer-events-auto relative shadow-2xl"
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">
                  {mode === 'login' ? t('auth.login.title') : t('auth.register.title')}
                </h2>
                <p className="text-sm text-slate-400">
                  {mode === 'login' ? t('auth.login.subtitle') : t('auth.register.subtitle')}
                </p>
              </div>

              {/* Tabs */}
              <div className="glass-card rounded-full p-1 flex mb-6 bg-slate-50">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={cn(
                    'flex-1 py-2 rounded-full text-sm font-semibold transition-all',
                    mode === 'login'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {t('auth.tab.login')}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={cn(
                    'flex-1 py-2 rounded-full text-sm font-semibold transition-all',
                    mode === 'register'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {t('auth.tab.register')}
                </button>
              </div>

              {/* Register-mode consent checkboxes (must appear BEFORE Google OAuth so they can't bypass) */}
              <AnimatePresence initial={false}>
                {mode === 'register' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={ageConfirmed}
                          onChange={(e) => setAgeConfirmed(e.target.checked)}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-600 leading-relaxed group-hover:text-slate-800">
                          {t('auth.consent.age')}
                        </span>
                      </label>
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={riskConfirmed}
                          onChange={(e) => setRiskConfirmed(e.target.checked)}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-600 leading-relaxed group-hover:text-slate-800">
                          {t('auth.consent.risk')}
                        </span>
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Google OAuth — replaced with warning if in-app browser (LINE, IG, etc.) */}
              {isInAppBrowser() ? (
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-center space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700">{t('auth.inapp.title')}</p>
                  <p className="text-[11px] text-amber-600 leading-relaxed">{t('auth.inapp.body')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href).catch(() => {});
                    }}
                    className="mt-1 text-xs font-semibold text-amber-700 underline hover:text-amber-800"
                  >
                    {t('auth.inapp.copy')}
                  </button>
                </div>
              ) : (
                <motion.button
                  type="button"
                  onClick={() => {
                    if (registerBlocked) return;
                    void loginWithOAuth('google');
                  }}
                  disabled={registerBlocked}
                  className={cn(
                    'w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-gray-200 bg-white transition-colors text-sm font-medium text-slate-700 mb-4',
                    registerBlocked
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-50'
                  )}
                  whileHover={!registerBlocked ? { scale: 1.01 } : {}}
                  whileTap={!registerBlocked ? { scale: 0.99 } : {}}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t('auth.google')}
                </motion.button>
              )}

              {/* Email collapse toggle — Google OAuth is the primary flow, email is secondary */}
              {!showEmailForm && (
                <button
                  type="button"
                  onClick={() => {
                    if (registerBlocked) return;
                    setShowEmailForm(true);
                  }}
                  disabled={registerBlocked}
                  className={cn(
                    'w-full text-xs text-slate-500 hover:text-slate-700 transition-colors py-2',
                    registerBlocked && 'opacity-50 cursor-not-allowed hover:text-slate-500'
                  )}
                >
                  {t('auth.continueWithEmail')}
                </button>
              )}

              {/* Divider + Form (collapsed by default) */}
              <AnimatePresence initial={false}>
                {showEmailForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden -mx-2 px-2"
                  >
                    {/* Divider */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-slate-400">{t('auth.divider')}</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.email.placeholder')}
                      required
                      autoComplete="email"
                      className="w-full bg-slate-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Name (register only) */}
                <AnimatePresence initial={false}>
                  {mode === 'register' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        {t('auth.name')}
                      </label>
                      <div className="relative">
                        <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t('auth.name.placeholder')}
                          required={mode === 'register'}
                          autoComplete="name"
                          className="w-full bg-slate-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? t('auth.password.placeholder.register') : t('auth.password.placeholder')}
                      required
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      className="w-full bg-slate-50 border border-gray-200 rounded-xl pl-10 pr-11 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5"
                    >
                      <p className="text-xs text-red-600">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Success (e.g. check your email) */}
                <AnimatePresence>
                  {successMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5"
                    >
                      <p className="text-xs text-emerald-700 leading-relaxed">{successMessage}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading || registerBlocked}
                  className="btn-primary w-full py-3.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  whileHover={!loading && !registerBlocked ? { scale: 1.01 } : {}}
                  whileTap={!loading && !registerBlocked ? { scale: 0.99 } : {}}
                >
                  {loading && <Loader className="w-4 h-4 animate-spin" />}
                  {mode === 'login' ? t('auth.login.submit') : t('auth.register.submit')}
                </motion.button>
              </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer note */}
              <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
                {t('auth.local.note')}
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
