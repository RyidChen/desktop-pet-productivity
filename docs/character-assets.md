# 森森角色素材（0.5.0）

第二次白邊修正：沿用 0.5.1 輪廓，不再侵蝕 alpha。對靠近髮絲外圈、低彩度且偏亮的 RGB 像素做髮色校正，將透明邊緣仍殘留的背景色壓回鄰近暗色範圍；亮度設下限，避免黑色粗邊。閱讀姿勢使用較高的頭部範圍。深淺底全姿勢檢查：artifacts/wardrobe-edge-check-v2.jpg。

0.5.1 白邊修正：清除髮絲外側窄帶的中性亮色背景碎片；輪廓 alpha 內縮一個來源像素後輕微柔化，不模糊角色 RGB。淺色服裝不做髮絲區域的亮色移除。兩套 32 姿勢均以深、淺底檢視，見 artifacts/wardrobe-edge-check.jpg。

2026-09-13。使用內建 imagegen，以原始森森圖集為角色參考。兩套新衣各 16 姿勢；原服裝補 4 個動作。使用者已明確授權本機去背。生成原圖保留不改動。

- src/ui/assets/mori-cozy-atlas.png：奶油居家服，經 scripts/prepare-character.py 移除外部棋盤格並對齊 4×4 格。
- src/ui/assets/mori-outing-atlas.png：午後外出服，同上。
- src/ui/assets/mori-idle-atlas.png：原服裝打呵欠、左右張望、吃點心；直接使用生成的透明 PNG。
- artifacts/character-wardrobe.png：實際繪圖器輸出的站立與閱讀對照。

這些為姿勢圖集搭配程序化呼吸、傾斜、輕跳與落地效果，並非骨架動畫。切衣先完整讀取再交換；失敗時保留目前素材。

## 生成提示詞

### 居家服
Use case: identity-preserve. Production sprite atlas for the exact chibi catgirl Mori in the reference. Preserve her charcoal bob haircut, green eyes, dark cat ears with pink inner ears, dark fluffy tail, head-to-body proportions, delicate anime rendering. Create a complete 4-column by 4-row atlas with exactly 16 isolated full-body sprites, equal-sized cells. No text, no grid lines, no props extending to another cell, no shadows on background. TRANSPARENT BACKGROUND with actual alpha, not checkerboard. Outfit CHANGE: cozy cream and pale dusty lavender long-sleeve pajama set with small moon embroidery, loose modest long pants, soft closed slippers; no hat, ears remain visible. This identical outfit is present in all 16 cells. Keep constant head size, feet centered near each cell bottom, ample separation.
Read cells left to right row by row:
Row1: neutral standing eyes open; same standing blinking eyes closed; delighted standing hands near cheeks smiling; being gently lifted with legs dangling and surprised face (no hand holding her).
Row2: seated reading a green book; seated asleep with closed eyes and hands in lap; standing stretching both arms upward; standing waving one hand.
Row3: identical seated reading but eyes closed blinking; identical seated reading smiling with closed eyes; low crouch holding the same green book between standing and seated; standing sleepy yawn with one hand covering mouth.
Row4: standing looking slightly left; standing looking slightly right; standing curious head tilt with hands behind back; standing nibbling a small round biscuit held in both hands.
Rendering: clean ink edges, gentle watercolor shading, adorable original game sprite, consistent camera and lighting. Whole ear tips and feet included in every cell. Keep the pose motion restrained and recognizable at small desktop size.

### 外出服
Use case: identity-preserve. NEW afternoon outing outfit production sprite atlas for the exact chibi catgirl Mori in the reference. Preserve her charcoal bob haircut, green eyes, dark cat ears with pink inner ears, dark fluffy tail, head-to-body proportions, delicate anime rendering. Create a complete 4-column by 4-row atlas with exactly 16 isolated full-body sprites, equal-sized cells. No text, no grid lines, no props extending to another cell, no shadows on background. TRANSPARENT BACKGROUND with actual alpha, not checkerboard. Outfit CHANGE: a dusty blue long-sleeve cardigan over an ivory blouse with a small terracotta ribbon, a knee-length warm caramel pleated skirt, dark tights and brown rounded Mary Jane shoes; no hat or bag, both ears remain visible. This identical outfit is present in all 16 cells. Keep constant head size, feet centered near each cell bottom, ample separation.
Read cells left to right row by row:
Row1: neutral standing eyes open; same standing blinking eyes closed; delighted standing hands near cheeks smiling; being gently lifted with legs dangling and surprised face (no hand holding her).
Row2: seated reading a green book; seated asleep with closed eyes and hands in lap; standing stretching both arms upward; standing waving one hand.
Row3: identical seated reading but eyes closed blinking; identical seated reading smiling with closed eyes; low crouch holding the same green book between standing and seated; standing sleepy yawn with one hand covering mouth.
Row4: standing looking slightly left; standing looking slightly right; standing curious head tilt with hands behind back; standing nibbling a small round biscuit held in both hands.
Rendering: clean ink edges, gentle watercolor shading, adorable original game sprite, consistent camera and lighting. Whole ear tips and feet included in every cell. Keep the pose motion restrained and recognizable at small desktop size.

### 原服裝補充
Create a production sprite strip with exactly FOUR separate full-body chibi catgirl poses in one horizontal row, evenly spaced in four cells with generous empty margins, genuine transparent background. Match the attached character precisely: charcoal bob hair, green eyes, dark cat ears and tail, original cream blouse and green dress uniform, brown shoes. Poses left to right: standing yawning with one hand covering mouth; standing glancing left; standing glancing right; standing nibbling a small cookie held in both hands. Same head size and rendering style in all four; entire ears, feet and tail inside each cell. No text, no panel borders, no shadows on background, no checkerboard pattern.
