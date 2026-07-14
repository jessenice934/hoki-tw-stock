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
  // 保留字母尾碼（00685L、00631L、00980A 等槓桿/反向/主動式 ETF），
  // 只去掉 .TW/.TWO 交易所後綴 — TWSE 查詢需要完整代號，砍掉尾碼會查不到
  const code = ticker.trim().toUpperCase().replace(/\.(TW|TWO)$/, '');
  if (/^\d{4,6}[A-Z]{0,2}$/.test(code)) {
    try {
      const exCh = `tse_${code}.tw|otc_${code}.tw`;
      const resp = await fetch(`/api/twse?ex_ch=${encodeURIComponent(exCh)}`);
      if (resp.ok) {
        const json = await resp.json();
        // 上市(TSE)和上櫃(OTC)兩個查詢會回兩筆 msgArray；上櫃股 [0] 是空的 TSE placeholder
        // ({"tv":"-","s":"-",...})，真實資料在 [1]。掃全部陣列，找第一個有 n 的
        const arr: Array<{ n?: string }> = Array.isArray(json?.msgArray) ? json.msgArray : [];
        const cn = arr.find(row => row?.n)?.n;
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
