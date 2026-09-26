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

## 0.7.4 專注閱讀分層

舊服裝圖集中閱讀髮絲已有階梯状和破碎邊緣，現改用站立分層圖的清晰頭部與耳朵。內建 imagegen 參考三套既有造型生成 `mori-reading-bodies.png`，保留原始 RGBA，不做本機影像編修；三個等寬區域依序為經典服、居家服與外出服的坐姿捧書身體。生成要求為只有短頸至腳、雙手捧綠書、雙腿彎曲向前、無頭髮／頭／耳／尾巴，透明背景與平滑輪廓。實際輸出為 2170×725。

閱讀使用獨立頭部輕微擺動、呼吸、慢速擺尾及開／閉眼切換，耳根跟隨頭部；採高品質 Canvas 圖像縮放。安靜陪伴與減少動態保留清晰分層造型且停止額外運動。新坐姿圖層無法載入時仍回退舊閱讀圖集。閱讀分層測試：設定 CHECK_READING=1 後執行 node scripts/rig-check.cjs；另可設 SMOKE_PACKAGED=1 驗證可攜版。

## 0.7.5 低頭閱讀表情

新增內建 imagegen 產生的 mori-reading-heads.png：以既有經典頭部為參考，兩格依序為低頭睜眼閱讀與低頭短暫眨眼。要求向下約 20 度、瞳孔看向下方書本、自然閉嘴、兩格一致的髮型輪廓、無耳／身體／尾巴、真正透明背景及平滑邊緣。保留生成原圖，未做本機影像編修。

三套服裝共用閱讀頭部，頭部下移 6 個邏輯像素靠近書本，左右晃動縮小至 0.012 弧度。耳朵維持同一頭部變換群組，先畫耳後畫髮、耳根埋入髮內，閱讀時高度 28、抽動上限 0.05 弧度。閱讀頭部與身體均讀取成功後才啟用分層，否則回退原閱讀圖集。

## 0.8.0 統一其他姿勢（2026-09-25）

三套 mori-{classic,cozy,outing}-activities.png 由內建 imagegen 參考各自服裝生成，3×2 等格依序為睡覺坐姿、伸懶腰、被提起、招呼、捧餅乾、哈欠身體。提示要求完整短頸到鞋子、頭部／頭髮／耳朵／尾巴分離、透明背景、無光暈、衣服與比例一致、各部件留在自身格內。使用原始 RGBA，未做本機影像編修。mori-activity-heads.png 為兩格哈欠／被提起表情，參考原有頭部造型生成，沿用既有耳朵與尾巴。

Canvas 共用分層流程，各服裝缺少動作圖集時回退自身原圖。睡眠沿用安靜閉眼頭部，呼吸較慢、尾巴與耳朵幅度降低。頭身高度於站坐切換用 320 毫秒平滑插值；保留原姿勢身體整體圖層，尚未拆成獨立手臂或手指關節。拖曳沿用抓取位置支點，放下保留落地動作。

## 0.8.1 專注切換修正（2026-09-26）

舊流程先換坐姿身體，再從站姿高度縮小，造成約 45% 的比例變化；眨眼亦會重設過渡時間。現改以站／坐目標獨立計時，420 毫秒平滑移動頭部與耳朵，反向切換從目前位置接續。身體維持站立 94、坐姿 65 的原尺寸，閉眼且頭部接近領口時才切換單一頭身；尾根跟隨當下身體姿勢。沒有重疊臉部淡化或新增素材，閱讀仍保留低頭看書表情。

scripts/transition-check.cjs 以真實 Canvas 檢查三套服裝雙向切換的角色輪廓連通，另檢查經典服的畫布邊界與頭部透明度，並產生逐格合成圖及動畫預覽。這仍是分層關鍵姿勢切換，沒有逐格繪製完整屈膝或拿書動作。

## 0.8.2 補齊站坐關鍵姿勢（2026-09-26）

0.8.1 仍是頭部往下移再換兩張身體，缺少屈膝，使用者指出像角色縮小。現以三套八格新圖集取代待機與閱讀身體：站立、取書、屈膝、半蹲、坐下、坐穩、半開書、閱讀。所有格共用第一格導出的縮放值，頭部固定高 92、耳朵固定高 30，依該格頸部放置；鞋底固定地面，不以頭部穿過上衣模擬蹲下。

每格約 95ms，坐下正播、起身反播，反轉及換裝保留進度。完成專注後先播起身，再交給伸懶腰；站姿活動中開始專注也完整播坐下。拖曳／睡眠立即接管並取消舊進度，靜止模式直接到端點；缺少圖集時保留既有回退。

素材檔案、完整生成提示詞與來源說明見 focus-motion-assets.md。實際動作以八格繪製，不做兩張身體混合或非等比變形；逐格檢查及正常／慢速對照為 artifacts/focus-keyframes.png 與 focus-keyframes.webm。自然程度仍由觀看動作評估，測試只驗證播放及繪製條件。
