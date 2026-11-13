// 資料層:卡包 + 卡片,全部使用者自己上傳。存在 IndexedDB(照片很大,localStorage 放不下);
// 環境不允許 IndexedDB(例如某些沙盒)時退回記憶體,功能照常、只是關掉頁面就不會留下。
//
// pack = {
//   id, name, color, sticker, perOpen(1–5),
//   cover: { img: dataURL|'', x, y, scale },        // 封面圖:中心位置(-0.5..0.5 相對於卡包寬高)與寬度比例
//   text:  { on, value, size, y, color },            // 封面文字:是否顯示、內容、大小、垂直位置、顏色
//   cards: [ { id, date, photo, caption, rarity, share_scope, mood:{v,e}, border:{style,color} } ]
// }
import { CONFIG } from './config.js';
import { normalizeMood } from './mood.js';

const DB = 'daypocket', STORE = 'kv', KEY = 'packs.v2';
const RARITIES = ['normal', 'rare', 'super_rare'];
let packs = [];
let persistent = false;
let saveT = 0;

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function normalizeBorder(b) {
  const style = b && CONFIG.style.borderStyles[b.style] ? b.style : 'polaroid';
  const color = b && hexOk(b.color) ? b.color : CONFIG.style.borderColors[0];
  return { style, color };
}

export function newCard(o = {}) {
  return {
    id: o.id || uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : today(),
    photo: typeof o.photo === 'string' ? o.photo : '',
    caption: String(o.caption || '').slice(0, 40),
    rarity: RARITIES.includes(o.rarity) ? o.rarity : 'normal',
    share_scope: o.share_scope === 'share' ? 'share' : 'private', // 不確定就當私人
    seen: !!o.seen, // 抽到過就不再是 NEW
    mood: normalizeMood(o.mood),
    border: normalizeBorder(o.border),
  };
}

export function newPack(o = {}) {
  const colors = Object.keys(CONFIG.style.packColors);
  const name = String(o.name ?? '新卡包').slice(0, 14);
  const cv = o.cover || {}, tx = o.text || {};
  return {
    id: o.id || uid(),
    name,
    color: CONFIG.style.packColors[o.color] ? o.color : colors[packs.length % colors.length],
    sticker: CONFIG.style.stickers.includes(o.sticker) ? o.sticker : 'none',
    perOpen: Math.round(num(o.perOpen, CONFIG.pack.cardsPerPack, 1, 5)),
    fav: !!o.fav, // 最愛:顯示在首頁櫥窗
    createdAt: num(o.createdAt, Date.now(), 0, 9e15),
    openedAt: num(o.openedAt, 0, 0, 9e15), // 最近開過的時間,「最近」排序用
    cover: { img: typeof cv.img === 'string' ? cv.img : '', x: num(cv.x, 0, -0.6, 0.6), y: num(cv.y, 0, -0.6, 0.6), scale: num(cv.scale, 0.8, 0.2, 2) },
    text: {
      on: tx.on !== undefined ? !!tx.on : true,
      value: String(tx.value ?? name).slice(0, 16),
      size: num(tx.size, 0.09, 0.04, 0.2),
      y: num(tx.y, 0.36, -0.45, 0.45),
      color: tx.color === 'dark' ? 'dark' : 'light',
    },
    cards: Array.isArray(o.cards) ? o.cards.map(newCard) : [],
  };
}

/* ---------- IndexedDB ---------- */
const open = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function idb(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); res(out && out.result); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
  });
}

export async function loadPacks() {
  try {
    const raw = await idb('readonly', (s) => s.get(KEY));
    persistent = true;
    packs = Array.isArray(raw) ? raw.map(newPack) : [];
  } catch (_) {
    persistent = false;
    packs = [];
  }
  // 舊版 localStorage 的示範資料不再沿用
  try { localStorage.removeItem('daypocket.cards.v1'); localStorage.removeItem('daypocket.style.v1'); } catch (_) { /* ignore */ }
  return packs;
}

function flush() {
  if (!persistent) return Promise.resolve();
  return idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(packs)), KEY)).catch(() => { persistent = false; });
}
export function save() {
  clearTimeout(saveT);
  saveT = setTimeout(flush, 250); // 編輯時不用每個動作都寫一次
}
export const isPersistent = () => persistent;

export const getPacks = () => packs;
export const getPack = (id) => packs.find((p) => p.id === id);
export function addPack(o) {
  const p = newPack(o);
  packs.push(p);
  save();
  return p;
}
export const getFavs = () => packs.filter((p) => p.fav);
export const getRecents = () => [...packs].sort((a, b) => Math.max(b.openedAt, b.createdAt) - Math.max(a.openedAt, a.createdAt));
export function toggleFav(pack) {
  pack.fav = !pack.fav;
  save();
  return pack.fav;
}
export function touchOpened(pack) {
  pack.openedAt = Date.now();
  save();
}
// 把這次抽到的卡標成「看過」,回傳每張是不是第一次抽到(NEW)。同一次裡重複的只算第一張。
export function markSeen(cards) {
  const seen = new Set();
  const out = cards.map((c) => {
    const isNew = !c.seen && !seen.has(c.id);
    seen.add(c.id);
    return isNew;
  });
  cards.forEach((c) => { c.seen = true; });
  save();
  return out;
}
const NAME_KEY = 'dynamemo.name';
export const getUserName = () => { try { return localStorage.getItem(NAME_KEY) || '我'; } catch (_) { return '我'; } };
export const setUserName = (v) => { try { localStorage.setItem(NAME_KEY, String(v).trim().slice(0, 8) || '我'); } catch (_) { /* ignore */ } };
export function removePack(id) {
  packs = packs.filter((p) => p.id !== id);
  save();
}
export function addCardTo(pack, o) {
  const c = newCard(o);
  pack.cards.push(c);
  save();
  return c;
}
export function removeCardFrom(pack, id) {
  pack.cards = pack.cards.filter((c) => c.id !== id);
  save();
}

/* ---------- 抽一包 ---------- */
const ORDER = { normal: 0, rare: 1, super_rare: 2 };
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// 從卡包自己的卡裡抽 perOpen 張(不重複);最高稀有度排最後壓軸
export function drawFrom(pack) {
  const n = Math.min(pack.perOpen, pack.cards.length);
  return shuffle([...pack.cards]).slice(0, n).sort((a, b) => ORDER[a.rarity] - ORDER[b.rarity]);
}
export const getSharePool = (list) => list.filter((c) => c.share_scope === 'share'); // private 永遠不進分享包

/* ---------- 照片縮小(上傳時) ---------- */
export function shrinkImage(file, max = 900, q = 0.84) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}
