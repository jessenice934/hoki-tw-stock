/**
 * Supabase-backed authentication.
 *
 * Public API is kept close to the previous localStorage implementation so the
 * rest of the app (LoginModal, ProfileMenu, App.tsx) barely needs to change.
 * Session persistence is handled by supabase-js (see ./supabase.ts).
 */

import type { Session, User as SbUser } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  avatarColor: string;
}

const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-purple-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-orange-600',
];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Map a Supabase user into our domain User shape. */
function toUser(sb: SbUser): User {
  const email = sb.email ?? '';
  const metaName =
    (sb.user_metadata?.name as string | undefined) ||
    (sb.user_metadata?.full_name as string | undefined) ||
    '';
  const name = metaName || email.split('@')[0] || 'User';
  return {
    id: sb.id,
    email,
    name,
    createdAt: sb.created_at ?? new Date().toISOString(),
    avatarColor: pickAvatarColor(email || sb.id),
  };
}

/** Synchronous best-effort current user (from cached session). */
export function getCurrentUser(): User | null {
  // supabase-js caches session in localStorage; we read it via getSession asynchronously elsewhere.
  // This sync helper returns null; callers should prefer fetchCurrentUser() or onAuthChange().
  return null;
}

/** Async fetch of the current session's user. */
export async function fetchCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  const sb = data.session?.user;
  return sb ? toUser(sb) : null;
}

type RegisterError =
  | 'email_invalid'
  | 'email_exists'
  | 'name_short'
  | 'password_short'
  | 'network';

export type RegisterResult =
  | { ok: true; user: User; needsConfirmation: false }
  | { ok: true; user: User; needsConfirmation: true }
  | { ok: false; error: RegisterError };

export async function register(
  email: string,
  name: string,
  password: string,
): Promise<RegisterResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { ok: false, error: 'email_invalid' };
  }
  if (trimmedName.length < 2) return { ok: false, error: 'name_short' };
  if (password.length < 6) return { ok: false, error: 'password_short' };

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: { name: trimmedName },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { ok: false, error: 'email_exists' };
    }
    if (msg.includes('password')) {
      return { ok: false, error: 'password_short' };
    }
    if (msg.includes('email')) {
      return { ok: false, error: 'email_invalid' };
    }
    return { ok: false, error: 'network' };
  }

  const sb = data.user;
  if (!sb) return { ok: false, error: 'network' };
  // session is null when Supabase email confirmation is enabled
  const needsConfirmation = !data.session;
  return { ok: true, user: toUser(sb), needsConfirmation };
}

type LoginError = 'credentials' | 'network';

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; user: User } | { ok: false; error: LoginError }> {
  const trimmedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });
  if (error || !data.user) {
    const msg = error?.message.toLowerCase() ?? '';
    if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password')) {
      return { ok: false, error: 'credentials' };
    }
    return { ok: false, error: 'network' };
  }
  return { ok: true, user: toUser(data.user) };
}

/** OAuth sign-in (Google / Apple / GitHub / etc). Redirects the browser. */
export async function loginWithOAuth(
  provider: 'google' | 'apple' | 'github',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
    // After OAuth callback, Supabase leaves an empty '#' in the URL.
    // Clean it up so the address bar shows the clean URL.
    if (event === 'SIGNED_IN' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    cb(session?.user ? toUser(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
