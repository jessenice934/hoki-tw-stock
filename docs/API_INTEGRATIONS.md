# KOVA — API 串接文件

**版本**：1.2  
**最後更新**：2026-04-22

---

## 1. Gemini AI API（經由 `/api/gemini` 伺服端代理）

### 1.1 安全性遷移紀錄（重要）

2026-04 重要調整：**Gemini API key 已從前端 `VITE_` 環境變數遷移至伺服端 Serverless Function**，不再出現在瀏覽器 bundle。

- **舊架構**：`VITE_GEMINI_API_KEY*` → 打包進 JS → 任何訪客可從 DevTools 取得
- **新架構**：`GEMINI_API_KEY*` → 僅 Vercel 伺服端 env vars → 前端透過 `fetch('/api/gemini')` 呼叫

### 1.2 基本資訊
- 提供方：Google AI Studio
- 文件：https://ai.google.dev/
- 呼叫方式：前端 → `POST /api/gemini` → Node.js Serverless Function → Gemini API

### 1.3 使用模型
| 模型 | 用途 | 備注 |
|------|------|------|
| `gemini-2.5-flash` | 主要模型 | 免費方案有額度，優先使用 |
| `gemini-2.5-flash-lite` | 備用模型 | 主模型 503 / MAX_TOKENS / 404 時自動切換 |

### 1.4 API Key 管理
- 最多支援 **7 把 key**（`GEMINI_API_KEY` ~ `GEMINI_API_KEY_7`）存於 Vercel 環境變數
- 輪替邏輯：
  1. 啟動時將可用 key 隨機排序（減少請求集中在單一 key）
  2. 遇到 `400` / `403` / `API_KEY_INVALID` → 標記為 dead，不再使用
  3. 遇到 `429`（quota exceeded）→ 換下一把 key
  4. 遇到 `503`（overloaded） / `404` / `MAX_TOKENS` → 切換模型（fallback `flash-lite`）
  5. 所有 key 都 dead 或剩餘預算不足 → 拋出錯誤給用戶

### 1.5 預算式重試（Budget-Aware Retry）
**關鍵常數**：
```ts
export const maxDuration = 60;              // Vercel Node.js Function 硬上限
const TOTAL_BUDGET_MS = 58_000;             // 單請求總預算（2s 緩衝）
const PER_CALL_TIMEOUT_MS = 50_000;         // 單次 fetch 上限
const MIN_FALLBACK_BUDGET_MS = 20_000;      // 剩餘低於此值不再重試
```

**流程**：
- 每次呼叫前計算 `budgetRemaining = TOTAL_BUDGET_MS - (Date.now() - startTime)`
- `AbortController` 的逾時設為 `min(budgetRemaining, PER_CALL_TIMEOUT_MS)`
- 逾時（`AbortError`）→ **不再重試**（已消耗大部分預算）
- 其他錯誤 → 依錯誤類別輪替 key 或換模型後重試

### 1.6 請求設定
```typescript
generationConfig: {
  temperature: 0,         // 確定性輸出，減少隨機
  topP: 1,
  topK: 40,
  maxOutputTokens: 32768, // 中文 JSON 需要較大空間
  responseMimeType: 'application/json', // 強制 JSON 輸出
}
```

### 1.7 重要注意事項
- **`maxOutputTokens` 必須設 32768**：中文 + 12 signals + 6 personas 輸出量龐大，8192 會截斷導致 JSON 破損
- **temperature: 0**：讓每次結果一致
- **`responseMimeType: 'application/json'`**：強制 AI 輸出合法 JSON

### 1.8 JSON 修復機制（repairJson）
AI 偶爾回傳不完整 JSON，系統有 6 層修復：
1. 移除 markdown code block（\`\`\`json）
2. 提取最外層 JSON 物件
3. 修復常見語法錯誤（trailing comma、NaN、undefined）
4. 修復字串內未跳脫的換行符
5. 截斷到最後一個完整 `}` 或 `]`
6. 修復奇數引號

### 1.9 finishReason 檢查
```typescript
if (candidate.finishReason === 'MAX_TOKENS') {
  // 伺服端：換模型重試
  lastError = 'MAX_TOKENS';
  modelIndex++;
  continue;
}
```
確保截斷的 response 不會被當成有效結果處理。

### 1.10 前端錯誤映射（`friendlyError()`）
`/api/gemini` 回傳的錯誤字串會由前端 `src/App.tsx` 的 `friendlyError()` 轉為雙語友善訊息（8 類），詳見 `TECH_ARCHITECTURE.md §6`。

---

## 2. Yahoo Finance（非官方）

### 基本資訊
- 無官方 API，透過 Yahoo Finance 未公開端點抓資料
- 非官方，Yahoo 可能隨時更改格式或封鎖

### 端點
```
GET /v8/finance/chart/{TICKER}?interval={INTERVAL}&range={RANGE}
```

**範例**：
```
/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1d      # 今日即時
/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1y      # 個股預測用（365 日）
```

> **個股預測 fetch 策略**（2026-04）：
> `fetchHistoricalPrices(ticker, 365)` 同步抓目標股票與 SPY 各 365 日資料。
> 原為 90 日，因新增葛蘭威爾八大法則需 SMA200，改為 365 日以確保 220 bars 以上。

### Proxy 設定
由於 CORS 限制，瀏覽器無法直接打 Yahoo Finance。
透過 `vercel.json` 設定 rewrite：

```json
{
  "rewrites": [
    {
      "source": "/api/yahoo/:path*",
      "destination": "https://query1.finance.yahoo.com/:path*"
    }
  ]
}
```

前端呼叫 `/api/yahoo/...`，Vercel Edge 自動轉發到 Yahoo Finance。

> ⚠️ 本機開發時，`vite.config.ts` 有獨立的 proxy 設定處理同樣的路由。

### 已知風險
- Yahoo Finance 沒有 SLA，可能無預警 down 或換格式
- 若 Yahoo Finance 擋 IP，Vercel Edge 的請求也會失敗
- 備用方案：Alpha Vantage、Finnhub、Polygon.io（均需 API key）

---

## 3. Supabase

### 基本資訊
- 用途：**僅用於身份驗證（Auth）**，不儲存業務資料
- 文件：https://supabase.com/docs
- SDK：`@supabase/supabase-js`

### 設定
```typescript
// src/lib/supabase.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'kova_sb_session',
  },
});
```

### OAuth 設定（重要）
Supabase Dashboard → Authentication → URL Configuration 必須設定：

| 欄位 | 值 |
|------|-----|
| Site URL | `https://kova-mu.vercel.app` |
| Redirect URLs | `https://kova-mu.vercel.app/**` |
| Redirect URLs | `https://kova-mu.vercel.app` |
| Redirect URLs | `http://localhost:3000` （本機開發） |

> ⚠️ 加新網域時（例如自訂網域）必須更新 Redirect URLs，否則 OAuth 登入會跳回錯誤網址。

### 支援的登入方式
1. **Email + 密碼**：註冊後發送確認信，點擊才能登入
2. **Google OAuth**：一鍵登入，需要 Google Cloud Console 設定

### 目前資料表
| 資料表 | 狀態 | 說明 |
|--------|------|------|
| auth.users | ✅ Supabase 內建 | 用戶帳號 |
| tasks / history | ❌ 未建立 | 規劃中（目前用 localStorage） |

---

## 4. 本機開發設定

`.env` 檔案格式（不進 git）：
```
# 伺服端（由 /api/gemini 使用）——— 無 VITE_ 前綴，不進 bundle
GEMINI_API_KEY=AIzaSy...
GEMINI_API_KEY_2=AIzaSy...
GEMINI_API_KEY_3=AIzaSy...
# GEMINI_API_KEY_4 ~ _7 可選，視擴充需求

# 前端（Supabase 公開 key 可放 VITE_）
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

啟動開發伺服器：
```bash
npm run dev
# 在 http://localhost:3000 開啟
```

> 注意：本機開發 port 是 3000；Vercel 上線是 https://kova-mu.vercel.app。
> 本機若要測試 `/api/gemini`，需改用 `vercel dev`（一般 `vite dev` 不會啟動 Serverless Function）。
