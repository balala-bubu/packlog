// 示範卡包:第一次打開、還沒有任何卡包時,可以一鍵載入來試完整流程。
// 照片是用 canvas 畫的簡單插畫(沒有外部圖檔),卡包名稱與配色各不相同。
import * as store from './store.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// 一張 640x640 的小插畫:天空漸層 + 太陽/月亮 + 幾層山丘,顏色由 hue 決定
function photo(seed, hue, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 640;
  const g = c.getContext('2d');
  const R = rng(seed * 7919 + 13);
  const sky = g.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, `hsl(${hue} 80% 78%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360} 85% 90%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, 640, 640);
  // 太陽 / 月亮 / 氣球
  g.fillStyle = `hsl(${(hue + 180) % 360} 90% 96%)`;
  g.beginPath();
  g.arc(120 + R() * 400, 120 + R() * 110, 54 + R() * 26, 0, TAU);
  g.fill();
  if (kind === 'dots') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `hsla(${(hue + R() * 120) % 360} 90% ${60 + R() * 25}% / .75)`;
      g.beginPath();
      g.arc(R() * 640, R() * 440, 8 + R() * 30, 0, TAU);
      g.fill();
    }
  }
  // 山丘
  for (let l = 0; l < 3; l++) {
    g.fillStyle = `hsl(${(hue + 25 * l + 150) % 360} ${55 - l * 8}% ${72 - l * 14}%)`;
    g.beginPath();
    g.moveTo(0, 640);
    const base = 400 + l * 80;
    for (let x = 0; x <= 640; x += 40) g.lineTo(x, base + Math.sin(x / 90 + seed + l * 2) * 46 + R() * 14);
    g.lineTo(640, 640);
    g.fill();
  }
  // 小房子 / 樹
  if (kind === 'house') {
    g.fillStyle = '#fff';
    g.fillRect(250, 360, 130, 96);
    g.fillStyle = `hsl(${hue} 70% 55%)`;
    g.beginPath();
    g.moveTo(236, 362); g.lineTo(315, 296); g.lineTo(394, 362);
    g.fill();
    g.fillStyle = `hsl(${hue} 40% 30%)`;
    g.fillRect(298, 402, 34, 54);
  }
  const out = document.createElement('canvas');
  out.width = out.height = 640;
  out.getContext('2d').drawImage(c, 0, 0);
  return out.toDataURL('image/jpeg', 0.8);
}

const SETS = [
  {
    name: '週末小事', color: 'blue', sticker: 'daisy', hue: 205, kind: 'house',
    cards: [
      ['在窗邊喝到剛好的咖啡', 'normal'], ['公園裡有人在吹泡泡', 'normal'], ['早餐店阿姨多送了一顆蛋', 'rare'],
      ['雨停了,空氣有青草味', 'normal'], ['終於把書架整理好', 'normal'], ['傍晚的天空是粉橘色', 'super_rare'], ['陪外婆走了一圈市場', 'normal'],
    ],
  },
  {
    name: '和你散步', color: 'pink', sticker: 'heart', hue: 335, kind: 'dots',
    cards: [
      ['你牽著我過馬路', 'normal'], ['一起分一支冰淇淋', 'normal'], ['路邊的貓肯讓我摸了', 'rare'],
      ['走到海邊剛好日落', 'super_rare'], ['你笑到蹲下去', 'normal'], ['半夜的便利商店', 'normal'],
    ],
  },
  {
    name: '今日戰利品', color: 'yellow', sticker: 'star', hue: 48, kind: 'dots',
    cards: [
      ['抽到想要很久的貼紙', 'rare'], ['折價券剛好用得上', 'normal'], ['新買的筆寫起來很順', 'normal'],
      ['同事請了下午茶', 'normal'], ['趕上最後一班車', 'normal'], ['被誇了一句「做得好」', 'rare'],
    ],
  },
];

export function seedDemo() {
  const now = Date.now();
  SETS.forEach((s, si) => {
    const pack = store.addPack({
      name: s.name, color: s.color, sticker: s.sticker, perOpen: 3, fav: si < 2, createdAt: now - si * 1000,
      text: { on: true, value: s.name, size: 0.085, y: 0.34, color: 'light' },
    });
    s.cards.forEach(([caption, rarity], i) => {
      const d = new Date(now - (si * 9 + i * 3 + 1) * 86400000);
      const p2 = (n) => String(n).padStart(2, '0');
      store.addCardTo(pack, {
        photo: photo(si * 20 + i + 1, (s.hue + i * 17) % 360, i % 3 === 0 ? s.kind : i % 3 === 1 ? 'house' : 'dots'),
        caption, rarity, date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
        mood: { v: 0.2 + ((i * 37) % 70) / 100, e: -0.5 + ((i * 53) % 100) / 100 },
        border: { style: i % 4 === 3 ? 'ticket' : 'polaroid', color: '#fffdf8' },
      });
    });
  });
}
