// ============================================================
// FinMind connector
// Owns: institutional flow (三大法人) + fundamentals (PER/revenue/balance sheet)
// If FinMind changes its API, only edit this file.
// ============================================================

export interface InstitutionalFlow {
  foreign: { net: number };  // 外資（含陸資）— 單位：股
  trust: { net: number };    // 投信
  dealer: { net: number };   // 自營商（含避險）
  totalNet: number;          // 三大法人合計（股）
  totalNetLots: number;      // 三大法人合計（張，1 張=1000 股）
  days: number;              // 實際回看交易日數
  latestDate: string;        // 最新交易日 YYYY-MM-DD
  avgDailyNetLots: number;   // 平均每日合計買賣超（張）
}

export interface Fundamentals {
  pe: number | null;            // 本益比（最近交易日）
  pb: number | null;            // 股價淨值比
  divYield: number | null;      // 殖利率 %
  asOfPER: string | null;       // PE 資料日 YYYY-MM-DD
  revenueYoY: number | null;    // 最新月營收 YoY %
  revenueDate: string | null;   // YYYY-MM
  debtRatio: number | null;     // 負債比 = 總負債/總資產 %
  asOfBS: string | null;        // 資產負債表日 YYYY-MM-DD
}

// ── Institutional flow (6h TTL) ──────────────────────────────
const instCache: Record<string, { data: InstitutionalFlow | null; timestamp: number }> = {};
const INST_CACHE_TTL = 6 * 60 * 60 * 1000;

export function isCachedInstitutionalFlow(ticker: string, days: number): boolean {
  const numeric = ticker.replace(/[^0-9]/g, '');
  const key = `${numeric}:${days}`;
  const cached = instCache[key];
  return !!(cached && Date.now() - cached.timestamp < INST_CACHE_TTL);
}

export async function fetchInstitutionalFlow(ticker: string, days = 5): Promise<InstitutionalFlow | null> {
  const numeric = ticker.replace(/[^0-9]/g, '');
  if (numeric.length < 4) return null;

  const key = `${numeric}:${days}`;
  const cached = instCache[key];
  if (cached && Date.now() - cached.timestamp < INST_CACHE_TTL) return cached.data;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days * 2 - 7);
  const startStr = start.toISOString().slice(0, 10);
  const endStr   = end.toISOString().slice(0, 10);

  try {
    const url = `/api/finmind?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${numeric}&start_date=${startStr}&end_date=${endStr}`;
    const resp = await fetch(url);
    if (!resp.ok) { instCache[key] = { data: null, timestamp: Date.now() }; return null; }
    const json = await resp.json();
    const arr = json?.data;
    if (!Array.isArray(arr) || arr.length === 0) { instCache[key] = { data: null, timestamp: Date.now() }; return null; }

    const byDate: Record<string, any[]> = {};
    for (const row of arr) {
      const d: string = row.date;
      if (!d) continue;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(row);
    }
    const sortedDates = Object.keys(byDate).sort().slice(-days);
    if (sortedDates.length === 0) { instCache[key] = { data: null, timestamp: Date.now() }; return null; }

    let foreignNet = 0; let trustNet = 0; let dealerNet = 0;
    for (const d of sortedDates) {
      for (const row of byDate[d]) {
        const net = typeof row.buy_minus_sell === 'number'
          ? row.buy_minus_sell
          : (row.buy ?? 0) - (row.sell ?? 0);
        const name: string = String(row.name ?? '');
        if      (name.includes('Foreign') || name.includes('外')) foreignNet += net;
        else if (name.includes('Investment_Trust') || name.includes('Trust') || name.includes('投信')) trustNet += net;
        else if (name.includes('Dealer') || name.includes('自營')) dealerNet += net;
      }
    }

    const totalNet = foreignNet + trustNet + dealerNet;
    const totalNetLots = Math.round(totalNet / 1000);
    const result: InstitutionalFlow = {
      foreign: { net: foreignNet }, trust: { net: trustNet }, dealer: { net: dealerNet },
      totalNet, totalNetLots,
      days: sortedDates.length,
      latestDate: sortedDates[sortedDates.length - 1],
      avgDailyNetLots: Math.round(totalNetLots / sortedDates.length),
    };
    instCache[key] = { data: result, timestamp: Date.now() };
    return result;
  } catch {
    instCache[key] = { data: null, timestamp: Date.now() };
    return null;
  }
}

// ── Fundamentals (12h TTL) ───────────────────────────────────
const fundCache: Record<string, { data: Fundamentals | null; timestamp: number }> = {};
const FUND_CACHE_TTL = 12 * 60 * 60 * 1000;

export function isCachedFundamentals(ticker: string): boolean {
  const numeric = ticker.replace(/[^0-9]/g, '');
  const cached = fundCache[numeric];
  return !!(cached && Date.now() - cached.timestamp < FUND_CACHE_TTL);
}

export async function fetchFundamentals(ticker: string): Promise<Fundamentals | null> {
  const numeric = ticker.replace(/[^0-9]/g, '');
  if (numeric.length < 4) return null;

  const cached = fundCache[numeric];
  if (cached && Date.now() - cached.timestamp < FUND_CACHE_TTL) return cached.data;

  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const perStart = new Date(today); perStart.setDate(perStart.getDate() - 14);
  const revStart = new Date(today); revStart.setMonth(revStart.getMonth() - 14);
  const bsStart  = new Date(today); bsStart.setMonth(bsStart.getMonth() - 6);

  try {
    const [perResp, revResp, bsResp] = await Promise.all([
      fetch(`/api/finmind?dataset=TaiwanStockPER&data_id=${numeric}&start_date=${fmtDate(perStart)}&end_date=${fmtDate(today)}`),
      fetch(`/api/finmind?dataset=TaiwanStockMonthRevenue&data_id=${numeric}&start_date=${fmtDate(revStart)}&end_date=${fmtDate(today)}`),
      fetch(`/api/finmind?dataset=TaiwanStockBalanceSheet&data_id=${numeric}&start_date=${fmtDate(bsStart)}&end_date=${fmtDate(today)}`),
    ]);

    let pe: number | null = null, pb: number | null = null, divYield: number | null = null, asOfPER: string | null = null;
    if (perResp.ok) {
      const j = await perResp.json();
      const arr = Array.isArray(j?.data) ? j.data : [];
      if (arr.length > 0) {
        const sorted = arr.slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
        const latest = sorted[sorted.length - 1];
        const peRaw = latest?.PER ?? latest?.pe_ratio ?? latest?.per;
        const pbRaw = latest?.PBR ?? latest?.pb_ratio ?? latest?.pbr;
        const dyRaw = latest?.dividend_yield ?? latest?.dividendYield;
        pe = typeof peRaw === 'number' && peRaw > 0 ? peRaw : null;
        pb = typeof pbRaw === 'number' && pbRaw > 0 ? pbRaw : null;
        divYield = typeof dyRaw === 'number' ? dyRaw : null;
        asOfPER = latest?.date ?? null;
      }
    }

    let revenueYoY: number | null = null, revenueDate: string | null = null;
    if (revResp.ok) {
      const j = await revResp.json();
      const arr = Array.isArray(j?.data) ? j.data : [];
      if (arr.length > 0) {
        const sorted = arr.slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
        const latest = sorted[sorted.length - 1];
        const y: number | undefined = latest?.revenue_year;
        const m: number | undefined = latest?.revenue_month;
        const latestRev: number = typeof latest?.revenue === 'number' ? latest.revenue : 0;
        if (y && m && latestRev > 0) {
          const yoyRow = sorted.find((r: any) => r.revenue_year === y - 1 && r.revenue_month === m);
          if (yoyRow && typeof yoyRow.revenue === 'number' && yoyRow.revenue > 0) {
            revenueYoY = ((latestRev - yoyRow.revenue) / yoyRow.revenue) * 100;
          }
          revenueDate = `${y}-${String(m).padStart(2, '0')}`;
        }
      }
    }

    let debtRatio: number | null = null, asOfBS: string | null = null;
    if (bsResp.ok) {
      const j = await bsResp.json();
      const arr = Array.isArray(j?.data) ? j.data : [];
      if (arr.length > 0) {
        const latestDate = arr.map((r: any) => r.date).sort().pop();
        const sameDate = arr.filter((r: any) => r.date === latestDate);
        let totalAssets = 0; let totalLiab = 0;
        for (const row of sameDate) {
          const t = String(row.type ?? ''); const v = typeof row.value === 'number' ? row.value : 0;
          if (t === 'TotalAssets' || t === 'Assets') totalAssets = v;
          else if (t === 'TotalLiabilities' || t === 'Liabilities') totalLiab = v;
        }
        if (totalAssets > 0 && totalLiab > 0) { debtRatio = (totalLiab / totalAssets) * 100; asOfBS = latestDate; }
      }
    }

    const result: Fundamentals = { pe, pb, divYield, asOfPER, revenueYoY, revenueDate, debtRatio, asOfBS };
    if (pe === null && revenueYoY === null && debtRatio === null) {
      fundCache[numeric] = { data: null, timestamp: Date.now() }; return null;
    }
    fundCache[numeric] = { data: result, timestamp: Date.now() };
    return result;
  } catch {
    fundCache[numeric] = { data: null, timestamp: Date.now() }; return null;
  }
}
