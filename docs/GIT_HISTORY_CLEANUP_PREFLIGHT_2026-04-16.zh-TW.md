# Git History Cleanup Preflight

> 日期：2026-04-16
> 狀態：preflight only
> 關聯文件：[GIT_HISTORY_CLEANUP_PLAN_2026-04-16.zh-TW.md](./GIT_HISTORY_CLEANUP_PLAN_2026-04-16.zh-TW.md)

## 1. 目的

本文件記錄 2026-04-16 對 history cleanup 的實際 preflight 結果。

重點不是執行 `git filter-repo`，而是先確認：

1. 是否真的存在需要改寫歷史的 bookmark export path
2. remote / branch 形狀是否允許安全執行 rewrite
3. 本機是否具備 `git filter-repo` 執行條件

## 2. 執行環境

- repo：`Q:\Projects\Falcon-Player-Enhance`
- branch：`main`
- 當次 preflight 開始時 worktree：乾淨

## 3. 檢查結果

### 3.1 Worktree / branch

執行：

```powershell
git status --short --branch
```

結果：

```text
## main...origin/main [ahead 3]
```

解讀：

- worktree 乾淨
- 本地 `main` 尚未推回遠端

### 3.2 Remotes

執行：

```powershell
git remote -v
```

結果：

- `origin`
- `origin-suspended`

解讀：

- 不是單 remote repo
- 若未來真的要做 history rewrite，必須同時規劃兩個 remote 的同步策略，不能只考慮 `origin`

### 3.3 Branch inventory

執行：

```powershell
git branch -a
```

結果摘要：

- local branches:
  - `main`
  - `feature/new-task`
  - `pure-ai-version`
  - `chore/commit-cleanup-20260327`
  - `chore/phase5-safe-start-20260402`
  - `chore/subagent-review-20260328`
- remote branches:
  - `origin/*`
  - `origin-suspended/*`

解讀：

- branch 面不算大，但已不是單分支 repo
- rewrite 若發生，需先定義哪些 refs 要保留、哪些 refs 可以忽略

### 3.4 Tags

執行：

```powershell
git tag
```

結果：

- 無 tags 輸出

解讀：

- 目前沒有 tag rewrite 的額外負擔

### 3.5 Bookmark export path 是否真的進過 Git 歷史

執行：

```powershell
git log --oneline --all -- "tests/bookmarks_2026_3_13.html"
git log --oneline --all -- "tests/bookmarks_2026_3_13.html.bak"
```

結果：

- 兩個命令都沒有輸出

解讀：

- 目前沒有證據顯示這兩個 bookmark export 檔本身曾進入 commit history
- 這代表「直接為了這兩個路徑做 `git filter-repo`」的必要性目前不足

### 3.6 `bookmarks_2026_3_13` 在目前 `HEAD` 的殘留位置

執行：

```powershell
git grep -n "bookmarks_2026_3_13" HEAD
```

結果摘要：

- 命中主要來自：
  - historical reports
  - cleanup planning docs
  - bookmark-derived target metadata

解讀：

- 目前 `HEAD` 的殘留主要是文字脈絡與已清理後的 metadata 記錄
- 不是 active secret file 還留在 tracked path

### 3.7 舊本機絕對路徑在 Git 歷史中的跡象

執行：

```powershell
git log --all -S "C:\\Dev\\Projects" --oneline -- docs SELF-LEARNING.md POLICY-GATE.md README.md
```

結果：

- 無輸出

解讀：

- 沒有直接找到這個字串在目前可見 history 中的變更點
- 至少在這次 preflight 的範圍內，沒有明確證據顯示需要為 `C:\Dev\Projects` 額外做 history rewrite

### 3.8 舊 repo 名稱在 Git 歷史中的跡象

執行：

```powershell
git log --all -S "ad-blocker-player-enhancer" --oneline -- docs tests SELF-LEARNING.md README.md
```

結果摘要：

- 有多個 commit 命中，例如：
  - `12d05af docs: mark historical reports and plan history cleanup`
  - `dc0ea15 docs: scrub historical path and bookmark guidance`
  - `28c5d01 chore: sanitize live-browser fixtures and active branding`
  - 更早的歷史 commit

解讀：

- 舊 repo 名稱確實存在於歷史文字脈絡中
- 但這屬於 branding / migration trace，不是與 bookmark export 同級的敏感資料
- 不建議和第一波敏感檔 purge 混在一起處理

### 3.9 本機工具可用性

執行：

```powershell
git filter-repo --version
```

結果：

```text
git: 'filter-repo' is not a git command. See 'git --help'.
```

解讀：

- 本機目前沒有可直接使用的 `git filter-repo`
- 就算決定要 rewrite，也必須先安裝工具或改用其他受控流程

## 4. 結論

這次 preflight 的核心結論：

1. `tests/bookmarks_2026_3_13.html` 與 `.bak` 看起來沒有進過 Git commit history
2. 目前沒有足夠證據支持「立刻為 bookmark 路徑執行 history rewrite」
3. repo 有兩個 remotes，未來若做 rewrite，推送與協作風險比單 remote 更高
4. 本機目前沒有 `git filter-repo`，因此也不具備立即執行條件

## 5. 建議下一步

目前建議順序：

1. 不執行 history rewrite
2. 持續把 current guidance 與 active artifacts 維持在 repo-safe 狀態
3. 若未來出現公開/交付需求，再先補做：
   - `git filter-repo` 安裝
   - mirror backup
   - remote-by-remote rewrite/push 計畫

## 6. 決策建議

截至 2026-04-16，合理決策是：

- `bookmark export 本身：不需要 rewrite`
- `舊 repo 名稱與歷史審查文字：視為歷史脈絡，除非有品牌治理需求，否則不做 history rewrite`
- `history cleanup：維持 planning-ready，不進入 execution`
