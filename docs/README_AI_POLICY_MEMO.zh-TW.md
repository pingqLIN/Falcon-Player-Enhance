# README AI Policy Memo

> README 改版備忘：下次更新 `README.md` / `README.zh-TW.md` 時，將本段整理進 AI 功能與能力邊界說明。

## 建議加入 README 的說明文字

系統先用既有規則與 heuristic 辨識不同類型的廣告、惡意跳轉、覆蓋層、彈窗與播放器干擾行為；再把目前網站累積到的風險訊號交給 AI 統整，讓 AI 提出尚未被穩定阻擋但疑似符合目標行為的元素、網域或互動模式，作為候選規則或臨時加強策略。

這些建議目前不會直接永久生效，必須經過 Policy Gate，只能先做可逆的 runtime 強化，或留待人工 / 開發期審核後再沉澱成正式規則。

## README 圖示素材

- Mermaid source: `docs/diagrams/ai-policy-flow.mmd`
- Rendered SVG: `docs/diagrams/ai-policy-flow.svg`
- uBOL / Falcon event-flow comparison: `docs/UBOL_FALCON_EVENT_FLOW_COMPARISON.zh-TW.md`
- uBOL / Falcon flow source: `docs/diagrams/ubol-vs-falcon-event-flow.mmd`
- uBOL / Falcon rendered SVG: `docs/diagrams/ubol-vs-falcon-event-flow.svg`

## 說明邊界

- 這不是完全自動永久學習型攔截器。
- AI 的角色是統整風險訊號並提出 advisory / candidate。
- Runtime 只允許經 Policy Gate 核准的可逆強化。
- Durable mutation 仍應留在人工審核或開發期流程。
