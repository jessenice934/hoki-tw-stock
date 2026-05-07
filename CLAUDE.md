# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 開發指令

```bash
npm run dev      # 啟動 dev server（port 3000，0.0.0.0）
npm run build    # 生產版本打包
npm run preview  # 預覽 build 結果
npx tsc --noEmit # 型別檢查（無測試框架，用這個驗證）
```

部署：push to `main` → Vercel 自動觸發 build（約 2 分鐘）

---

## 系統架構

**純前端 SPA + Vercel Serverless Functions**。無後端伺服器。

```
src/App.tsx          ← 唯一大型元件，持有所有 tab 狀態、auth、quota 邏輯
src/lib/gemini.ts    ← AI 分析邏輯（POST /api/gemini，不持有 key）
src/lib/finance.ts   ← 股價抓取 + 技術指標計算
src/lib/storage.ts   ← localStorage 讀寫 + Supabase cloud sync
src/lib/cloudStorage.ts ← Supabase CRUD（history / watchlist / lessons）
api/gemini.ts        ← Vercel Serverless Function（Gemini proxy，持有 API key）
```

### Tab 路由

App.tsx 以 `Tab` type 管理頁面切換，無 React Router：

```ts
type Tab = 'home' | 'recommend' | 'prediction' | 'health' | 'watchlist' | 'history' | 'retrospective';
```

### 個股預測：兩階段流程

1. **Phase 1（本地，即時）**：`fetchHistoricalPrices(ticker, 365)` → 技術指標（RSI、MA、葛蘭威爾八大法則、Bollinger、MACD）→ Monte Carlo 模擬
2. **Phase 2（AI，30~40 秒）**：`analyzeSingleStock()` → `POST /api/gemini` → 情境分析、法人動態、催化劑

### `/api/gemini` Serverless Function

- 7 把 Gemini API key 輪替（隨機起點）
- 主模型 `gemini-2.5-flash`，503/過載自動降級 `gemini-2.5-flash-lite`
- 58 秒總預算，逾時直接回錯誤（不再重試）
- 前端錯誤映射在 `App.tsx` 的 `friendlyError()` 函式

### 資料持久化：雙層架構

**localStorage（同步，主要讀取路徑）+ Supabase（非同步，雲端同步）**

- 所有寫入：先寫 localStorage，同時 fire-and-forget 到 Supabase
- 登入時：`syncHistoryFromCloud()` / `syncWatchlistFromCloud()` 以 ID merge，不覆蓋
- Supabase 資料表：`user_history`、`user_watchlist`、`user_lessons`（均有 RLS）

localStorage key 前綴：`stock_ai_history_<userId>`、`stock_ai_watchlist_<userId>`

---

## 環境變數

**伺服端（`api/gemini.ts`，無 `VITE_` 前綴，不進 browser bundle）**
- `GEMINI_API_KEY` ~ `GEMINI_API_KEY_7`：Gemini API keys

**前端（`VITE_` 前綴，進 bundle，僅放公開資訊）**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`：Supabase auth
- `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`：PostHog 分析（選填，未設自動停用）

---

## Design System 重要規則

### 台股漲跌色翻轉（⚠️ 必讀）

**`emerald` = 紅（漲）、`red` = 綠（跌）** — 與美股習慣相反。

`src/index.css` 把 Tailwind 的 `emerald` 系列覆寫為朱紅色（`#C8553D` 系），`red` 覆寫為松綠色。因此：

- `bg-emerald-100` → 實際顯示為**粉紅/朱紅**（看多、目標價、上漲）
- `bg-red-50` → 實際顯示為**淡綠**（停損、風險、下跌）

新增任何漲跌顏色時，延續這套命名。

### 主要 Token

- `--color-paper: #FAF6EE`：全站底色（米白）
- `--color-ink: #1A1F2E`：主文字
- `--color-blue-*`：覆寫為染靛（Indigo Dye）品牌色，`blue-500 = #3F4E89`
- `glass-card`、`btn-primary` 等 utility class 定義在 `src/index.css`

### i18n

`src/i18n.ts` 為單一事實來源，含 `zh`（繁中）和 `en` 兩個 namespace。新增文案時兩個都要加。

---

## 台股特有邏輯

- **Ticker 正規化**：`normalizeTwTicker()` 將純數字 ticker 補 `.TW`（上市）；`resolveYahooSymbol()` 會先試 `.TW`，若無資料自動 fallback `.TWO`（上櫃）
- **三大法人資料**：透過 `/api/finmind` proxy 抓 FinMind API，結果強制覆蓋 AI 編造的法人動態（`buildInstitutionalActivity()`）
- **法律合規層**：首訪有三項勾選同意牆（`LegalConsentModal`），通過後寫 `hoki_legal_consent=1` 到 localStorage

---

## API Proxy 設定

| 路徑 | 目標 | 說明 |
|------|------|------|
| `/api/yahoo/*` | Yahoo Finance | Vite dev 用 proxy，Vercel 用 `vercel.json` rewrite |
| `/api/twse` | TWSE MIS API | 中文股票名稱查詢 |
| `/api/finmind` | FinMind API | 三大法人買賣超（Vite dev middleware 模擬） |
| `/api/gemini` | Gemini AI | Vercel Serverless Function（dev 有模擬 middleware） |
| `/api/news` | Google News RSS | 個股新聞標題（dev 有模擬 middleware） |

Dev 環境的 `/api/finmind`、`/api/gemini`、`/api/news` 均由 `vite.config.ts` 內的 Vite plugin middleware 模擬，直接 SSR 載入對應的 `api/*.ts`。
