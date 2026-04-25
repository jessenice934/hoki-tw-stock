/**
 * Vercel Serverless proxy for TWSE MIS endpoint (台灣證交所即時行情 API).
 * Used to fetch authoritative Chinese stock names by ticker.
 *
 * GET /api/twse?ex_ch=tse_2603.tw|otc_2603.tw
 * Returns the upstream JSON as-is.
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
  const exCh = req.query?.ex_ch;
  if (!exCh || !/^[a-z0-9_.|]+$/i.test(exCh)) {
    res.status(400).json({ error: 'Invalid ex_ch parameter' });
    return;
  }
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1`;
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    const text = await upstream.text();
    if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: `TWSE proxy error: ${String((err as Error)?.message ?? err)}` });
  }
}
