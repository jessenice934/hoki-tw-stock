// ============================================================
// News connector
// Owns: Google News RSS headlines via /api/news proxy
// ============================================================

const newsCache: Record<string, { headlines: string[]; timestamp: number }> = {};
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function isCachedNewsHeadlines(ticker: string): boolean {
  const cached = newsCache[ticker.toUpperCase()];
  return !!(cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL);
}

export async function fetchNewsHeadlines(ticker: string, name: string | null): Promise<string[]> {
  const key = ticker.toUpperCase();
  const cached = newsCache[key];
  if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL) return cached.headlines;

  const query = name ? `${name} ${ticker} 股票` : `${ticker} 台股`;
  try {
    const resp = await fetch(`/api/news?q=${encodeURIComponent(query)}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    const headlines: string[] = json?.titles ?? [];
    if (headlines.length > 0) newsCache[key] = { headlines, timestamp: Date.now() };
    return headlines;
  } catch {
    return [];
  }
}
