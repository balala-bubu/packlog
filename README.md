# Packlog

白底黑線 Retro + 液態玻璃 + 彈簧動態的 3D 卡包開箱 WebApp(手機直式)。Three.js + Vite,資料存在瀏覽器 IndexedDB。

流程:首頁(櫥窗/朋友入口/＋) → 卡包選擇(輪播、抽 1 包 / 抽 10 包) → 開包 → 結果頁

    npm install
    npm run dev     # 開發
    npm run build   # 輸出 dist/

- src/main.js 3D 舞台與流程(首頁櫥窗 ↔ 輪播 ↔ 開包 ↔ 結果)
- src/ui.js 首頁 / 選擇 / 開包的 DOM;src/results.js 結果頁
- src/store.js 資料層(最愛 fav、最近 openedAt、NEW seen);之後接 Notion 從這裡換
- src/config.js 手感、時間、顏色參數;src/demo.js 示範卡包
- 朋友的卡包目前只有入口(即將開放)
