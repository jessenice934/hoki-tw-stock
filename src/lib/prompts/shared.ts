// ============================================================
// Shared prompt fragments — referenced by all AI analysis prompts
// Edit here to tune cross-cutting reasoning rules without touching logic.
// ============================================================

export const SIGNAL_ENFORCEMENT_PROMPT = `SIGNAL SCORING NOTES:
- Backend computes the 12 quantitative signals from real market data (price, RSI, MACD, institutional flow, fundamentals from FinMind) and OVERWRITES whatever you return.
- Do NOT fabricate signals to meet a threshold — your signal values are discarded.
- Focus your reasoning on: persona fit, sector category, price targets, and qualitative narrative.
- Of the 12 signals, 9 are measurable today; 3 (Short Interest, ROE, Insider Buy/Sell) are pending data sources and will be marked Neutral by backend.
- Final filter (5+ positive of 9 measurable) is applied AFTER your output, on real backend-computed signals.`;

export const VOLATILITY_GUARD_PROMPT = `VOLATILITY GUARD REQUIREMENTS:
- This rule applies CONSISTENTLY across all recommendations and predictions
- Maximum allowed gain is defined by timeframe: 1d=4%, 1w=8%, 2w=10%, 3w=12%, 1m=15%
- If projected price exceeds this, CLAMP it to the maximum allowed
- Stop loss must be reasonable and within limits
- Apply this rule to EVERY recommendation - NO EXCEPTIONS
- Consistency check: All stocks analyzed in the same session should use identical volatility thresholds
- Cross-reference all prices: currentPrice + (currentPrice × maxGain%) = capped targetPrice`;

export const DETERMINISTIC_PROMPT = `DETERMINISTIC REASONING PROTOCOL:
- Evidence weight hierarchy: 財報數據 (Earnings) > 新聞事件 (News) > 市場情緒 (Sentiment)
- Always cite the source of each data point
- Prioritize verifiable financial data over subjective sentiment
- When conflicting signals exist, defer to the higher-weight evidence category`;
