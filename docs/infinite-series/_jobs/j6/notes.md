# s11.png

**實際使用的英文提示詞**

1. 生成初稿

   ```text
   Create a single 16:9 landscape concept illustration for an endlessly scrolling animated desktop wallpaper, ideally 1920 × 1080. The scene is a dream corridor made of doors. Use softly realistic Japanese animation background painting, with softly rendered materials, clear light and shadow, clean atmospheric perspective, and the strong forward perspective of a third-person follow camera. The camera looks straight down a continuous walkway from just behind a lone person mid-stride. Show their full body from the back in the lower-left third, approximately 28% of the image height, moving deeper into the passage.
   
   Make four depth layers distinct. Foreground: show the threshold just crossed as two door leaves sliding out toward the opposite edges of the picture, with subtle lateral motion blur on the nearest edges. Keep the top-right quadrant open. Midground: place successive freestanding doorways perpendicular to the same walkway, so the person is clearly walking through one doorway after another. Give the doors distinct colors and materials, including natural wood, translucent paper sliding panels, blue-gray iron, and stained glass. Keep several doors partly open, with subtle glimpses of sunlit coast, snow, and deep blue night, and let each spill its own colored light onto the floor. A few small petals escape one of the nearer ajar midground doors and drift low across its light, a quiet incidental detail. Distance: the passage and floor seams converge on a single clear vanishing point. Doorframes become progressively smaller and fade into the haze, implying the corridor goes on forever. Sky: the corridor is open overhead to a soft, luminous powder-blue dream sky blended with warm gold. A few particles of dust catch the light over the walkway. Leave a broad, low-contrast area of smooth blue sky in the upper-right for a future HUD.
   
   The image should feel gently in motion and expansive. Use the reference's soft rendering and follow-camera composition as the stylistic guide. Depict only this new fantasy setting. No text, logos, UI, or watermarks.
   ```

2. 縮小人物

   ```text
   Make a precise composition refinement to this generated dream-corridor wallpaper. Keep the full landscape framing, receding row of doors, material differences, glimpses of coast, snow and night, golden and powder-blue atmosphere, gentle foreground motion blur, small drifting petals, and calm upper-right sky. Change the scale of the walker: make the entire person, from hair to the soles of their shoes, approximately 28% of the canvas height, about three-quarters of their current height. Place their feet slightly farther along the left side of the walkway and adjust their contact shadow and ground perspective to match the increased distance. Keep the same lone back-facing walker mid-stride in the lower-left third. Restore the floor and background where their previous silhouette was. Retain the 16:9 wide frame, ideally 1920 × 1080, and keep the image free of text, logos, UI, and watermarks.
   ```

3. 微調人物比例

   ```text
   Refine only the walker in this 16:9 dream corridor image. The existing person is slightly too small. Enlarge the person by a modest, precise factor of 1.25 and bring them slightly toward the camera on the same left-hand walking line. For this 1672 by 941 canvas, use an approximate silhouette rectangle from x=390 to x=500 and y=515 to y=770. The hair should be around y=515 and the bottom of the visible shoes around y=770, for a full-body silhouette about 255 pixels tall, just over a quarter of the frame height. Preserve the person's identity, back-facing pose, forward stride, clothing, and softly realistic anime rendering. Blend the feet and their shadow into the stone floor. Preserve the rest of the image, including the motion blur on the foreground doors, the receding doors, the blue sky reserved in the upper-right, the colored light and world glimpses, and the few airborne petals. Keep the wide 16:9 composition and avoid text, logos, UI, and watermarks.
   ```

**做成即時 3D 桌布的難點**　在持續回收與生成門框時，要讓滑門動畫、門後場景的遮擋和各世界投在地面的光色在跟拍鏡頭中自然銜接，避免穿門瞬間跳畫或閃光。
