import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detect in-app browsers (LINE, Instagram, Facebook, WeChat, etc.)
 * Google OAuth is blocked in WebView environments (error 403: disallowed_useragent).
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Known in-app browser identifiers
  if (/FBAN|FBAV|Instagram|Line\/|LIFF|Twitter|Snapchat|WeChat|MicroMessenger/.test(ua)) {
    return true;
  }
  // iOS WebView: has iPhone/iPad but missing "Safari" token
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua)) {
    return true;
  }
  return false;
}

export const formatDateRange = (start: Date, duration: string) => {
  const end = new Date(start);
  if (duration === '1w') end.setDate(start.getDate() + 7);
  else if (duration === '2w') end.setDate(start.getDate() + 14);
  else if (duration === '3w') end.setDate(start.getDate() + 21);
  else if (duration === '1m') end.setMonth(start.getMonth() + 1);
  return `${start.toLocaleDateString()} ~ ${end.toLocaleDateString()}`;
};
