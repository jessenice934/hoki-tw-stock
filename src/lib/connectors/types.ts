// ============================================================
// Connector contracts + shared utilities
// Each connector owns one external data source. Swapping a
// data provider only requires editing that one file.
// ============================================================

/**
 * Common interface for all data connectors.
 * `T` = the domain object the connector returns (or null on failure).
 */
export interface DataConnector<T> {
  /** Fetch data for `ticker`. Returns null on error / no data. */
  fetch(ticker: string): Promise<T | null>;
  /** True if a fresh in-memory cache hit exists for `ticker`. */
  isCached(ticker: string): boolean;
}

// ── Shared ticker helpers ──────────────────────────────────────

/**
 * Normalize a user-entered ticker to Yahoo Finance Taiwan format.
 *  - '2330'    → '2330.TW'
 *  - '0050'    → '0050.TW'
 *  - '^TWII'   → '^TWII'    (台灣加權指數)
 *  - '2330.TW' → '2330.TW'  (already qualified)
 *  - 'AAPL'    → 'AAPL'     (fallback for non-numeric)
 */
export function normalizeTwTicker(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (!t) return t;
  if (t.startsWith('^')) return t;
  if (t.includes('.')) return t;
  if (/^\d{4,6}[A-Z]?$/.test(t)) return `${t}.TW`;
  return t;
}

// ── Re-exported domain interfaces ────────────────────────────
// (imported from individual connector files by finance.ts barrel)

export type { HistoricalPrice }   from './yahoo';
export type { InstitutionalFlow } from './finmind';
export type { Fundamentals }      from './finmind';
