import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Zap, ChevronRight, BarChart3, Activity } from 'lucide-react';
import { TrialState } from '@/lib/storage';
import { User } from '@/lib/auth';

type Tab = 'home' | 'recommend' | 'health' | 'prediction' | 'watchlist' | 'history';

interface HomeHeroProps {
  onNavigate: (tab: Tab) => void;
  currentUser?: User | null;
  trialState?: TrialState;
  onStartTrial?: () => void;
}

export default function HomeHero({ onNavigate, currentUser, trialState, onStartTrial }: HomeHeroProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-0 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badges */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-3 mb-8 flex-wrap justify-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F2E8CC]/60 border border-[#C8A85C]/30">
              <Zap className="w-3.5 h-3.5 text-[#A88838]" />
              <span className="text-xs font-semibold text-[#7E6726] tracking-[0.05em]">{t('hero.badge')}</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F4DDD5]/60 border border-[#C8553D]/25">
              <div className="w-2 h-2 rounded-full bg-[#C8553D] animate-pulse"></div>
              <span className="text-xs font-semibold text-[#A8412A] tracking-[0.1em] uppercase">{t('hero.live')}</span>
            </div>
          </motion.div>

          {/* Headline — 福氣入袋 用 Noto Serif TC 抓漢字筆畫 */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-[72px] leading-[88px] md:text-[96px] md:leading-[120px] mb-8 tracking-[-0.02em]"
          >
            <span className="gradient-text">{t('hero.line1')}</span>
            <br />
            <span className="font-display text-slate-900">{t('hero.line2')}</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-base md:text-lg text-[#545968] leading-[1.85] mb-10 max-w-xl mx-auto"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            {(!currentUser && !trialState?.active) ? (
              <motion.button
                onClick={onStartTrial}
                className="btn-primary inline-flex items-center gap-2 text-base py-3.5 px-8"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                {t('trial.action.start')}
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            ) : (
              <>
                <motion.button
                  onClick={() => onNavigate('recommend')}
                  className="btn-primary inline-flex items-center gap-2 text-base py-3.5 px-8"
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {t('hero.cta.recommend')}
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => onNavigate('prediction')}
                  className="btn-outline inline-flex items-center gap-2 text-base py-3.5 px-8"
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {t('hero.cta.predict')}
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </>
            )}
          </motion.div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="px-6 md:px-16 lg:px-24 pb-16">
        <div className="max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Zap,
              iconColor: 'text-[#2E3D6B]',
              iconBg: 'bg-[#F1F2F8] border border-[#2E3D6B]/15',
              title: t('feature.realtime.title'),
              desc: t('feature.realtime.desc'),
            },
            {
              icon: BarChart3,
              iconColor: 'text-[#A88838]',
              iconBg: 'bg-[#F2E8CC]/70 border border-[#C8A85C]/30',
              title: t('feature.deep.title'),
              desc: t('feature.deep.desc'),
            },
            {
              icon: Activity,
              iconColor: 'text-[#C8553D]',
              iconBg: 'bg-[#F4DDD5]/70 border border-[#C8553D]/25',
              title: t('feature.track.title'),
              desc: t('feature.track.desc'),
            },
          ].map((feat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.15 }}
              className="glass-card p-6"
            >
              <div className={`w-11 h-11 rounded-xl ${feat.iconBg} flex items-center justify-center mb-5`}>
                <feat.icon className={`w-5 h-5 ${feat.iconColor}`} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{feat.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
