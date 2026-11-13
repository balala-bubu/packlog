// 所有時間(秒)、幅度、顏色、粒子數都集中在這裡。調手感只動這個檔案。
export const CONFIG = {
  dpr: 2, // pixel ratio 上限(chill_hihi 經驗:retina 不需要超過 2)

  // 特效總開關:enabled=false 時所有「裝飾性」特效一起關(震動/發光/閃光/粒子/溶解/掃光/疊層彈出/壓扁)
  fx: {
    enabled: true,
    shake: true,
    glow: true,
    slash: true, // 撕包光痕
    flash: true,
    particles: true,
    dissolve: true,
    sweep: true,
    squash: true,
    layers: true,
  },

  pack: {
    cardsPerPack: 3, // 新卡包的預設張數(每個卡包可自己設 1–5)
    width: 1.9,
    height: 2.7,
    depth: 0.34,
    seal: 0.2, // 上下封口壓紋區高度
    crimpFreq: 62,
    crimpAmp: 0.012,
    tearFrac: 0.83, // 撕裂線位置(從底部算起占整包高度的比例)
    color: '#5da4f5',
    segX: 72,
    segY: 110,
  },

  card: {
    w: 1.2,
    radius: 0.07,
    depth: 0.024,
    flipBump: 0.4, // 翻面途中卡片向鏡頭拱起的量
  },

  timing: {
    shake: 0.9, // 待機震動週期
    glowPulse: 1.6,
    dissolve: 0.75, // 上半包溶解
    capFly: 0.9, // 切下的上緣條帶彈飛
    cardRise: 0.25, // 撕開後多久卡片開始升起
    cardStagger: 0.08,
    packExit: 0.9, // 撕開後多久卡包滑出
    foretell: 1.5, // 撕開後多久稀有卡開始預告顫抖
    sweep: 0.25, // 稀有卡掃光
    flash: 0.22,
  },

  // 彈簧:k 越大越緊,c 越大越不晃。(k=170,c=14 ≈ 阻尼比 0.54,有一點回彈)
  spring: {
    flip: { k: 170, c: 14 },
    move: { k: 150, c: 17 },
    squash: { k: 260, c: 16 },
    tilt: { k: 160, c: 15 },
    tear: { k: 520, c: 34 }, // 跟手要緊,幾乎無回彈
    turn: { k: 130, c: 15 }, // 卡包翻轉
    pop: { k: 220, c: 13 },
    packExit: { k: 60, c: 11 },
  },

  // 卡店:吊掛的一排卡包
  shop: { gap: 2.35, scale: 0.86, rail: 1.95, thread: 0.5, tex: 512 },
  // 果凍感:越小越軟、越晃
  jelly: { k: 150, c: 6.5, turn: 0.022, squashK: 190, squashC: 8 },

  squash: { dip: 1.7 }, // 落地 1 → 0.92 → 1 的速度踢(越大壓越深)

  // 資料裡的 rarity 維持 normal / rare / super_rare 三級(之後 Notion 匯出不用改),
  // 卡面上顯示成 SSR 風格評級。想改成 N/R/SR/SSR 四級,只要在這裡加一級。
  rarity: {
    normal: { grade: 'R', label: '日常', sweep: null, holo: false, layers: 0 },
    rare: { grade: 'SR', label: '難忘', sweep: [1.0, 0.84, 0.95], holo: true, layers: 1 },
    super_rare: { grade: 'SSR', label: '超級特別', sweep: [1.0, 0.7, 0.3], holo: true, layers: 3 }, // 稀有度越高,光越暖
  },

  // 款式選項(參考你的 Day Pocket:卡包顏色 / 貼紙 / 照片邊框)
  style: {
    packColors: { blue: '#5da4f5', pink: '#ee8fab', yellow: '#f4d56c', purple: '#a690e8', orange: '#f2a56e', green: '#80c9a6' },
    stickers: ['none', 'daisy', 'star', 'heart', 'cloud', 'rainbow', 'cat', 'moon', 'clover', 'cherry'],
    borderStyles: { polaroid: '拍立得', postage: '郵票', ticket: '票根' },
    borderColors: ['#fffdf8', '#2f6b52', '#f0a9bd', '#f1d37a', '#8fb4e0', '#7a5a82'],
    defaults: { color: 'blue', sticker: 'none' },
  },

  colors: {
    cream: '#2e3034', // 郵票/票根缺口用的底色 = 書桌墊面的顏色
    ink: '#2a2a2c',
    confetti: ['#ff8f9d', '#ffc078', '#ffe587', '#8fdba5', '#86c2ff', '#c3b0ff', '#ffffff'],
    dust: '#ffd98a',
    edgeGlow: [1.0, 0.78, 0.38], // 溶解邊緣的暖光
    // 心情矩陣四角顏色(愉快×能量)
    moodTL: '#e8808d', // 不愉快 + 高能量
    moodTR: '#ffa066', // 愉快 + 高能量
    moodBL: '#8aa6da', // 不愉快 + 低能量
    moodBR: '#80c9a3', // 愉快 + 低能量
  },

  particles: {
    confetti: 44, // 刻意克制,不要過度花俏
    dust: 22,
  },
};
