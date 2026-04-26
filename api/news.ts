/**
 * Vercel Serverless proxy for Google News RSS.
 * Fetches real news headlines for a given search query and returns parsed JSON.
 *
 * GET /api/news?q=長榮+2603+股票
 * Returns { titles: string[] }
 */

export const maxDuration = 10;

export default async function handler(
  req: { method: string; query?: Record<string, string> },
  res: {
    status: (code: number) => {
      json: (data: unknown) => void;
      send: (data: string) => void;
    };
    setHeader?: (k: string, v: string) => void;
  },
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const q = req.query?.q;
  if (!q || q.length > 300) {
    res.status(400).json({ error: 'Invalid q parameter' });
    return;
  }
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
    });
    const text = await upstream.text();

    // Extract <title> content — handles both plain and CDATA wrapped values
    const raw = [...text.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)];
    const titles = raw
      .map((m) =>
        m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim(),
      )
      .filter((t) => t.length > 5)
      .slice(1, 12); // skip channel title, take up to 11 items

    if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ titles });
  } catch (err) {
    res.status(502).json({ error: `News proxy error: ${String((err as Error)?.message ?? err)}` });
  }
}
