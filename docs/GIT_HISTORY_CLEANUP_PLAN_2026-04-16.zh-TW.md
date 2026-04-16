# Git History Cleanup Plan

> 日期：2026-04-16
> 狀態：planning only
> 目的：規劃如何安全清理歷史中的敏感 bookmark export 痕跡與舊本機路徑參照，不在本文件中直接執行歷史改寫。

## 1. 目標

- 在需要對外分享、公開、移交或鏡像此 repo 之前，先評估是否要清理歷史中的敏感檔案與 machine-local path。
- 將 active flow 與 historical cleanup 分開處理：
  - active flow 已改為使用 repo-safe sample / repo-relative metadata
  - history rewrite 屬高風險獨立作業，需明確備份、驗證與對外同步

## 2. 建議清理範圍

優先候選：

1. `tests/bookmarks_2026_3_13.html`
2. `tests/bookmarks_2026_3_13.html.bak`

次要候選：

1. 舊文件中明確暴露個人機器資訊的絕對路徑
2. 若曾存在於歷史中的個人化暫存或 backup 檔

不建議納入第一波 rewrite 的項目：

1. 單純 historical report 中的品牌名稱 `Shield Pro`
2. 一般設計/架構審查文字
3. 已改為 repo-relative 的 current docs

原因：

- 第一波應只碰「敏感資訊」與「明確不該永久留在歷史中的本機痕跡」。
- 品牌名稱與歷史審查文字不構成同級風險，不值得在同一波 history rewrite 內增加變數。

## 3. 風險

`git filter-repo` 會改寫 commit history，風險包括：

1. 所有 commit SHA 改變
2. 已存在的 clone / fork / PR 需要重新同步
3. 若 remote 已被其他人使用，force-push 會影響他人工作樹
4. 若漏掉 tag / branch / mirror，同一敏感內容可能從其他 ref 再度出現

因此只有在以下情境才建議執行：

1. repo 準備公開
2. repo 準備交付外部
3. 有明確的資料治理或法務要求

## 4. 執行前檢查

在真正執行前，先做：

1. 確認 worktree 乾淨
2. 確認沒有進行中的 PR、rebase、merge、cherry-pick
3. 建立完整 mirror backup
4. 列出所有需要保留的 branch / tag
5. 確認是否只有 `origin`，還是有其他 remotes

建議命令：

```powershell
git status --short --branch
git remote -v
git branch -a
git tag
git log --oneline --all -- "tests/bookmarks_2026_3_13.html"
git log --oneline --all -- "tests/bookmarks_2026_3_13.html.bak"
```

## 5. 備份策略

先做 mirror backup，不要只靠一般 clone：

```powershell
git clone --mirror . ..\\Falcon-Player-Enhance.mirror-backup.git
```

如果 repo 已有遠端，建議再做一份 bundle：

```powershell
git bundle create ..\\Falcon-Player-Enhance-pre-filter.bundle --all
```

## 6. 建議執行方式

若只移除兩個 bookmark export 路徑，可用：

```powershell
git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths
git filter-repo --path tests/bookmarks_2026_3_13.html.bak --invert-paths
```

更穩定的做法是一次處理完整清單，避免多次重寫：

```powershell
git filter-repo ^
  --path tests/bookmarks_2026_3_13.html ^
  --path tests/bookmarks_2026_3_13.html.bak ^
  --invert-paths
```

若還要處理 machine-local path，建議另外做文字替換計畫，不要和第一波敏感檔 purge 混在一起，除非你已確認替換規則很小且可驗證。

## 7. 執行後驗證

至少做以下驗證：

1. 路徑在所有 refs 中都不存在
2. gate 與核心回歸可重跑
3. docs/current guidance 仍指向正確路徑
4. remote push 前，確認 branch / tags 狀態合理

建議命令：

```powershell
git log --oneline --all -- "tests/bookmarks_2026_3_13.html"
git log --oneline --all -- "tests/bookmarks_2026_3_13.html.bak"
git grep -n "bookmarks_2026_3_13" HEAD
python tests/release-gate/run_phase5_acceptance_gate.py --headless
```

## 8. 推送策略

若 rewrite 後要更新遠端：

1. 先通知所有使用者 SHA 將改變
2. 使用 `--force-with-lease`，不要裸 `--force`
3. branch 與 tags 分開確認

範例：

```powershell
git push --force-with-lease origin main
git push --force-with-lease --tags
```

## 9. 回滾策略

若 rewrite 後發現問題：

1. 停止推送更多 refs
2. 用 mirror backup 或 bundle 還原
3. 重新檢查清理清單，不要直接在壞狀態上疊第二輪 rewrite

## 10. 建議決策

目前建議：

1. 短期內不要直接執行 `git filter-repo`
2. 先維持 active flow 已清理、worktree 乾淨、release gate 可重跑的狀態
3. 等到出現「公開 repo / 對外交付 / 合規要求」其中之一，再正式執行 history rewrite

## 11. 完成定義

這份計畫完成，不代表歷史已清理。

真正完成 history cleanup 的定義應是：

1. rewrite 已在備份存在的前提下完成
2. 敏感路徑無法再從任何 refs 找到
3. 最新 `HEAD` gate clean pass
4. collaborators 已收到同步指引
