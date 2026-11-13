// 心情象限矩陣:橫軸 v = 不愉快(-1) ↔ 愉快(+1),縱軸 e = 低能量(-1) ↔ 高能量(+1)。
// 卡片只存 { v, e },心情字是「離點最近的詞」算出來的,之後想改詞庫不用動資料。
import { CONFIG } from './config.js';

export const MOODS = [
  { k: '雀躍', v: 0.75, e: 0.7 },
  { k: '興奮', v: 0.35, e: 0.92 },
  { k: '滿足', v: 0.82, e: -0.15 },
  { k: '平靜', v: 0.62, e: -0.62 },
  { k: '安心', v: 0.28, e: -0.85 },
  { k: '還好', v: 0.0, e: 0.0 },
  { k: '緊繃', v: -0.35, e: 0.9 },
  { k: '焦躁', v: -0.75, e: 0.65 },
  { k: '疲倦', v: -0.3, e: -0.85 },
  { k: '低落', v: -0.78, e: -0.55 },
];

export const QUADRANTS = {
  TR: '興奮開心',
  BR: '安穩滿足',
  BL: '低落疲憊',
  TL: '焦躁不安',
};

export function nearestMood(v, e) {
  let best = MOODS[0];
  let bd = Infinity;
  for (const m of MOODS) {
    const d = (m.v - v) ** 2 + (m.e - e) ** 2;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best.k;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// 四角雙線性混色
export function moodColor(v, e) {
  const u = (Math.max(-1, Math.min(1, v)) + 1) / 2;
  const w = (Math.max(-1, Math.min(1, e)) + 1) / 2;
  const c = CONFIG.colors;
  const top = mix(hex(c.moodTL), hex(c.moodTR), u);
  const bot = mix(hex(c.moodBL), hex(c.moodBR), u);
  const rgb = mix(bot, top, w).map((x) => Math.round(x));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

export function normalizeMood(m) {
  if (!m || typeof m.v !== 'number' || typeof m.e !== 'number') return { v: 0.5, e: 0.2 };
  return { v: Math.max(-1, Math.min(1, m.v)), e: Math.max(-1, Math.min(1, m.e)) };
}
