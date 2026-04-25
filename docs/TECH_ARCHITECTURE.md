# KOVA — 技術架構文件

**版本**：1.2  
**最後更新**：2026-04-22

---

## 1. 系統架構圖

```
用戶瀏覽器
    │
    ▼
Vercel（靜態托管 + Serverless Functions + Rewrites）
    ├── React SPA（前端 UI 與業務邏輯）
    │       ├── Vite 6 打包
    │       ├── React 19
    │       ├── TypeScript 5.8
    │       └── Tailwind CSS v4
    │
    ├── /api/yahoo/* → rewrite → Yahoo Finance API
    │       （vercel.json rewrites；瀏覽器繞過 CORS）
    │
    ├── /api/gemini → Node.js Serverless Function → Gemini API
    │       ├── key 僅存伺服端 env vars（無 VITE_ 前綴）
    │       ├── 7 把 key 輪替 + 隨機起點
    │       ├── 預算式重試：58s 總預算 / 單次 50s 上限
    │       └── 503 自動降級至 gemini-2.5-flash-lite
    │
    └── → Supabase（Auth only）
            └── Email / Google OAuth 登入
```

---

## 2. 技術選型

| 層級 | 技術 | 版本 | 選擇原因 |
|------|------|------|---------|
| 前端框架 | React | 19 | 生態豐富，Claude 熟悉 |
| 建構工具 | Vite | 6 | 快速開發，HMR |
| 語言 | TypeScript | 5.8 | 型別安全，減少 bug |
| 樣式 | Tailwind CSS | v4 | utility-first，快速開發 |
| 動畫 | Framer Motion (motion) | 12 | 流暢動效，API 簡單 |
| AI 模型（主） | Gemini 2.5 Flash | - | 免費方案額度夠，速度快 |
| AI 模型（備援） | Gemini 2.5 Flash-Lite | - | 主模型 503 時自動切換 |
| 資料庫 / Auth | Supabase | - | 免費方案，Google OAuth 內建 |
| 托管 | Vercel | - | 免費，GitHub 自動部署，Serverless 支援 maxDuration |
| 股價資料 | Yahoo Finance | - | 非官方 API，免費 |
| 國際化 | react-i18next | - | 繁中 / 英文切換 |

---

## 3. 資料流向

### 市場分析（Recommendation）流程
```
用戶選擇類型 + 時間 + 目標報酬
    │
    ▼
fetchLivePricesForTickers()
    └── /api/yahoo/... → Yahoo Finance（即時價格）
    │
    ▼
generateInvestmentAdvice()
    └── POST /api/gemini（Node.js Serverless Function）
        ├── 系統提示 + 即時價格 + 用戶參數
        ├── 伺服端注入 key、輪替、降級
        └── 回傳 { text: string }
    │
    ▼
parse → validateAndClampRecommendations()
    └── 數學鉗制（targetPrice 不超過 volatility guard）
    │
    ▼
顯示結果 + saveTask()（存 localStorage）+ incrementAnalysesUsed()
```

### 個股預測流程（兩階段）
```
用戶輸入股票代號 + 時間範圍
    │
    ▼
Phase 1：本地計算（立即）
    ├── fetchHistoricalPrices(ticker, 365)   ← 365 日資料為葛蘭威爾 SMA200 所需
    ├── fetchHistoricalPrices('SPY', 365)
    ├── runMonteCarloSimulation()
    ├── calculateTechnicalScore()
    │       ├── RSI (0.25)
    │       ├── MA (0.25)
    │       ├── Granville's 8 Rules (0.25)   ← 葛蘭威爾八大法則
    │       ├── Bollinger (0.125)
    │       └── MACD (0.125)
    └── calculateEntryTiming()
    │
    ▼
Phase 2：AI 深度分析（30~40 秒）
    └── analyzeSingleStock() → POST /api/gemini
        └── 回傳：情境分析、基本面、機構動向、催化劑
    │
    ▼
合併 Phase 1 + Phase 2 → 一次性顯示完整結果
```

---

## 4. 目錄結構

```
kovaproject/
├── src/
│   ├── App.tsx              # 主應用，所有 tab 邏輯 + friendlyError() 錯誤映射
│   ├── main.tsx             # 入口點
│   ├── i18n.ts              # 中英文翻譯
│   ├── index.css            # 全域樣式（glass-card、btn-primary 等）
│   ├── vite-env.d.ts        # env vars 型別定義
│   ├── components/
│   │   ├── HomeHero.tsx              # 首頁（美股 AI 分析 / LIVE US MARKET badge）
│   │   ├── RecommendationCard.tsx    # 市場分析結果卡片
│   │   ├── RecommendationSkeleton.tsx# 市場分析載入骨架
│   │   ├── StockPredictionChart.tsx  # 個股預測結果（5 項技術指標）
│   │   ├── HealthCheckCard.tsx       # 持股健檢結果
│   │   ├── WatchlistSection.tsx      # 自選追蹤
│   │   ├── HistorySection.tsx        # 歷史紀錄
│   │   ├── LoginModal.tsx            # 登入 Modal（Google 優先、Email 收合）
│   │   ├── ProfileMenu.tsx           # 用戶選單
│   │   ├── TrialBanner.tsx           # 試用額度提醒
│   │   ├── AnalysisProgress.tsx      # 漸進式分析進度條
│   │   ├── LegalConsentModal.tsx     # 首訪三項勾選同意牆
│   │   ├── LegalTextModal.tsx        # ToS / Privacy 全文 Modal
│   │   └── ResultDisclaimerBanner.tsx# 結果頁紅底警語帶
│   └── lib/
│       ├── gemini.ts        # AI 分析邏輯（呼叫 /api/gemini，不再持有 key）
│       ├── finance.ts       # 股價抓取 + 技術分析（含 calculateGranville()）
│       ├── storage.ts       # localStorage 操作、trial、daily quota
│       ├── auth.ts          # 用戶認證
│       ├── supabase.ts      # Supabase client
│       └── utils.ts         # 工具函數
├── api/
│   └── gemini.ts            # ✨ Node.js Serverless Function：Gemini 代理
├── docs/                    # 本文件目錄
├── public/                  # 靜態資源
├── .env                     # 本機 API keys（不進 git）
├── .gitignore               # 含 _handoff/ 與 *.txt 阻擋
├── index.html               # <title>KOVA AI - 美股資訊觀察平台</title>
├── vercel.json              # Yahoo proxy rewrite 設定
├── vite.config.ts
└── package.json
```

---

## 5. 環境變數清單

### 伺服端（`/api/gemini`；無 `VITE_` 前綴，不進瀏覽器 bundle）
| 變數名稱 | 用途 | 必要 |
|---------|------|------|
| `GEMINI_API_KEY` | Gemini AI 第 1 把 key | ✅ |
| `GEMINI_API_KEY_2` | Gemini AI 第 2 把 key | 建議 |
| `GEMINI_API_KEY_3` | Gemini AI 第 3 把 key | 建議 |
| `GEMINI_API_KEY_4~7` | 第 4~7 把 key（水平擴充） | 可選 |

### 前端（打包進 bundle，僅放公開資訊）
| 變數名稱 | 用途 | 必要 |
|---------|------|------|
| `VITE_SUPABASE_URL` | Supabase 專案 URL | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key（本就公開） | ✅ |

> **⚠️ 安全性遷移紀錄**：2026-04 之前 Gemini key 以 `VITE_` 前綴暴露在前端，之後遷移到伺服端 Serverless Function（`api/gemini.ts`）。所有前端程式碼透過 `fetch('/api/gemini')` 呼叫，key 僅 Vercel 伺服端可見。

---

## 6. `/api/gemini` Serverless Function 規格

```ts
export const maxDuration = 60;             // Vercel Node.js 硬上限

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const TOTAL_BUDGET_MS = 58_000;            // 單請求總預算（留 2s 緩衝）
const PER_CALL_TIMEOUT_MS = 50_000;        // 單次 Gemini 呼叫上限
const MIN_FALLBACK_BUDGET_MS = 20_000;     // 低於此預算不再重試
```

### 路由邏輯（摘要）
1. 收到 `POST /api/gemini` with `{ systemInstruction?, contents, generationConfig? }`
2. 從 `keys[]` 隨機起點輪替（平均分散流量）
3. 對 `gemini-2.5-flash` 發請求（`AbortController` 綁預算剩餘時間）
4. 錯誤處理：
   - `400 / 403 / API_KEY_INVALID` → 加入 `deadKeys` 並換 key
   - `429 quota exceeded` → 換 key 重試
   - `404 not found` → 換模型
   - **`503 overloaded` → 換模型（降級 flash-lite）並換 key**
   - `finishReason === 'MAX_TOKENS'` → 換模型
   - 逾時（AbortError）→ 不再重試，直接回傳錯誤
5. 剩餘預算低於 `MIN_FALLBACK_BUDGET_MS` 就結束，回傳 `{ error: 'Analysis failed: <lastError>' }`

### `friendlyError()` 錯誤映射（`src/App.tsx`）
前端將代理回傳的錯誤字串映射為雙語友善訊息，檢查順序：
1. `All API keys exhausted` / `all retry attempts failed`
2. `429` / `quota`（含 daily 判斷）
3. `API_KEY_INVALID` / `400`
4. `503` / `overloaded` / `high demand` / `unavailable`
5. **`timeout` / `aborted`**（2026-04 新增）
6. `404` / `not found`
7. `Failed to fetch` / `network` / `ECONNREFUSED`
8. `Failed to parse`
9. fallback：截斷至 120 字

---

## 7. 部署流程

```
本地修改程式碼
    │
    ▼
git add . && git commit -m "描述"
    │
    ▼
git push origin main
    │
    ▼
Vercel 偵測到新 commit → 自動觸發 build
    │
    ▼
npm run build（vite build）+ 部署 /api/gemini Node.js Function
    │
    ▼
部署到 kova-mu.vercel.app（約 2 分鐘）
```

> 注意：commit 的 git email 必須與 GitHub 帳號相符，否則 Vercel 會 block 部署。

---

## 8. localStorage Schema

| Key | 值 | 用途 | 寫入時機 |
|-----|---|------|---------|
| `kova_lang` | `'zh'` / `'en'` | UI 語系 | 使用者切換語系 |
| `kova_legal_consent` | `'1'` | 首訪同意牆旗標 | 使用者通過 `LegalConsentModal` |
| `kova_legal_consent_at` | ISO timestamp | 同意時間（稽核用） | 同上 |
| `kova_sb_session` | Supabase session JSON | 登入狀態 | Supabase Auth 內部維護 |
| `kova_history_<userId>` | Task[] | 分析歷史紀錄 | 每次分析完成 |
| `kova_history_guest` | Task[] | 訪客歷史紀錄 | 同上 |
| `kova_watchlist_<userId>` | WatchlistItem[] | 自選追蹤 | 使用者加入/移除自選 |
| `kova_daily_<userId>_<YYYY-MM-DD>` | number | 當日分析次數 | 每次分析（登入用戶） |
| `trial_state` | `{active, analysesUsed, maxAnalyses, startedAt}` | 訪客試用狀態 | 首次分析自動啟動 |

> 所有 key 都以 `kova_` 前綴（除 `trial_state`），清除時可用 `Object.keys(localStorage).filter(k => k.startsWith('kova_'))`。

---

## 9. 法律合規層（Legal Compliance Layer）

### 元件關係
```
App.tsx
 ├── <LegalConsentModal>           (z-[200/201], gate at boot)
 │      └─ onShowTerms/Privacy → <LegalTextModal docType="terms"|"privacy">  (z-[210/211])
 ├── <LoginModal>                   (z-[100/101])
 │      └─ register mode → age + risk consent checkboxes
 │             └─ gates BOTH Google OAuth AND Email submit button
 └── Result blocks
        └─ <ResultDisclaimerBanner>  (頂端固定，三種分析皆掛)
```

### 同意牆觸發條件（App.tsx useState 初始值）
```ts
const [legalConsentOpen, setLegalConsentOpen] = useState(() => {
  return localStorage.getItem('kova_legal_consent') !== '1';
});
```

### 雙語 Clamp Note（gemini.ts）
- `validateAndClampRecommendations(params, lang)`、`validateAndClampPrediction(params, lang)` 接收當前語系
- 鉗制後附加：
  - `lang === 'zh'` → `[系統提示：目標價/停損已依據波動率守則調整]`
  - 否則 → `[Note: Target/stop adjusted per volatility guard]`
- RecommendationCard / StockPredictionChart 以 regex `/\s*\[(?:系統提示|Note:)[^\]]*\]/` 偵測並樣式化，確保中英文都能被抓到

### 營運者識別與聯絡管道
- ToS 新增 `legal.terms.operator.*`（KOVA 營運者標示），置於首節附近
- Privacy 新增 `legal.privacy.contact.*`（聯絡信箱），置於第 6 節
- i18n key 為單一事實來源（single source of truth）
