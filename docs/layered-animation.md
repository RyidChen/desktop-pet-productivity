# 三套服裝分層待機試作

2026-09-20。使用內建 imagegen，以既有森森圖集為參考，產生六個 RGBA 部件。專案素材：`src/ui/assets/mori-classic-rig.png`。原生成圖保留於本機；使用生成輸出的透明通道，沒有使用本機去背或修改來源圖。

使用固定裁切區域讀取身體、睜眼頭部、閉眼頭部、左耳、右耳、尾巴。Canvas 依序合成尾巴、身體、兩耳、頭部，設定頸部、耳根與尾根旋轉點。維持原角色命中檢查（讀取最終畫布 alpha）與非站立姿勢回退。頭髮仍屬頭部整體，眼球尚未拆分。靜態素材與這版試作造型有輕微差異。

## 最終素材修正提示詞（built-in imagegen）

Edit this sprite-parts atlas. Preserve these exact six drawn parts and their character identity. REMOVE ALL background color, shadow, glow, ambient haze, light halos completely. Every pixel outside the actual part silhouettes must have alpha=0, and inside the drawings opacity=100%. Clean true transparent cutouts only. Arrange into an EXACT 3-column by 2-row grid with equal cells: top row body, open-eye head, closed-eye head; bottom row left ear, right ear, tail. The body must be reduced to fit fully within the top-left cell with wide padding (feet above halfway height of entire canvas). Every part must fit inside its own cell without crossing boundaries. All cells are the same width and height. NO shadows behind parts, NO lighting halos, NO background, NO text. The transparent background must be genuine RGBA alpha, not painted black, gray, white, or checkerboard. Keep all ears, feet, tail outlines.

實際輸出並非等高六格，因此採明確裁切座標，沒有重製圖片。背景 RGB 在部分預覽器看似有光暈，透明通道檢查及實際 Canvas 合成確認周圍像素透明。

## 驗證

`npm test` 39 項通過，新增獨立部位绘製、不同時間動作變化、安靜／減少動態下靜止、閱讀與缺素材回退，以及保留落地／逗玩反應。`node scripts/rig-check.cjs` 使用真實繪圖器確認畫素變化與減少動態固定，並產出 `artifacts/rig-preview.webm` 六秒預覽及 `rig-idle.png`。尚未完成長時間效能驗證；閱讀與其他非站立姿勢仍沿用原圖集。

## 0.7.2 居家服與外出服

使用內建 imagegen，以各服裝圖集左上站立姿勢為參考，生成獨立頸部到腳部的透明身體圖層：`mori-cozy-body.png`、`mori-outing-body.png`。保留生成原圖與 alpha，不做本機去背。共用修正耳根接合後的頭部、雙耳與尾巴，換裝只切換身體。各服裝身體載入失敗時使用該服裝原始完整圖集。

生成要求：只畫頸部至腳，無頭髮、頭、耳及尾巴；正面站立，雙臂自然略向外，雙腳同一基線，完整短頸，真正透明背景。居家服為奶油色月亮上衣、淡紫條紋星星長褲與動物拖鞋；外出服為灰藍開襟衫、象牙白襯衫與磚紅蝴蝶結、焦糖百褶裙、深色褲襪及棕色瑪莉珍鞋。

三套服裝實際 Canvas 合成見 `artifacts/rig-wardrobe.png`，六秒輪流換裝預覽見 `artifacts/rig-preview.webm`。

## 0.7.3 其他姿勢動作

三套服裝的睡覺／休息、閱讀（含眨眼及開心）、伸懶腰、打哈欠、點心及招呼，使用原圖集加 Canvas 連續區帶局部變形。頭部上半部維持同一位移，身體逐步變形到固定腳底；睡眠週期約 6.9 秒，閱讀約 7.9 秒，舒展約 4.1 秒。區帶保留重疊以避免反鋸齒造成細縫。安靜陪伴與減少動態回到完整静態姿勢，站立分層與拖曳流程維持原行為。

這是局部變形動畫，沒有新增獨立手指、手臂關節或睡姿尾巴骨架。測試 scripts/activity-check.cjs 覆蓋三套服裝八種姿勢、減少動態、畫布邊界與透明接縫，並錄製 18 秒預覽。
