/**
 * Vercel Serverless proxy for FinMind API.
 * FinMind 是台股開放資料聚合服務，提供三大法人、財報、月營收、除權息等真實資料。
 *
 * GET /api/finmind?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=2330&start_date=2026-04-01&end_date=2026-04-26
 *
 * 若設定 FINMIND_TOKEN env var，rate limit 從 ~50/day 升到 600/hour。
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

  const dataset = req.query?.dataset;
  const dataId = req.query?.data_id;
  const startDate = req.query?.start_date;
  const endDate = req.query?.end_date;

  if (!dataset || !/^[A-Za-z]+$/.test(dataset)) {
    res.status(400).json({ error: 'Invalid dataset parameter' });
    return;
  }
  if (dataId && !/^[0-9A-Za-z._-]+$/.test(dataId)) {
    res.status(400).json({ error: 'Invalid data_id parameter' });
    return;
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    res.status(400).json({ error: 'Invalid start_date (YYYY-MM-DD)' });
    return;
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    res.status(400).json({ error: 'Invalid end_date (YYYY-MM-DD)' });
    return;
  }

  const params = new URLSearchParams();
  params.set('dataset', dataset);
  if (dataId) params.set('data_id', dataId);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const token = process.env.FINMIND_TOKEN;
  if (token) params.set('token', token);

  const url = `https://api.finmindtrade.com/api/v4/data?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const text = await upstream.text();
    if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: `FinMind proxy error: ${String((err as Error)?.message ?? err)}` });
  }
}
