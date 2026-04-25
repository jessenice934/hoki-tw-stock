/**
 * PostHog 追蹤封裝
 *
 * 用法：
 *   - initAnalytics()             在 main.tsx 最早期呼叫一次
 *   - identifyUser(user)          登入後呼叫，把匿名事件綁到實名用戶
 *   - resetAnalytics()            登出時呼叫
 *   - track(event, props?)        關鍵事件埋點
 *
 * 沒設定 VITE_POSTHOG_KEY 時所有 API 都是 no-op，不會噴錯，方便本地開發。
 */
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    // 開發環境沒設 key → 靜默略過，不影響功能
    if (import.meta.env.DEV) {
      console.info('[analytics] VITE_POSTHOG_KEY not set — analytics disabled');
    }
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only', // 未登入不開 profile，省額度
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true, // 自動抓 click / form submit，省埋點工
    disable_session_recording: false,
    loaded: () => {
      if (import.meta.env.DEV) {
        console.info('[analytics] PostHog loaded');
      }
    },
  });
  initialized = true;
}

/** 登入後把匿名 session 綁到實名 user */
export function identifyUser(user: { id: string; email?: string; name?: string } | null) {
  if (!initialized || !user) return;
  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
  });
}

/** 登出時清除用戶綁定，後續事件回到匿名 */
export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

/** 關鍵事件埋點 */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
