# Falcon-Player-Enhance 產品策略：uBOL Companion 路線

> 版本：v1.0
> 更新日期：2026-03-31
> 適用範圍：`extension/` 現行 MV3 架構

## 1. 策略摘要

Falcon-Player-Enhance 的核心定位是 **播放器保護與可用性修復**，不是一般型全站內容阻擋器。

- 與 uBlock Origin Lite (uBOL) 並用時：Falcon 以 `player-centric protection` 為主。
- 無 uBOL 時：Falcon 提供 `Basic Standalone Protection`，僅保留最小必要防護。
- 中長期：以 AI 強化站點判讀與策略自適應，逐步提升偵測覆蓋與執行完成度。

本策略直接回應 repo 現況：`README.md` 已明示建議與 uBOL 並用；`manifest.json` 與現有模組顯示本專案具備 player detection、popup、防導流、overlay/fake-video 清理與 AI runtime 能力。

## 2. 定位邊界（避免重疊原則）

### 2.1 我們要做的事（Differentiated Scope）

- 播放器偵測與主播放器選擇（HTML5/iframe/custom container）
- 無干擾播放器（popup player / side panel / pin / state restore）
- 播放器周邊的 overlay、clickjacking、fake video、trap popup、惡意導流防護
- 播放器操作體驗（快捷鍵、同步、畫質與視覺調整）
- AI 風險評估與站點策略建議（以播放器場景為核心）

### 2.2 我們刻意不做的事（Non-goals）

- 不做 EasyList/EasyPrivacy 類的全面通用阻擋競賽
- 不做大規模 tracker blocking 能力重建
- 不把全頁 cosmetic filtering 當主產品價值
- 不追求與 uBOL 同級的一般型 filter list 生態

## 3. 三層運作模式

## 3.1 Companion Mode（預設）

適用：使用者同時安裝 uBOL。

目標：在不與 uBOL 職責重疊的前提下，提供播放器可靠性與體驗增益。

能力範圍：
- 啟用播放器相關保護與修復能力
- 保留必要 anti-popup / anti-redirect / overlay 清理
- 降低一般型網路阻擋擴張，避免規則衝突與重複

成功指標：
- 播放器誤判率下降
- popup player 成功開啟與回復率提升
- 與 uBOL 並用時不引入顯著相容性回歸

## 3.2 Basic Standalone Protection（無 uBOL 時）

適用：使用者僅安裝 Falcon。

目標：提供最小可用、可自保的基礎防護，不追求全面覆蓋。

能力範圍：
- 高信心 DNR 基礎封鎖（惡意導流、已知高風險域）
- 播放器周邊 overlay / fake video / popup trap 清理
- 基本惡意腳本干預防護（不擴張為通用 content blocker）

成功指標：
- 無 uBOL 情境下仍能有效降低播放器被干擾機率
- 不因過度攔截造成大量誤傷與播放失敗

## 3.3 AI-Expanded Mode（中長期）

適用：啟用 AI provider 且通過 policy gate。

目標：先補播放器場景覆蓋，再逐步擴至更高偵測完成度。

能力範圍：
- 站點風險分級與策略動態調整
- 規則候選生成（先進 review queue，再決定是否升級）
- 對未知站點提供 player-focused 自適應修復

成功指標：
- 站點適配速度提高
- 偵測與處置成功率提升
- 不犧牲可回退性與可審計性

## 3.4 模式切換與控制權

現階段模式切換採明確控制，不依賴自動偵測其他擴充功能是否已安裝。

- 預設值：`Companion Mode`
- `Basic Standalone Protection`：由使用者明確在設定面板切換或由產品指定的 fallback 流程啟用
- `AI-Expanded Mode`：需同時滿足 AI provider 可用、policy gate 通過、且使用者未關閉 AI 模式

治理原則：

- 不以「自動偵測 uBOL 是否存在」作為現階段必要前提
- 任何模式切換都必須可回退、可審計、可在 UI/文件中說明
- 新模式若改變預設攔截面，必須先更新策略文件與開發執行書

## 4. 產品治理與決策規則

## 4.1 功能納入檢核

任何新功能進入實作前，需先通過三個檢核：

1. 是否直接強化播放器保護或體驗。
2. 是否與 uBOL 的一般型阻擋能力高度重疊。
3. 即便無 uBOL，是否仍屬最小必要防護。

若第 1 項為否，或第 2 項為是且第 3 項不成立，則不納入近期 roadmap。

## 4.2 規則升級路徑

- `runtime heuristic / AI candidate` 不直接升級為 baseline blocklist。
- 需經過 review、回歸驗證、風險評估後才可升級。
- Companion Mode 下，優先升級 player-centric 規則，不擴張通用攔截面。

## 4.3 重疊檢核責任點

為避免策略在開發中漂移，重疊檢核責任點固定如下：

- 規劃階段：主控代理 / 維護者先判斷需求是否與 uBOL 高度重疊
- 實作階段：任務執行者需在交付說明中標示本輪變更屬於 Companion、Standalone 或 AI-Expanded 哪一層
- 審查階段：reviewer 必須確認是否有未經批准的一般型 blocker 擴張
- 文件階段：README、roadmap、execution book 必須維持相同產品邊界語言

## 4.4 對外訊息一致性

對外文件與產品描述固定採以下語義：

- Falcon 是 **uBOL 的播放器場景補強層**。
- 無 uBOL 仍有基本防護，但定位不是全面替代。
- AI 強化是覆蓋與完成度增幅器，不是黑箱自動封鎖器。

## 5. 主要風險與緩解

- 風險：功能邊界漂移，重新長成一般型 content blocker。
  - 緩解：新增「重疊檢核」作為 PR/規劃必經 gate。
- 風險：Companion Mode 下仍有規則衝突。
  - 緩解：優先收斂 player-adjacent 規則，降低通用攔截擴張。
- 風險：AI 擴張造成誤判放大。
  - 緩解：維持 policy gate + review queue + 可回退策略。

## 6. 與現有文件關係

- 本文件定義「產品邊界與模式策略」。
- 路線與執行順序由 `ROADMAP_UBOL_COMPANION.zh-TW.md` 與 `DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md` 承接。
