# KOVA — 營運規則文件

**版本**：1.1  
**最後更新**：2026-04-22

---

## 1. 用戶分層

| 層級 | 條件 | 使用限制 | 功能 |
|------|------|---------|------|
| 訪客（未登入） | 未登入，尚未用過 | 首次點分析自動啟用試用 | 全功能（含 5 次試用） |
| 試用用戶 | 未登入，`trial_state.active = true` | 5 次終身 | 全功能 |
| 免費會員 | 已登入 | **無限制**（初期開放） | 全功能 + 歷史紀錄 |
| Pro（規劃中） | 付費 | 無限制 + 進階功能 | - |

> 初期策略：登入即無限制，目的是累積真實用戶與使用資料，降低摩擦。
> 未來收費時，在 `storage.ts` 的 `canAnalyze()` 加入 Pro 方案判斷即可。

---

## 2. 試用額度規則

### 計算邏輯
```
localStorage key: "trial_state"
{
  active: boolean,       // 是否已啟動（首次 increment 時自動設為 true）
  analysesUsed: number,  // 已用次數
  maxAnalyses: 5,        // 上限（目前 5 次）
  startedAt: string,     // 開始時間
}
```

### 啟動方式（2026-04 調整）
- **不再需要**點「開始試用」按鈕
- 訪客點擊任何分析動作 → `incrementAnalysesUsed()` 自動呼叫 `startTrial()`
- `canAnalyze(null)` 僅檢查 `analysesUsed < maxAnalyses`

### 觸發點
以下動作各計算 1 次：
1. 市場分析完成（成功）
2. 市場分析失敗（AI 錯誤，仍計算）
3. 個股預測完成（Phase 2 成功）
4. 個股預測 AI 失敗（本地結果顯示，仍計算）
5. 持股健檢完成（文字輸入路徑）
6. **持股健檢圖片上傳路徑**：`canAnalyze()` 檢查已提前到 `extractPortfolioFromImage()` **之前**，避免額度耗盡仍浪費 OCR 呼叫

> 分析「開始」不計算，「完成」才計算，避免用戶因網路問題損失次數。

### 超過上限
- 點任何「分析」按鈕 → 彈出登入 Modal
- 不顯示「試用已滿」的字樣，直接引導登入

### 剩餘次數警告
- 剩下 1~3 次時，分析完後顯示 TrialBanner
- 訪客 Banner：顯示「體驗次數即將用盡 / 還剩 X 次」+ 登入按鈕
- 登入用戶 Banner（如未來恢復限制）：顯示「今日額度即將用盡」，無登入按鈕

---

## 3. 語言設定

| 項目 | 規則 |
|------|------|
| 預設語言 | 繁體中文 |
| 切換方式 | Nav 右上角「English / 中文」按鈕 |
| 持久化 | 存入 `localStorage`（key: `kova_lang`） |
| 重新整理後 | 讀取 localStorage 恢復設定 |
| AI 輸出語言 | 依 `i18n.language` 傳給 API（`lang: 'zh'` 或 `'en'`） |
| 錯誤訊息 | 由 `friendlyError()` 依 `i18n.language` 選中/英文 |

---

## 4. 錯誤處理規則

### 用戶看到的錯誤訊息

友善錯誤映射由 `src/App.tsx` 的 `friendlyError(msg, lang)` 統一負責，檢查順序如下：

| 原始錯誤關鍵字 | 顯示給用戶（繁中） |
|---------|-----------|
| `All API keys exhausted` / `all retry attempts failed` | AI 服務暫時無法使用，請稍後再試。 |
| `429` / `quota`（非 daily） | AI 請求太頻繁，請稍等 1 分鐘後再試。 |
| `429` / `quota`（含 `daily` / `per day`） | AI 服務今日免費額度已用完，請明天再試。 |
| `API_KEY_INVALID` / `400` | API 金鑰無效或已過期，請聯繫管理員。 |
| `503` / `overloaded` / `high demand` / `unavailable` | AI 模型目前使用人數較多，請稍等約 30 秒後重試一次。 |
| **`timeout` / `aborted`** | AI 回應時間過長已中斷，請稍候再試一次（通常一分鐘內就會恢復）。 |
| `404` / `not found` | AI 模型暫時無法使用，請稍後再試。 |
| `Failed to fetch` / `network` / `ECONNREFUSED` | 網路連線失敗，請檢查網路後重試。 |
| `Failed to parse` | AI 回應格式異常，請重試一次。 |
| 其他錯誤（>120 字） | 截斷顯示前 120 字 + `...` |

### 不顯示給用戶的資訊
- 原始 API error message（超過 120 字才截斷）
- Stack trace
- 內部模型名稱 / key 輪替狀況

### 維運建議
- 新增錯誤類別時需同步更新雙語文案
- 503 / timeout 狀態通常 1~2 分鐘自行恢復，不需立即介入
- `All API keys exhausted` 若持續出現 → 檢查 Vercel env vars 中所有 `GEMINI_API_KEY*` 是否正常

---

## 5. Loading 狀態規則

| 狀態 | 說明 | UI 行為 |
|------|------|---------|
| `loading=true` | 主要分析進行中 | 轉圈 + 文字「大師圓桌會議中...」 |
| `aiAnalyzing=true` | 個股預測 Phase 2 進行中 | 轉圈 + 文字「AI 深度分析中，請稍候...」 |
| `loading=true` 或 `aiAnalyzing=true` | 任何分析進行中 | **所有 Tab、按鈕、下拉選單全部 disabled** |

> 防止用戶在分析進行中切換 Tab 或重複提交。

---

## 6. 資料儲存規則

### localStorage key 命名規則
| Key | 說明 |
|-----|------|
| `kova_history_{userId}` | 登入用戶的歷史紀錄 |
| `kova_history_guest` | 未登入用戶的歷史紀錄 |
| `kova_watchlist_{userId}` | 登入用戶的自選股 |
| `kova_watchlist_guest` | 未登入用戶的自選股 |
| `kova_daily_{userId}_{YYYY-MM-DD}` | 當日分析次數（登入用戶每日 10 次機制，目前未啟用） |
| `trial_state` | 訪客試用狀態 |
| `kova_lang` | 語言設定 |
| `kova_sb_session` | Supabase session |
| `kova_legal_consent` | 首訪法律同意旗標 |
| `kova_legal_consent_at` | 同意 ISO timestamp（稽核） |

### 跨裝置限制
- 目前所有資料僅存本機
- 登入不同裝置，歷史紀錄和自選股**不同步**
- 規劃中：改用 Supabase 儲存

---

## 7. API Key 額度估算

### 免費方案額度（Gemini）
- 單把 key：`gemini-2.5-flash` 約 250 requests/day（免費）
- 目前配置：3 把預設 + 可擴充至 7 把
- 3 把 key 理論上限：約 **750 RPD**（requests per day）
- 考量每次分析 ≈ 1 request，**預估可服務 DAU 200~250**（重度使用者會用多次）

### 何時需要升級
- 接近 DAU 300+ 或每日連續觸發「AI 服務今日免費額度已用完」警告
- 解法：
  1. 短期：擴充 key 到 7 把（免費）
  2. 中期：升級 Gemini 付費方案（~$0.008 / analysis，月 1,000 分析 ≈ $240/月）

---

## 8. 未來計費規劃（預留）

當需要加入付費方案時，修改以下位置：

```typescript
// src/lib/storage.ts
export const canAnalyze = (currentUser: any): boolean => {
  if (!currentUser) { /* 試用邏輯，維持不變 */ }
  
  // 未來在此加入 Pro 判斷
  // if (currentUser.isPro) return true;
  // return getDailyRemaining(currentUser.id) > 0;
  
  return true; // 初期開放
};
```

計費整合建議：Stripe + Supabase（用 `users` 資料表存方案狀態）。

---

## 9. 版本控制注意事項

### `.gitignore` 規則（2026-04 強化）
```
# 個人交接筆記（絕不進版本控制）
_handoff/
*.txt
```

### commit 前檢查清單
- `git status -uall` **禁用**（大型 repo 可能 OOM）
- 避免 `git add -A`，逐檔加入更安全
- 切勿 commit `.env`、`.env.local`、`_handoff/*`、`*.txt`
- commit email 需與 GitHub 帳號相符，否則 Vercel block 部署

### 常見誤 commit 復原
```bash
# 將檔案從版本控制移除但保留本機
git rm --cached <file>
git rm --cached -r <folder>
```
