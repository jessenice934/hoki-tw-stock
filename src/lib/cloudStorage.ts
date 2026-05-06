/**
 * cloudStorage.ts
 * Low-level Supabase CRUD for user data.
 * Called by storage.ts — do not call directly from components.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { InvestmentTask, WatchlistItem, SystemLesson, LessonScope } from './storage';

// ── History ────────────────────────────────────────────────────────────────

export async function cloudUpsertTask(task: InvestmentTask, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('user_history').upsert(
    {
      id: task.id,
      user_id: userId,
      type: task.type,
      date: task.date,
      params: task.params ?? null,
      result: task.result,
      outcome: task.outcome ?? null,
    },
    { onConflict: 'id,user_id' }
  );
  if (error) console.warn('[cloud] upsertTask:', error.message);
}

export async function cloudPatchTask(
  id: string,
  patch: Partial<InvestmentTask>,
  userId: string
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const update: Record<string, unknown> = {};
  if (patch.result  !== undefined) update.result  = patch.result;
  if (patch.outcome !== undefined) update.outcome = patch.outcome ?? null;
  if (patch.params  !== undefined) update.params  = patch.params  ?? null;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from('user_history')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.warn('[cloud] patchTask:', error.message);
}

export async function cloudDeleteTask(id: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('user_history')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.warn('[cloud] deleteTask:', error.message);
}

export async function cloudFetchHistory(userId: string): Promise<InvestmentTask[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('user_history')
    .select('id, type, date, params, result, outcome')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) {
    if (error) console.warn('[cloud] fetchHistory:', error.message);
    return [];
  }
  return (data as any[]).map(row => ({
    id:      row.id,
    type:    row.type as InvestmentTask['type'],
    date:    row.date,
    params:  row.params,
    result:  row.result,
    outcome: row.outcome ?? undefined,
  }));
}

// ── Watchlist ──────────────────────────────────────────────────────────────

export async function cloudUpsertWatchlistItem(item: WatchlistItem, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('user_watchlist').upsert(
    {
      ticker:        item.ticker,
      user_id:       userId,
      name:          item.name,
      added_at:      item.addedAt,
      target_price:  item.targetPrice  ?? null,
      entry_price:   item.entryPrice   ?? null,
      current_price: item.currentPrice ?? null,
    },
    { onConflict: 'ticker,user_id' }
  );
  if (error) console.warn('[cloud] upsertWatchlistItem:', error.message);
}

export async function cloudDeleteWatchlistItem(ticker: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('ticker', ticker)
    .eq('user_id', userId);
  if (error) console.warn('[cloud] deleteWatchlistItem:', error.message);
}

export async function cloudFetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('ticker, name, added_at, target_price, entry_price, current_price')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error || !data) {
    if (error) console.warn('[cloud] fetchWatchlist:', error.message);
    return [];
  }
  return (data as any[]).map(row => ({
    ticker:       row.ticker,
    name:         row.name ?? row.ticker,
    addedAt:      row.added_at,
    targetPrice:  row.target_price  ?? undefined,
    entryPrice:   row.entry_price   ?? undefined,
    currentPrice: row.current_price ?? undefined,
  }));
}

// ── Lessons ────────────────────────────────────────────────────────────────

export async function cloudUpsertLesson(lesson: SystemLesson, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('user_lessons').upsert(
    {
      user_id:          userId,
      scope:            lesson.scope,
      generated_at:     lesson.generatedAt,
      based_on_count:   lesson.basedOnCount,
      failure_patterns: lesson.failurePatterns,
      success_patterns: lesson.successPatterns,
      improvements:     lesson.improvements,
    },
    { onConflict: 'user_id,scope' }
  );
  if (error) console.warn('[cloud] upsertLesson:', error.message);
}

export async function cloudFetchLesson(
  scope: LessonScope,
  userId: string
): Promise<SystemLesson | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('user_lessons')
    .select('scope, generated_at, based_on_count, failure_patterns, success_patterns, improvements')
    .eq('user_id', userId)
    .eq('scope', scope)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('[cloud] fetchLesson:', error.message);
    return null;
  }
  return {
    scope:           data.scope as LessonScope,
    generatedAt:     data.generated_at,
    basedOnCount:    data.based_on_count,
    failurePatterns: data.failure_patterns,
    successPatterns: data.success_patterns,
    improvements:    data.improvements,
  };
}
