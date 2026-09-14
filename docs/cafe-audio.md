# 貓咪咖啡館音樂記錄

使用者於本次對話提供 `Caf-Afternoon-Glow-mixdown-00-00_02-31-1x.wav`，表示長版聽感可以接受，依先前約定處理並接入本機桌寵。

- 原檔維持不變；來源為使用者自行生成的 Stable Audio 音樂。
- 處理版：`src/ui/assets/music/cafe-afternoon-glow.wav`。
- 151 秒、44.1kHz、雙聲道 PCM16。降低約 6.52dB，處理後取樣峰值約 -7.26dBFS。
- 開頭 0.35 秒淡入，結尾 2 秒淡出。保留曲長及編曲，不交疊不同樂句；循環仍有音樂段落收尾，不宣稱無縫接軌。
- 可用 `scripts/prepare-cafe.py` 配合 Python / NumPy 重建；App 播放不需 Python 或外部服務。
- 本輪檢查檔案格式、取樣峰值、頭尾零值與實際解碼播放；聽感依使用者評價，未完成獨立主觀試聽。

此素材供目前本機預覽使用。尚未取得該曲的生成方案、下載授權憑證，公開散布或商業發行前應確認音樂授權。

## 0.4.2 三首補充曲目

使用者另提供 `書頁之間.mp3`、`深夜小燈.mp3`、`森林散步.mp3`，依對話約定加入曲庫。原始檔逐位元複製至 `assets/music/between-pages.mp3`、`night-lamp.mp3`、`forest-walk.mp3`，沒有重新壓縮。

播放時以 Web Audio 解碼，僅向下調整至整曲 RMS 不高於 0.10、取樣峰值不高於 0.85，再施加開頭 0.35 秒與結尾 2 秒淡化。這是取樣音量處理，並非 LUFS 響度等化；保留曲長、編曲及段落收尾，不宣稱無縫循環。沿用上述本機預覽與授權限制。客觀音訊驗證見 `artifacts/music-results.json` 及 `packaged-music-results.json`。

## 0.4.5 三首新風格

2026-09-13 使用者提供 `微光車站.mp3`、`海鹽假日.mp3`、`月下庭院.mp3`。原始 MP3 不重新壓縮，分別複製至 `assets/music/glow-station.mp3`、`seaside-holiday.mp3`、`moonlit-garden.mp3`，沿用上述播放時音量與頭尾處理、本機預覽授權範圍。
