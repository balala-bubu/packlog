// 結果頁(DOM):開完的卡一張張蓋上來。1 包 = 一排 3 張;10 包 = 每包一組、整頁可捲動。
// 卡面直接用 art.js 畫的 canvas(跟 3D 卡片同一張圖),SR/SSR 疊一層會跟著手指閃的全息。
import { CONFIG } from './config.js';
import { drawCardFront, blankPhoto } from './art.js';
import { el, buzz } from './ui.js';
import { fontReady } from './fonts.js';

const imgCache = new Map();
const loadImg = (src) => {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    }));
    if (imgCache.size > 120) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(src);
};

const GRADE = (c) => (CONFIG.rarity[c.rarity] || CONFIG.rarity.normal).grade;

function cardCanvas(data, photo, w) {
  const full = drawCardFront(photo || blankPhoto(), data);
  if (!w) return full;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((w * full.height) / full.width);
  c.getContext('2d').drawImage(full, 0, 0, c.width, c.height);
  return c;
}

// 手指在卡上移動 → 傾斜 + 全息高光位置
function tiltable(node, max = 12) {
  const set = (e) => {
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    node.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    node.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    node.classList.add('hot');
  };
  const off = () => {
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.classList.remove('hot');
  };
  node.addEventListener('pointermove', set);
  node.addEventListener('pointerdown', set);
  node.addEventListener('pointerleave', off);
  node.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && off());
  node.addEventListener('pointercancel', off);
}

export function createResults(root, h) {
  const sec = el('section', 'scr results');
  sec.innerHTML = `
    <header class="rhead">
      <h1>開包結果</h1>
      <i class="rule" aria-hidden="true"></i>
      <p class="sum"></p>
    </header>
    <div class="rscroll"></div>
    <footer class="rfoot">
      <button class="btn glass again"><span>再抽一次</span></button>
      <button class="btn solid done"><span>完成</span></button>
    </footer>`;
  const zoom = el('div', 'zoom');
  zoom.hidden = true;
  root.querySelector('.screens').append(sec);
  root.append(zoom);

  const scroll = sec.querySelector('.rscroll');
  const sum = sec.querySelector('.sum');
  const again = sec.querySelector('.again');
  sec.querySelector('.done').onclick = () => h.onDone();
  again.onclick = () => h.onAgain();

  let token = 0;
  const closeZoom = () => { zoom.hidden = true; zoom.innerHTML = ''; };
  zoom.addEventListener('click', closeZoom);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeZoom());

  async function openZoom(data, photo, isNew) {
    zoom.innerHTML = '';
    const wrap = el('div', `zcard ${data.rarity}`);
    const cv = cardCanvas(data, photo, 0);
    wrap.append(cv, el('i', 'holo'), ...(isNew ? [el('em', 'new', 'NEW')] : []));
    zoom.append(wrap);
    zoom.hidden = false;
    tiltable(wrap, 16);
    buzz(8);
  }

  return {
    el: sec,
    // session: { name, count, packs: [{ cards:[card data], flags:[isNew] }] }
    async show(session) {
      const my = ++token;
      await fontReady;
      const all = session.packs.flatMap((p) => p.cards);
      const flags = session.packs.flatMap((p) => p.flags);
      const photos = await Promise.all(all.map((c) => loadImg(c.photo)));
      if (my !== token) return;
      const n = (r) => all.filter((c) => c.rarity === r).length;
      const nNew = flags.filter(Boolean).length;
      const parts = [];
      if (n('super_rare')) parts.push(`<span class="chip ssr">SSR<b>${n('super_rare')}</b></span>`);
      if (n('rare')) parts.push(`<span class="chip sr">SR<b>${n('rare')}</b></span>`);
      if (nNew) parts.push(`<span class="chip nw">NEW<b>${nNew}</b></span>`);
      parts.push(`<span class="chip">共<b>${all.length}</b>張</span>`);
      sum.innerHTML = parts.join('');
      again.querySelector('span').textContent = session.count === 1 ? '再抽 1 包' : `再抽 ${session.count} 包`;

      scroll.innerHTML = '';
      scroll.scrollTop = 0;
      scroll.classList.toggle('one', session.count === 1);
      let k = 0;
      session.packs.forEach((pk, pi) => {
        const group = el('div', `grp${session.count === 1 ? ' single' : ''}`);
        if (session.count > 1) {
          const t = el('h2');
          t.innerHTML = `第 <b>${pi + 1}</b> 包`;
          const top = pk.cards.reduce((m, c) => (c.rarity === 'super_rare' ? 2 : c.rarity === 'rare' ? Math.max(m, 1) : m), 0);
          if (top) t.append(el('em', top === 2 ? 'ssr' : 'sr', top === 2 ? 'SSR' : 'SR'));
          group.append(t);
        }
        const row = el('div', 'cards');
        pk.cards.forEach((c, i) => {
          const fi = k++; // 全部卡片的流水號(同一張卡可能在不同包重複出現,不能用 indexOf)
          const b = el('button', `rc ${c.rarity}`);
          b.style.setProperty('--d', `${Math.min(fi, 14) * 55 + 120}ms`);
          b.setAttribute('aria-label', `${GRADE(c)} ${c.caption || c.date}`);
          const cv = cardCanvas(c, photos[fi], 300);
          b.append(cv, el('i', 'holo'));
          if (pk.flags[i]) b.append(el('em', 'new', 'NEW'));
          tiltable(b, 10);
          b.onclick = () => openZoom(c, photos[fi], pk.flags[i]);
          row.append(b);
        });
        group.append(row);
        scroll.append(group);
      });
      // 稀有卡落下時震一下
      if (n('super_rare')) buzz([20, 40, 20]);
      else if (n('rare')) buzz(14);
    },
    hide() { token++; closeZoom(); scroll.innerHTML = ''; },
    destroy() { sec.remove(); zoom.remove(); },
  };
}
