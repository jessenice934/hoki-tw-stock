// ============================================================
// TWSE connector
// Owns: authoritative Chinese company name lookup
// Primary: TWSE MIS API → Fallback: Yahoo Finance meta
// ============================================================
import { normalizeTwTicker } from './types';
import { resolveYahooSymbol } from './yahoo';

const nameCache: Record<string, { name: string; timestamp: number }> = {};
const NAME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export function isCachedTickerName(ticker: string): boolean {
  const sym = normalizeTwTicker(ticker);
  const cached = nameCache[sym];
  return !!(cached && Date.now() - cached.timestamp < NAME_CACHE_TTL);
}

export async function fetchTickerName(ticker: string): Promise<string | null> {
  const yahooSym = await resolveYahooSymbol(ticker);
  const cached = nameCache[yahooSym];
  if (cached && Date.now() - cached.timestamp < NAME_CACHE_TTL) return cached.name;

  // 1) TWSE MIS API — returns authoritative Chinese short name
  const numeric = ticker.replace(/[^0-9]/g, '');
  if (numeric.length >= 4) {
    try {
      const exCh = `tse_${numeric}.tw|otc_${numeric}.tw`;
      const resp = await fetch(`/api/twse?ex_ch=${encodeURIComponent(exCh)}`);
      if (resp.ok) {
        const json = await resp.json();
        const cn: string | undefined = json?.msgArray?.[0]?.n;
        if (cn) {
          nameCache[yahooSym] = { name: cn, timestamp: Date.now() };
          return cn;
        }
      }
    } catch { /* fall through */ }
  }

  // 2) Fallback: Yahoo Finance longName / shortName
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const name: string | undefined = meta?.longName || meta?.shortName;
    if (!name) return null;
    nameCache[yahooSym] = { name, timestamp: Date.now() };
    return name;
  } catch { return null; }
}
