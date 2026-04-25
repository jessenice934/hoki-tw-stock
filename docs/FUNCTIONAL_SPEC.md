# KOVA — 功能規格書

**版本**：1.2  
**最後更新**：2026-04-22

---

## 1. 市場分析（Recommendation，UI 顯示：市場分析 / Market Analysis）

### 輸入參數
| 欄位 | 類型 | 選項 | 說明 |
|------|------|------|------|
| 標的類型 | 下拉選單 | AI 推薦、科技股、半導體、高股息、積極成長、ETF、生技、能源 | 決定分析哪些股票池 |
| 預計操作時間 | Pill 按鈕 | 一週、兩週、三週、一個月、自定義 | 影響 volatility guard 上限 |
| 目標報酬 | 數字輸入 | % | 用戶期望報酬率 |
| 最大風險承受 | 數字輸入 | % | 最大可接受回撤 |

### 輸出結果
- 3 支推薦股票（`recommendations` 陣列）
- 每支股票包含：
  - 目前價格、建議進場價、**觀察目標**、**風險觀察線**（用詞已軟化）
  - 潛在報酬 %
  - 投資理由（`rationale`）
  - 催化劑清單（`catalysts`）
  - 熊市情境（`bearCase`）
  - 訊號強度（Signal Strength，0-100；UI 舊稱「信心指數」）
  - 12 個量化信號（`signals`）
  - 6 個投資風格評分（`personaAnalysis`）
- 整體風險評級（Low / Medium / High）
- 執行策略（`strategy`）
- 風險警告清單

> **18 維度架構**：12 量化訊號 + 6 投資風格觀點 = 18 維度整合分析。首頁 `feature.deep.desc` 已同步更新文案。

### Volatility Guard（價格鉗制）
| 操作時間 | 最大目標漲幅上限 |
|---------|---------------|
| 1 週 | 5% |
| 2 週 | 8% |
| 3 週 | 10% |
| 1 個月 | 15% |
| 自定義 | 依天數換算 |

> AI 回傳的 targetPrice 如果超過此上限，系統自動鉗制到上限值。
> 鉗制後會在 rationale 尾端附上雙語註記：
> - 中：`[系統提示：目標價/停損已依據波動率守則調整]`
> - 英：`[Note: Target/stop adjusted per volatility guard]`
>
> RecommendationCard / StockPredictionChart 以 regex `\s*\[(?:系統提示|Note:)[^\]]*\]/` 偵測並轉成小字樣式，確保中英文模式下都不會裸露出對方語言。

### 股票候選池（依類型）
| 類型 | 候選股票 |
|------|---------|
| AI 推薦 | NVDA, MSFT, GOOGL, META, AMZN, AMD, PLTR, CRM |
| 科技股 | AAPL, MSFT, GOOGL, META, AMZN, CRM, ORCL, ADBE |
| 半導體 | NVDA, AMD, TSM, AVGO, INTC, QCOM, MU, ASML |
| 高股息 | JNJ, PG, KO, PEP, XOM, CVX, VZ, T |
| 積極成長 | NVDA, TSLA, PLTR, MSTR, COIN, SQ, SHOP, SNOW |
| ETF | VOO, QQQ, ARKK, SPY, IWM, VTI, SCHD, XLK |
| 生技 | LLY, UNH, ABBV, JNJ, PFE, MRK, AMGN, GILD |
| 能源 | XOM, CVX, OXY, COP, SLB, EOG, MPC, PSX |

### 篩選條件
- 只推薦 12 個 signals 中 **8 個以上為 Positive** 的股票
- 有 Sector Blacklist 防止 AI 誤分類（例如 NVDA 不應出現在高股息類別）

---

## 2. 個股預測（Stock Prediction）

### 輸入
| 欄位 | 類型 | 說明 |
|------|------|------|
| 股票代號 | 文字輸入 | 自動轉大寫，支援全形轉半形 |
| 預測時間範圍 | Pill 按鈕 | 一週、兩週、三週、一個月、自定義 |

### 兩階段處理邏輯

**Phase 1：本地計算（立即完成）**
- 抓取 Yahoo Finance 歷史股價（**365 日**，為 SMA200 與葛蘭威爾法則所需）
- 同步抓取 SPY 365 日做市場 Beta 比較
- 蒙地卡羅模擬（10,000 次模擬路徑）→ 觀察目標、風險觀察線、上漲機率
- 技術評分（**5 項指標加權**，下節詳述）
- 進場時機評估（支撐 / 阻力位）

**Phase 2：AI 深度分析（30~40 秒）**
- `/api/gemini` Gemini API 分析：
  - 4 個基本面指標
  - 3 個情境（樂觀 / 中性 / 悲觀，機率合計 100%）
  - 市場情緒評分
  - 機構動向評分
  - 2~3 個支撐 / 阻力位
  - 時間範圍內的關鍵事件
  - 催化劑
  - 熊市風險

**合併原則**：
- AI 有回傳 targetPrice → 用 AI 的
- AI 沒回傳 → 用蒙地卡羅的

> 兩個 phase 全部完成後，才一次顯示完整結果（不顯示中間半成品）

### 2.1 本地技術指標（5 項加權）

| 指標 | 權重 | 計算來源 |
|------|-----|---------|
| RSI (14) | 0.25 | `calculateRSI()` |
| MA (20/50/200) | 0.25 | `calculateMA()` |
| **Granville's 8 Rules**（葛蘭威爾八大法則） | **0.25** | **`calculateGranville()`** |
| Bollinger Bands | 0.125 | `calculateBollinger()` |
| MACD | 0.125 | `calculateMACD()` |

#### 葛蘭威爾八大法則（`calculateGranville` @ `src/lib/finance.ts`）
基於 SMA200 + 斜率 + 穿越行為判定 8 個經典訊號：

| 法則 | 類型 | 條件（簡述） |
|------|------|------|
| Buy 1 | 買進 | 均線由下降轉為平盤或上升，股價從下方突破均線 |
| Buy 2 | 買進 | 均線上升，股價跌破均線後快速回升 |
| Buy 3 | 買進 | 股價在均線上方，回測不破均線又上彈 |
| Buy 4 | 買進 | 股價在均線下方遠距離，出現超跌反彈 |
| Sell 1 | 賣出 | 均線由上升轉為平盤或下降，股價從上方跌破均線 |
| Sell 2 | 賣出 | 均線下降，股價反彈不過均線又下挫 |
| Sell 3 | 賣出 | 股價在均線下方，反彈碰到均線又跌 |
| Sell 4 | 賣出 | 股價在均線上方遠距離，出現超漲回落 |

- 斜率判定：20 日回看，>1% 上升、<-1% 下降、其他平盤
- 資料不足（< 220 bars）時優雅降級，回傳中性訊號
- UI 在 `StockPredictionChart` 顯示為 `prediction.technicalScore.granville`（葛蘭威爾法則 / Granville's Rules）
- **零 Gemini API 成本**：純本地計算

### 輸出結果
- 預測方向（Bullish / Bearish / Neutral）+ 信心 %
- 目前價格、**觀察目標**（原目標價）、**風險觀察線**（原停損價）
- 潛在報酬 %
- K 線圖（歷史走勢 + 預測區間；圖例為「觀察目標線 / 風險觀察線」）
- 情境分析（3 個情境各自的機率與目標價）
- 技術指標（5 項）、基本面、機構動向、市場情緒（各 0-100 分）
- 催化劑 / 風險提示
- 關鍵事件時間軸

---

## 3. 持股健檢（Health Check）

### 輸入
純文字描述持倉，例如：
```
AAPL 30%
NVDA 20%
TSLA 15%
VOO 35%
```
支援圖片上傳（截圖持倉畫面），AI 自動解析成文字。

> **⚠️ 額度消耗**：健檢與其他分析一樣會消耗試用 / 每日額度。圖片上傳路徑在觸發 `extractPortfolioFromImage()` 前已先檢查 `canAnalyze()`，避免額度耗盡時仍浪費 API 呼叫。

### 輸出結果
- 整體健康評分（0-100）
- 整體評估（一句話）
- 每支持股分析：評估、風險等級（Low/Medium/High）、建議
- 板塊分布（圓餅圖式長條）
- 集中度問題警告
- 相關性風險提示
- 整體改善建議

### 板塊名稱翻譯（中文模式）
| 英文 | 中文 |
|------|------|
| Information Technology | 資訊科技 |
| Communication Services | 通訊服務 |
| Consumer Discretionary | 非必需消費 |
| Consumer Staples | 必需消費 |
| Health Care | 醫療保健 |
| Financials | 金融 |
| Energy | 能源 |
| Materials | 原材料 |
| Industrials | 工業 |
| Real Estate | 房地產 |
| Utilities | 公用事業 |

---

## 4. 自選追蹤（Watchlist）

- 在市場分析或個股預測結果頁，點「追蹤」加入自選
- 儲存資料：股票代號、名稱、加入時間、進場價、觀察目標、目前價格
- 資料儲存位置：localStorage（依帳號 ID 分開）
- 已加入後按鈕變「已追蹤」，不可重複加入

---

## 5. 歷史紀錄（History）

- 每次分析完成自動儲存（成功或 AI 失敗的本地結果都會存）
- 儲存內容：分析類型、日期、參數、結果（JSON stringify）
- 儲存位置：localStorage（依帳號 ID 分開，未登入存 `kova_history_guest`）
- 可展開查看過去結果
- 跨裝置不同步（目前限制，未來改 Supabase）

---

## 6. 登入系統

### 支援方式
- Google OAuth（**主要流程**，Modal 頂端 primary CTA）
- Email + 密碼（Supabase Auth，**次要流程**）

### LoginModal UX 規則
1. **Google 優先**：Modal 打開時，Email 表單預設收合，僅顯示 Google 按鈕 + 「以電子郵件繼續 →」文字按鈕
2. **Email 展開**：點擊文字按鈕後，Divider + Email / (Name) / Password 表單以 height animation 展開，自動 focus email 欄位
3. **切換 Tab 或重新開啟 Modal**：一律重置為收合狀態
4. **註冊模式同意勾選**（二層防線，高於首訪同意牆）：
   - ☐ 我已年滿 20 歲，具完全行為能力（`auth.consent.age`）
   - ☐ 我了解 KOVA 僅提供市場資訊，投資決策與盈虧由我自負（`auth.consent.risk`）
   - 兩項未勾選時，Google OAuth **和** Email 提交按鈕同時 disabled
5. **checkbox 位置**：勾選框置於 Google OAuth 按鈕**上方**，確保 OAuth 路徑無法繞過
6. **CSS 細節**：展開容器使用 `overflow-hidden -mx-2 px-2`，讓 focus ring (`ring-2 ring-blue-500/20`) 有 8px 橫向空間不被裁切

### 登入後行為
- 試用次數不再計算
- 歷史紀錄、自選股改用帳號 ID 存取（不與訪客資料合併）
- 導向 email 確認信（新註冊）

### 登入狀態保持
- Supabase session 持久化（storageKey: `kova_sb_session`）
- 重新整理後自動恢復登入狀態

---

## 7. 試用系統（Trial，自動啟動）

### 啟動機制（2026-04 調整）
- 訪客無需明確按「開始試用」按鈕
- 首次點擊分析按鈕時，`incrementAnalysesUsed()` 自動呼叫 `startTrial()`，將 `trial_state.active` 設為 `true`
- `canAnalyze(null)` 判斷邏輯：`trial.analysesUsed < trial.maxAnalyses`（不需要 `active === true`）

### 額度規則
- **訪客**：終身 5 次（`trial_state.maxAnalyses`）
- **登入用戶**：初期開放無限制；保留未來每日 10 次限制機制（`kova_daily_<userId>_<date>`）

---

## 8. 法律同意牆（LegalConsentModal）

### 觸發條件
- `localStorage.kova_legal_consent !== '1'` 時，App 掛載即自動開啟
- 完全覆蓋 App（z-index 200/201），無法略過

### UI 構成
- 4 條告知性 bullet（非投資建議、自負盈虧、AI 可能有誤、資料可能延遲）
- 3 項必須勾選的 consent：
  - 我已閱讀並同意 [服務條款]（可點開 `LegalTextModal` docType=`terms`）
  - 我已閱讀並同意 [隱私權政策]（可點開 `LegalTextModal` docType=`privacy`）
  - 我理解 KOVA 不構成投資建議，任何損失由我自行承擔
- 三項皆勾才能點「我已閱讀並同意」按鈕

### 接受後行為
- `localStorage.setItem('kova_legal_consent', '1')`
- `localStorage.setItem('kova_legal_consent_at', new Date().toISOString())`（稽核 timestamp）
- Modal 關閉，使用者可正常使用 App

---

## 9. 結果頁警語帶（ResultDisclaimerBanner）

### 出現位置
- 市場分析結果卡頂端
- 個股預測結果卡頂端
- 持股健檢結果卡頂端

### UI 規格
- 紅底 (`bg-rose-50 border-rose-200`)
- `AlertTriangle` icon（rose-600）
- 標題：`result.disclaimer.title`（「僅供參考，非投資建議」/「For Reference Only — Not Investment Advice」）
- 說明：`result.disclaimer.body`（說明 AI 可能有誤、需自行研究）

---

## 10. Terms of Service / Privacy Policy Modal（LegalTextModal）

### Props
```ts
{ open: boolean; docType: 'terms' | 'privacy'; onClose: () => void }
```

### 內容來源
- ToS：7 段（s1~s7 × heading/body）來自 `legal.terms.*` i18n keys，**新增 `legal.terms.operator.*`（營運者識別）**
- Privacy：6 段（s1~s6 × heading/body）來自 `legal.privacy.*` i18n keys，**新增 `legal.privacy.contact.*`（聯絡信箱）**
- 最後更新時間：`legal.meta.updated`

### 觸發點
- Footer：「服務條款」/「隱私權政策」兩個按鈕
- LegalConsentModal 內的兩個超連結
- z-index 210/211（比 LegalConsentModal 更上層，可疊加）
