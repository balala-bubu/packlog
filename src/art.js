// 所有圖都用 canvas 程式繪製,不用外部圖庫。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { nearestMood, moodColor } from './mood.js';

const TAU = Math.PI * 2;
const FONT_SANS = '"Huninn","jf-openhuninn-2.0","ui-rounded","Hiragino Maru Gothic ProN","Yuanti TC","Yuanti SC","Zen Maru Gothic","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif';
const FONT_HAND = '"Huninn","jf-openhuninn-2.0","ui-rounded","Hiragino Maru Gothic ProN","Yuanti TC","Yuanti SC","Zen Maru Gothic","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif';
const FONT_MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};


export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const lum = (h) => { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
// k>0 往白、k<0 往黑
export function shade(hex, k) {
  const t = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  const [r, g, b] = hexRgb(hex).map((x) => Math.round(x + (t - x) * a));
  return `rgb(${r},${g},${b})`;
}

/* ---------- 基本貼紙元素 ---------- */
export function drawStar(g, cx, cy, r, rot = 0, fill = '#ffd45e') {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 ? r * 0.5 : r;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = fill;
  g.lineJoin = 'round';
  g.lineWidth = r * 0.18;
  g.strokeStyle = fill;
  g.stroke();
  g.fill();
}

export function drawRainbow(g, cx, cy, r, lw) {
  const cols = ['#ff8f9d', '#ffc078', '#ffe587', '#8fdba5', '#86c2ff'];
  cols.forEach((c, i) => {
    g.beginPath();
    g.arc(cx, cy, r - i * lw, Math.PI, TAU);
    g.strokeStyle = c;
    g.lineWidth = lw + 1;
    g.stroke();
  });
  g.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    const x = cx + sx * (r - (cols.length * lw) / 2);
    for (const [dx, dy, rad] of [[0, 0, lw * 1.1], [sx * lw * 0.9, 3, lw * 0.85], [-sx * lw * 0.5, 4, lw * 0.75]]) {
      g.beginPath();
      g.arc(x + dx, cy + dy, rad, 0, TAU);
      g.fill();
    }
  }
}

export function drawCat(g, cx, cy, s) {
  const ink = '#5a4636';
  g.lineJoin = 'round';
  g.lineWidth = s * 0.07;
  g.strokeStyle = ink;
  g.fillStyle = '#fffaf0';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sx * s * 0.62, cy - s * 0.12);
    g.lineTo(cx + sx * s * 0.5, cy - s * 0.82);
    g.lineTo(cx + sx * s * 0.08, cy - s * 0.5);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.ellipse(cx, cy, s * 0.72, s * 0.6, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = ink;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sx * s * 0.3, cy - s * 0.05, s * 0.06, s * 0.09, 0, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#ff9fae';
  g.beginPath();
  g.ellipse(cx, cy + s * 0.12, s * 0.07, s * 0.05, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 0.45;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sx * s * 0.45, cy + s * 0.14, s * 0.1, s * 0.065, 0, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.moveTo(cx - s * 0.08, cy + s * 0.2);
  g.quadraticCurveTo(cx, cy + s * 0.27, cx, cy + s * 0.2);
  g.quadraticCurveTo(cx, cy + s * 0.27, cx + s * 0.08, cy + s * 0.2);
  g.stroke();
}

export function drawWashi(g, x, y, w, h, rot, color) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = 0.78;
  g.fillStyle = color;
  g.beginPath();
  const z = 4;
  g.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= h; i += z * 2) g.lineTo(-w / 2 + (i % (z * 4) ? 0 : 3), -h / 2 + i);
  g.lineTo(-w / 2, h / 2);
  g.lineTo(w / 2, h / 2);
  for (let i = h; i >= 0; i -= z * 2) g.lineTo(w / 2 - (i % (z * 4) ? 0 : 3), -h / 2 + i);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.35;
  g.fillStyle = '#fff';
  for (let i = -w / 2 + 8; i < w / 2; i += 16) g.fillRect(i, -h / 2, 6, h);
  g.restore();
}

// 貼紙化:白色描邊 + 柔和陰影(紙雕質感)
export function stickerize(src, outline = 9, pad = 30) {
  const w = src.width + pad * 2;
  const h = src.height + pad * 2;
  const [sil, sg] = makeCanvas(src.width, src.height);
  sg.drawImage(src, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#fffdf8';
  sg.fillRect(0, 0, src.width, src.height);
  const [out, g] = makeCanvas(w, h);
  g.shadowColor = 'rgba(70,50,35,.32)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 7;
  g.drawImage(sil, pad, pad);
  g.shadowColor = 'transparent';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    g.drawImage(sil, pad + Math.cos(a) * outline, pad + Math.sin(a) * outline);
  }
  g.drawImage(src, pad, pad);
  return out;
}

export function stickerCanvas(kind) {
  const [c, g] = makeCanvas(260, 260);
  if (kind === 'star') drawStar(g, 130, 134, 105, 0.18, '#ffd45e');
  else if (kind === 'sparkle') drawStar(g, 130, 130, 90, 0, '#fff2b0');
  else if (kind === 'rainbow') drawRainbow(g, 130, 170, 112, 22);
  else if (kind === 'cat') drawCat(g, 130, 140, 105);
  return stickerize(c);
}


/* ---------- 可選貼紙(卡包正面用),先畫在離屏 canvas 再貼上,方便做鏤空 ---------- */
const stickerCache = new Map();
function buildSticker(key, size) {
  const [c, g] = makeCanvas(size, size);
  const cx = size / 2, cy = size / 2, s = size * 0.9;
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(40,40,60,.22)';
  g.shadowBlur = size * 0.04;
  g.shadowOffsetY = size * 0.025;
  const shine = (x, y, rx, ry, rot = -0.6) => {
    g.save();
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, TAU);
    g.fill();
    g.restore();
  };
  if (key === 'daisy') drawFlower(g, cx, cy, s * 0.38);
  else if (key === 'star') {
    drawStar(g, cx, cy + s * 0.02, s * 0.46, 0.08, '#ffd45e');
    shine(cx - s * 0.1, cy - s * 0.12, s * 0.07, s * 0.04);
  } else if (key === 'heart') {
    g.beginPath();
    g.moveTo(cx, cy + s * 0.36);
    g.bezierCurveTo(cx + s * 0.6, cy + s * 0.02, cx + s * 0.42, cy - s * 0.4, cx, cy - s * 0.12);
    g.bezierCurveTo(cx - s * 0.42, cy - s * 0.4, cx - s * 0.6, cy + s * 0.02, cx, cy + s * 0.36);
    const gr = g.createRadialGradient(cx - s * 0.12, cy - s * 0.1, 0, cx, cy, s * 0.5);
    gr.addColorStop(0, '#ff9db4');
    gr.addColorStop(1, '#ff5c80');
    g.fillStyle = gr;
    g.fill();
    shine(cx - s * 0.2, cy - s * 0.14, s * 0.09, s * 0.05);
  } else if (key === 'cloud') {
    g.fillStyle = '#eaf3ff';
    for (const [dx, dy, r] of [[-0.22, 0.06, 0.2], [0.02, -0.08, 0.26], [0.26, 0.06, 0.2], [0, 0.1, 0.24]]) {
      g.beginPath();
      g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU);
      g.fill();
    }
    shine(cx - s * 0.05, cy - s * 0.16, s * 0.1, s * 0.05);
  } else if (key === 'rainbow') drawRainbow(g, cx, cy + s * 0.2, s * 0.46, s * 0.09);
  else if (key === 'cat') drawCat(g, cx, cy + s * 0.04, s * 0.5);
  else if (key === 'moon') {
    g.fillStyle = '#ffd45e';
    g.beginPath();
    g.arc(cx, cy, s * 0.4, 0, TAU);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.shadowColor = 'transparent';
    g.beginPath();
    g.arc(cx + s * 0.2, cy - s * 0.1, s * 0.34, 0, TAU);
    g.fill();
    g.restore();
  } else if (key === 'clover') {
    g.fillStyle = '#5fc380';
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.arc(cx + dx * s * 0.14, cy + dy * s * 0.14 - s * 0.04, s * 0.17, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#4aa76a';
    g.lineWidth = s * 0.05;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, cy + s * 0.05);
    g.quadraticCurveTo(cx + s * 0.04, cy + s * 0.25, cx + s * 0.16, cy + s * 0.36);
    g.stroke();
    shine(cx - s * 0.2, cy - s * 0.2, s * 0.06, s * 0.035);
  } else if (key === 'cherry') {
    g.strokeStyle = '#4aa76a';
    g.lineWidth = s * 0.035;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - s * 0.17, cy + s * 0.12);
    g.quadraticCurveTo(cx - s * 0.05, cy - s * 0.2, cx + s * 0.1, cy - s * 0.34);
    g.moveTo(cx + s * 0.2, cy + s * 0.14);
    g.quadraticCurveTo(cx + s * 0.18, cy - s * 0.15, cx + s * 0.1, cy - s * 0.34);
    g.stroke();
    g.fillStyle = '#5fc380';
    g.beginPath();
    g.ellipse(cx + s * 0.22, cy - s * 0.32, s * 0.12, s * 0.05, -0.3, 0, TAU);
    g.fill();
    for (const [dx, dy] of [[-0.17, 0.2], [0.2, 0.22]]) {
      const gr = g.createRadialGradient(cx + dx * s - s * 0.05, cy + dy * s - s * 0.05, 0, cx + dx * s, cy + dy * s, s * 0.2);
      gr.addColorStop(0, '#ff7a8c');
      gr.addColorStop(1, '#e03a58');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx + dx * s, cy + dy * s, s * 0.18, 0, TAU);
      g.fill();
      shine(cx + dx * s - s * 0.06, cy + dy * s - s * 0.07, s * 0.045, s * 0.025);
    }
  }
  return c;
}
export function drawSticker(g, key, cx, cy, size) {
  if (key === 'none') return;
  const id = `${key}@${Math.round(size)}`;
  if (!stickerCache.has(id)) stickerCache.set(id, buildSticker(key, Math.round(size * 1.25)));
  const c = stickerCache.get(id);
  g.drawImage(c, cx - c.width / 2, cy - c.height / 2);
}
export function clearStickerCache() { stickerCache.clear(); }

/* ---------- 背景:卡店的牆 / 開卡的書桌(都用程式畫,沒有外部圖檔) ---------- */
function grain(g, w, h, a, seed) {
  const R = rng(seed);
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = `rgba(0,0,0,${R() * a})`;
    g.fillRect(R() * w, R() * h, 1.5, 1.5);
  }
}

export function drawShopWall(canvas, w, h, dpr) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#d9dad8');
  bg.addColorStop(1, '#eceeed');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // 從上方打下來的一道柔光,卡包下面才有立體感
  const lg = g.createRadialGradient(w / 2, h * 0.12, 0, w / 2, h * 0.12, Math.max(w, h) * 0.8);
  lg.addColorStop(0, 'rgba(255,255,255,.55)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  // 踢腳線,讓牆有一個「地」
  const fy = h * 0.9;
  g.fillStyle = 'rgba(0,0,0,.05)';
  g.fillRect(0, fy, w, h - fy);
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.fillRect(0, fy, w, 1);
  grain(g, w, h, 0.05, 11);
}

// 書桌(從正上方看):淺色木桌面 + 深灰桌墊 + 鉛筆 / 筆記本一角。簡單、安靜,桌墊讓卡片和卡包顏色浮出來。
export function drawDesk(canvas, w, h, dpr) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const R = rng(5);
  g.fillStyle = '#c9ad8a';
  g.fillRect(0, 0, w, h);
  // 木紋:很多條橫向的細線,粗細濃淡略有不同
  for (let y = 0; y < h; y += 2) {
    const a = 0.035 + R() * 0.05;
    g.fillStyle = R() > 0.5 ? `rgba(90,60,30,${a})` : `rgba(255,240,210,${a * 0.8})`;
    g.fillRect(0, y, w, 1 + R() * 1.5);
  }
  for (let i = 0; i < 26; i++) {
    const y = R() * h, len = 120 + R() * 320, x = R() * w;
    g.strokeStyle = `rgba(80,52,26,${0.05 + R() * 0.06})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + len * 0.3, y + R() * 6 - 3, x + len * 0.7, y + R() * 6 - 3, x + len, y + R() * 4 - 2);
    g.stroke();
  }
  // 桌墊
  const small = w < 600;
  const mw = Math.min(w * 0.96, 1180), mh = h * (small ? 0.8 : 0.84);
  const mx = (w - mw) / 2, my = (h - mh) / 2 + h * 0.01;
  g.save();
  g.shadowColor = 'rgba(40,24,10,.4)';
  g.shadowBlur = 26;
  g.shadowOffsetY = 8;
  g.fillStyle = '#2d2f33';
  rr(g, mx, my, mw, mh, 22);
  g.fill();
  g.restore();
  const mg = g.createLinearGradient(0, my, 0, my + mh);
  mg.addColorStop(0, '#3a3c41');
  mg.addColorStop(1, '#2a2c30');
  g.fillStyle = mg;
  rr(g, mx, my, mw, mh, 22);
  g.fill();
  g.save();
  rr(g, mx, my, mw, mh, 22);
  g.clip();
  grain(g, w, h, 0.22, 3);
  g.restore();
  g.setLineDash([7, 6]);
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.lineWidth = 1.2;
  rr(g, mx + 9, my + 9, mw - 18, mh - 18, 15);
  g.stroke();
  g.setLineDash([]);
  // 桌面小物:鉛筆(右下,壓在桌墊邊緣外)
  g.save();
  g.translate(w - (small ? 26 : 90), h - (small ? 40 : 56));
  g.rotate(-1.18);
  const L = small ? 150 : 220;
  g.shadowColor = 'rgba(40,24,10,.35)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 3;
  g.fillStyle = '#e7d28a';
  g.fillRect(-L / 2, -6, L, 12);
  g.shadowColor = 'transparent';
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.fillRect(-L / 2, 1, L, 5);
  g.fillStyle = '#e6c9a2';
  g.beginPath(); g.moveTo(L / 2, -6); g.lineTo(L / 2 + 20, 0); g.lineTo(L / 2, 6); g.fill();
  g.fillStyle = '#3a3a3c';
  g.beginPath(); g.moveTo(L / 2 + 13, -2.2); g.lineTo(L / 2 + 20, 0); g.lineTo(L / 2 + 13, 2.2); g.fill();
  g.fillStyle = '#c8706b';
  g.fillRect(-L / 2 - 14, -6, 14, 12);
  g.fillStyle = '#b9bcc0';
  g.fillRect(-L / 2 - 2, -6, 3, 12);
  g.restore();
  // 左上:筆記本一角
  g.save();
  g.translate(small ? -34 : 26, small ? 36 : 40);
  g.rotate(-0.1);
  g.shadowColor = 'rgba(40,24,10,.35)';
  g.shadowBlur = 12;
  g.shadowOffsetY = 4;
  g.fillStyle = '#e9e6df';
  rr(g, -80, -60, 150, 110, 4);
  g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(70,90,130,.2)';
  g.lineWidth = 1;
  for (let y = -30; y < 50; y += 14) { g.beginPath(); g.moveTo(-70, y); g.lineTo(60, y); g.stroke(); }
  g.restore();
  // 角落暗角,視線集中到桌墊
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(30,18,6,.28)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

/* ---------- 沒選照片時的中性底圖 ---------- */
export function blankPhoto() {
  const [c, g] = makeCanvas(640, 640);
  g.fillStyle = '#dedfe0';
  g.fillRect(0, 0, 640, 640);
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.lineWidth = 6;
  rr(g, 250, 270, 140, 100, 14);
  g.stroke();
  g.beginPath();
  g.arc(320, 320, 26, 0, TAU);
  g.stroke();
  return c;
}

export const CARD_PX = { w: 640, h: 900 };

// 三種照片邊框(參考你的 Day Pocket):拍立得 / 郵票 / 票根。版面不同,所以集中在這裡。
export function layoutFor(style) {
  if (style === 'ticket') return { photo: { x: 44, y: 44, w: 552, h: 400, r: 12 }, rowY: 500, capY: 620, lines: 3 };
  return { photo: { x: 40, y: 40, w: 560, h: 560, r: 18 }, rowY: 640, capY: 748, lines: 2 };
}

function wrapLines(g, text, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const ch of text) {
    if (g.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

function drawGradeBadge(g, x, y, grade, rarity) {
  g.save();
  g.font = `800 italic 38px ${FONT_SANS}`;
  const tw = g.measureText(grade).width;
  const w = tw + 44;
  const h = 56;
  g.shadowColor = 'rgba(60,40,20,.28)';
  g.shadowBlur = 12;
  g.shadowOffsetY = 4;
  rr(g, x, y, w, h, h / 2);
  if (rarity === 'super_rare') {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#fff1a8');
    gr.addColorStop(0.5, '#ffc84a');
    gr.addColorStop(1, '#f29a2e');
    g.fillStyle = gr;
  } else if (rarity === 'rare') {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#ffd5e8');
    gr.addColorStop(1, '#c9bcff');
    g.fillStyle = gr;
  } else g.fillStyle = 'rgba(255,253,248,.92)';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 3;
  g.strokeStyle = rarity === 'normal' ? 'rgba(74,59,50,.18)' : 'rgba(255,255,255,.85)';
  g.stroke();
  g.fillStyle = rarity === 'super_rare' ? '#6a3f10' : rarity === 'rare' ? '#5b3f86' : '#7a685a';
  g.textBaseline = 'middle';
  g.fillText(grade, x + 22, y + h / 2 + 2);
  g.restore();
}

const darken = (rgb, k) => `rgb(${rgb.match(/\d+/g).map((x) => Math.round(Number(x) * k)).join(',')})`;

// 迷你象限圖示:小方塊 + 十字 + 一顆心情色的點
export function drawMoodGlyph(g, x, y, size, mood, dark = false) {
  g.save();
  g.strokeStyle = dark ? 'rgba(255,247,234,.5)' : 'rgba(74,59,50,.32)';
  g.lineWidth = 2;
  rr(g, x, y, size, size, size * 0.24);
  g.stroke();
  g.strokeStyle = dark ? 'rgba(255,247,234,.25)' : 'rgba(74,59,50,.16)';
  g.beginPath();
  g.moveTo(x + size / 2, y + 5);
  g.lineTo(x + size / 2, y + size - 5);
  g.moveTo(x + 5, y + size / 2);
  g.lineTo(x + size - 5, y + size / 2);
  g.stroke();
  const px = x + size / 2 + mood.v * (size / 2 - 9);
  const py = y + size / 2 - mood.e * (size / 2 - 9);
  g.fillStyle = moodColor(mood.v, mood.e);
  g.beginPath();
  g.arc(px, py, size * 0.15, 0, TAU);
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = '#fffdf8';
  g.stroke();
  g.restore();
}

export const DEFAULT_BORDER = { style: 'polaroid', color: '#fffdf8' };

export function drawCardFront(photo, card) {
  const [c, g] = makeCanvas(CARD_PX.w, CARD_PX.h);
  const bd = card.border || DEFAULT_BORDER;
  const L = layoutFor(bd.style);
  const P = L.photo;
  const dark = lum(bd.color) < 0.5; // 深色邊框(綠/紫)上的字要改成淺色
  const ink = dark ? '#fff7ea' : CONFIG.colors.ink;
  const sub = dark ? 'rgba(255,247,234,.78)' : '#8f7a68';

  g.fillStyle = bd.color;
  g.fillRect(0, 0, CARD_PX.w, CARD_PX.h);

  g.save();
  rr(g, P.x, P.y, P.w, P.h, P.r);
  g.clip();
  if (photo) {
    const sw = photo.naturalWidth || photo.width;
    const sh = photo.naturalHeight || photo.height;
    const s = Math.max(P.w / sw, P.h / sh);
    g.drawImage(photo, P.x + (P.w - sw * s) / 2, P.y + (P.h - sh * s) / 2, sw * s, sh * s);
  } else {
    g.fillStyle = '#efe6d8';
    g.fillRect(P.x, P.y, P.w, P.h);
  }
  const vg = g.createLinearGradient(0, P.y, 0, P.y + P.h);
  vg.addColorStop(0, 'rgba(0,0,0,.10)');
  vg.addColorStop(0.25, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.05)');
  g.fillStyle = vg;
  g.fillRect(P.x, P.y, P.w, P.h);
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = dark ? 'rgba(255,255,255,.25)' : 'rgba(74,59,50,.10)';
  rr(g, P.x, P.y, P.w, P.h, P.r);
  g.stroke();

  // 邊框裝飾
  const cream = CONFIG.colors.cream;
  if (bd.style === 'postage') {
    // 郵票:四邊一排半圓缺口(用背景色蓋出齒孔)
    g.fillStyle = cream;
    const r = 13, step = 40;
    for (let x = step / 2; x < CARD_PX.w; x += step) {
      g.beginPath(); g.arc(x, 0, r, 0, TAU); g.fill();
      g.beginPath(); g.arc(x, CARD_PX.h, r, 0, TAU); g.fill();
    }
    for (let y = step / 2; y < CARD_PX.h; y += step) {
      g.beginPath(); g.arc(0, y, r, 0, TAU); g.fill();
      g.beginPath(); g.arc(CARD_PX.w, y, r, 0, TAU); g.fill();
    }
  } else if (bd.style === 'ticket') {
    // 票根:左右各一個缺口 + 一條虛線隔開照片和文字
    const my = P.y + P.h + 24;
    g.fillStyle = cream;
    g.beginPath(); g.arc(0, my, 24, 0, TAU); g.fill();
    g.beginPath(); g.arc(CARD_PX.w, my, 24, 0, TAU); g.fill();
    g.setLineDash([14, 12]);
    g.strokeStyle = dark ? 'rgba(255,247,234,.55)' : 'rgba(74,59,50,.3)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(40, my);
    g.lineTo(CARD_PX.w - 40, my);
    g.stroke();
    g.setLineDash([]);
  }

  // 評級徽章(左上,壓在照片上)
  const rcfg = CONFIG.rarity[card.rarity] || CONFIG.rarity.normal;
  drawGradeBadge(g, P.x + 18, P.y + 18, rcfg.grade, card.rarity);

  // 日期 + 心情
  const rowY = L.rowY;
  g.textBaseline = 'middle';
  g.fillStyle = sub;
  g.font = `600 28px ${FONT_MONO}`;
  g.textAlign = 'left';
  g.fillText(card.date.replace(/-/g, '.'), P.x + 4, rowY + 28);

  const word = nearestMood(card.mood.v, card.mood.e);
  g.font = `800 36px ${FONT_SANS}`;
  const gs = 56;
  const right = P.x + P.w;
  g.textAlign = 'right';
  const mc = moodColor(card.mood.v, card.mood.e);
  g.fillStyle = dark ? mc : darken(mc, 0.78);
  g.fillText(word, right - gs - 14, rowY + 28);
  drawMoodGlyph(g, right - gs, rowY, gs, card.mood, dark);

  // 一句話
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = ink;
  g.font = `500 42px ${FONT_HAND}`;
  const lines = wrapLines(g, card.caption, P.w - 8, L.lines);
  lines.forEach((l, i) => g.fillText(l, P.x + 4, L.capY + i * 58));
  return c;
}

// 卡背:一整塊安靜的卡包同色,細框 + 中央一圈小記號
export function drawCardBack(tint = '#5da4f5') {
  const [c, g] = makeCanvas(CARD_PX.w, CARD_PX.h);
  const gr = g.createLinearGradient(0, 0, CARD_PX.w, CARD_PX.h);
  gr.addColorStop(0, shade(tint, -0.12));
  gr.addColorStop(1, shade(tint, -0.4));
  g.fillStyle = gr;
  g.fillRect(0, 0, CARD_PX.w, CARD_PX.h);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,.55)';
  rr(g, 30, 30, CARD_PX.w - 60, CARD_PX.h - 60, 26);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(320, 450, 92, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath();
  g.arc(320, 450, 11, 0, TAU);
  g.fill();
  return c;
}

export function drawFlower(g, cx, cy, r, petal = '#ffffff') {
  g.save();
  g.shadowColor = 'rgba(40,80,150,.25)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = petal;
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * TAU;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.46, r * 0.34, a, 0, TAU);
    g.fill();
  }
  g.shadowColor = 'transparent';
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.4);
  gr.addColorStop(0, '#ffd45e');
  gr.addColorStop(1, '#ff9f2e');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r * 0.34, 0, TAU);
  g.fill();
  g.restore();
}

// 全息遮罩(依邊框款式,照片區位置不同):透明底 + 照片區純白,
// r/b/a 通道在照片區=1、邊框=0,同時當 iridescence / clearcoat / metalness / specularIntensity 遮罩,邊框維持啞光紙質
export function drawCardMask(style = 'polaroid') {
  const P = layoutFor(style).photo;
  const [c, g] = makeCanvas(CARD_PX.w, CARD_PX.h);
  g.fillStyle = '#fff';
  rr(g, P.x, P.y, P.w, P.h, P.r);
  g.fill();
  return c;
}

// 細閃 normal map:2px 方塊的隨機法線
export function glitterNormal(size = 256) {
  const [c, g] = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const R = rng(9);
  const cell = 2;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const nx = (R() - 0.5) * 1.5;
      const ny = (R() - 0.5) * 1.5;
      const l = Math.hypot(nx, ny, 1);
      const rgb = [(nx / l) * 0.5 + 0.5, (ny / l) * 0.5 + 0.5, (1 / l) * 0.5 + 0.5].map((v) => v * 255);
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const i = ((y + dy) * size + (x + dx)) * 4;
          img.data[i] = rgb[0];
          img.data[i + 1] = rgb[1];
          img.data[i + 2] = rgb[2];
          img.data[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function radialTexture(stops, size = 128) {
  const [c, g] = makeCanvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([t, col]) => gr.addColorStop(t, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ---------- 糖果包貼圖(極簡:純色漸層 + 封口壓紋 + 一條割線) ---------- */
function sealDecor(g, W, H) {
  const sealPx = H * (0.2 / 2.7);
  g.fillStyle = 'rgba(20,30,60,.14)';
  g.fillRect(0, 0, W, sealPx);
  g.fillRect(0, H - sealPx, W, sealPx);
  g.fillStyle = 'rgba(255,255,255,.26)';
  for (let x = 0; x < W; x += 11) {
    g.fillRect(x, 0, 3, sealPx);
    g.fillRect(x, H - sealPx, 3, sealPx);
  }
  return sealPx;
}
// 割線:細細的虛線 + 左端一把小剪刀;只有碰到這一帶才切得下來
function tearLine(g, W, H, tearFrac) {
  const ty = (1 - tearFrac) * H;
  g.setLineDash([14, 12]);
  g.strokeStyle = 'rgba(255,255,255,.72)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(96, ty);
  g.lineTo(W - 40, ty);
  g.stroke();
  g.setLineDash([]);
  g.font = `600 36px ${FONT_SANS}`;
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('✂', 42, ty + 1);
  return ty;
}
function packGradient(g, H, color) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, shade(color, 0.26));
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, shade(color, -0.1));
  return gr;
}

// style = { color(hex 已解析), sticker, cover:{img(HTMLImageElement|null),x,y,scale}, text:{on,value,size,y,color} }
export function drawPackTexture(W, H, tearFrac, color, st = {}) {
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = packGradient(g, H, color);
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.09)';
  g.beginPath();
  g.moveTo(W * 0.12, 0); g.lineTo(W * 0.28, 0); g.lineTo(W * 0.04, H); g.lineTo(-W * 0.12, H);
  g.fill();
  const sealPx = sealDecor(g, W, H);
  const ty = (1 - tearFrac) * H;

  // 封面圖:中心在 (W/2 + x*W, H/2 + y*H),寬 = scale*W;只畫在上下封口之間
  const cv = st.cover;
  if (cv && cv.img) {
    const img = cv.img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const dw = cv.scale * W, dh = (dw * ih) / iw;
    g.save();
    g.beginPath();
    g.rect(0, sealPx, W, H - sealPx * 2);
    g.clip();
    g.drawImage(img, W / 2 + cv.x * W - dw / 2, H / 2 + cv.y * H - dh / 2, dw, dh);
    g.restore();
  } else if (st.sticker && st.sticker !== 'none') {
    drawSticker(g, st.sticker, W / 2, H * 0.55, W * 0.37);
  }
  // 吊孔(小圓孔;卡店裡吊線穿過這裡)
  g.save();
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.beginPath();
  g.ellipse(W / 2, sealPx * 0.5, 16, 11, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 3;
  g.stroke();
  g.restore();
  tearLine(g, W, H, tearFrac);

  const tx = st.text;
  if (tx && tx.on && tx.value) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const px = Math.round(tx.size * H);
    g.font = `800 ${px}px ${FONT_SANS}`;
    const light = tx.color !== 'dark';
    g.fillStyle = light ? '#fff' : '#1f2023';
    g.save();
    if (light) { g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = px * 0.18; g.shadowOffsetY = px * 0.05; }
    // 太長就換成較小字寬,不超出卡包
    let fs = px;
    while (g.measureText(tx.value).width > W * 0.84 && fs > 18) { fs -= 2; g.font = `800 ${fs}px ${FONT_SANS}`; }
    g.fillText(tx.value, W / 2, H / 2 + tx.y * H);
    g.restore();
  }
  void ty;
  return c;
}

// 卡包背面:同款封口與割線,中間一塊淺色標籤(名稱、張數、條碼)
export function drawPackBack(W, H, tearFrac, color, info = {}) {
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = packGradient(g, H, color);
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.09)';
  g.beginPath();
  g.moveTo(W * 0.7, 0); g.lineTo(W * 0.86, 0); g.lineTo(W * 0.62, H); g.lineTo(W * 0.46, H);
  g.fill();
  sealDecor(g, W, H);
  tearLine(g, W, H, tearFrac);
  const lx = W * 0.14, lw = W * 0.72, ly = H * 0.38, lh = H * 0.3;
  g.save();
  g.shadowColor = 'rgba(10,20,50,.28)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 5;
  g.fillStyle = '#f6f6f4';
  rr(g, lx, ly, lw, lh, 22);
  g.fill();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#26272a';
  let fs = 60;
  g.font = `800 ${fs}px ${FONT_SANS}`;
  const name = info.name || '';
  while (g.measureText(name).width > lw * 0.86 && fs > 24) { fs -= 2; g.font = `800 ${fs}px ${FONT_SANS}`; }
  g.fillText(name, W / 2, ly + lh * 0.3);
  g.font = `500 34px ${FONT_SANS}`;
  g.fillStyle = '#777a7f';
  g.fillText(`內含 ${info.n || 3} 張卡片`, W / 2, ly + lh * 0.55);
  g.fillStyle = '#26272a';
  const R = rng(5);
  for (let x = W * 0.34; x < W * 0.66; x += 7) g.fillRect(x, ly + lh * 0.7, R() > 0.5 ? 4 : 2, 44);
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
