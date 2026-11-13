// 介面層(DOM):首頁、卡包選擇、開包、提示。編輯器在 editor.js,結果頁在 results.js。
// 畫面分三層:背景(點點紙)→ 3D 畫布(卡包/卡片)→ 這裡的 DOM。玻璃元件疊在最上面。
import { CONFIG } from './config.js';

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/* ---------- 彈簧緩動:把阻尼彈簧的階躍響應取樣成 CSS linear(),按鈕/切換都用同一條 ---------- */
export function springEase(k = 220, c = 17) {
  const pts = [0];
  let x = 0, v = 0, t = 0, calm = 0;
  const dt = 1 / 240;
  while (t < 2.5 && calm < 24) {
    v += (k * (1 - x) - c * v) * dt;
    x += v * dt;
    t += dt;
    if (Math.round(t / dt) % 4 === 0) {
      pts.push(+x.toFixed(4));
      calm = Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02 ? calm + 1 : 0;
    }
  }
  pts.push(1);
  return { css: `linear(${pts.join(', ')})`, ms: Math.round(t * 1000) };
}
function installSprings() {
  if (!(window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)'))) return;
  const s = document.documentElement.style;
  const a = springEase(240, 18); // 按鈕、切換:有一點彈
  const b = springEase(120, 15); // 版面移動:慢、軟
  s.setProperty('--spr', a.css); s.setProperty('--spr-t', `${a.ms}ms`);
  s.setProperty('--spr2', b.css); s.setProperty('--spr2-t', `${b.ms}ms`);
}

/* ---------- 震動回饋(可關) ---------- */
let haptics = true;
export const setHaptics = (v) => { haptics = !!v; };
export const buzz = (p) => { if (haptics && navigator.vibrate) navigator.vibrate(p); };

/* ---------- 圖示(全部黑線條,2.5px 圓頭) ---------- */
const I = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5C5 15.6 3 12.4 3 9.3 3 6.8 4.9 5 7.2 5c1.9 0 3.6 1.1 4.8 3 1.2-1.9 2.9-3 4.8-3C19.1 5 21 6.8 21 9.3c0 3.1-2 6.3-9 11.2Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/></svg>',
  // 兩個並肩的人 + 一張小卡:朋友的卡包
  friends: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="23" cy="21" r="8"/><circle cx="43" cy="23" r="7"/><path d="M9 53c0-9.5 6-16 14-16s14 6.500 14 16"/><path d="M35 40c2.500-1.600 5.200-2.400 8-2.400 7 0 12 5.500 12 14.400"/><rect x="26" y="38" width="13" height="17" rx="2.500" transform="rotate(-8 32 46)" class="fillw"/><path d="m30 44 5.500-1" /></svg>',
  invite: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="27" cy="22" r="8.500"/><path d="M10 54c0-10.500 7-17 17-17 3.500 0 6.500.8 9 2.400"/><path d="M48 34v18M39 43h18"/></svg>',
};

function makeSeg(cls, items, onPick) {
  const wrap = el('div', `pills ${cls}`);
  wrap.setAttribute('role', 'tablist');
  const ind = el('i', 'ind');
  wrap.append(ind);
  const btns = items.map(([k, t, soon]) => {
    const b = el('button', 'pb', t);
    b.dataset.k = k;
    b.setAttribute('role', 'tab');
    if (soon) b.classList.add('soon');
    b.onclick = () => onPick(k, b);
    wrap.append(b);
    return b;
  });
  let cur = null;
  const place = () => {
    const b = btns.find((x) => x.dataset.k === cur);
    if (!b || !b.offsetWidth) return;
    ind.style.width = `${b.offsetWidth}px`;
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  return {
    wrap, place,
    set(k) {
      cur = k;
      btns.forEach((b) => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      place();
    },
  };
}

export function createUI(root, h) {
  installSprings();
  root.innerHTML = '';
  const bg = el('div', 'bg');
  const shelfBack = el('div', 'shelf-back');
  const gl = el('canvas', 'gl');
  const flash = el('div', 'flash');
  const stamp = el('div', 'stamp');
  stamp.setAttribute('aria-hidden', 'true');

  /* ===== 首頁 ===== */
  root.dataset.screen = 'home';
  const home = el('section', 'scr home');
  home.innerHTML = `
    <header class="head">
      <button class="who" aria-label="改名字"><span class="nm">我</span>的記憶卡</button>
      <p class="stat"></p>
    </header>
    <div class="shelf">
      <div class="shelf-bar"><span class="tabs"></span></div>
      <div class="shelf-slots"></div>
      <div class="shelf-empty" hidden></div>
      <div class="ledge"></div>
      <i class="gloss" aria-hidden="true"></i>
    </div>
    <div class="friends">
      <button class="tile glass" data-k="friends"><span class="ico">${I.friends}</span><b>朋友的卡包</b><small>即將開放</small></button>
      <button class="tile glass" data-k="invite"><span class="ico">${I.invite}</span><b>邀請朋友</b><small>即將開放</small></button>
    </div>
    <nav class="dock glass"><button class="plus" aria-label="新增卡包">${I.plus}</button></nav>`;

  /* ===== 卡包選擇 ===== */
  const sel = el('section', 'scr select');
  sel.innerHTML = `
    <header class="bar">
      <button class="icon glass back" aria-label="回首頁">${I.back}</button>
      <span class="count"></span>
      <button class="icon glass fav" aria-label="加入最愛" aria-pressed="false">${I.heart}</button>
    </header>
    <div class="bubble glass" aria-label="這個卡包裡的卡片"><div class="thumbs"></div></div>
    <div class="carousel-slot"></div>
    <div class="info">
      <b class="pname"></b>
      <span class="pmeta"></span>
      <button class="lnk edit">編輯卡包</button>
    </div>
    <div class="draw">
      <button class="btn glass one"><span>抽 1 包</span></button>
      <button class="btn solid ten"><span>抽 10 包</span></button>
    </div>
    <div class="cats"></div>
    <p class="cat-empty" hidden></p>`;

  /* ===== 開包 ===== */
  const draw = el('section', 'scr drawing');
  draw.innerHTML = `
    <header class="bar">
      <button class="icon glass back" aria-label="離開">${I.back}</button>
      <span class="prog glass"><b class="cur">1</b><i>/</i><span class="tot">10</span></span>
      <button class="btn mini glass skip">跳過</button>
    </header>
    <div class="foot">
      <p class="hint"></p>
      <div class="row">
        <button class="btn mini glass auto" aria-pressed="false">${I.bolt}<span>自動開包</span></button>
        <button class="btn solid next"><span>查看結果</span></button>
      </div>
    </div>`;

  /* ===== 改名 ===== */
  const nameSheet = el('div', 'sheet mini');
  nameSheet.hidden = true;
  nameSheet.innerHTML = `
    <div class="panel glass" role="dialog" aria-label="你的名字">
      <h2>記憶卡的主人</h2>
      <input class="nin" maxlength="8" placeholder="輸入名字" />
      <div class="row end"><button class="btn solid ndone"><span>完成</span></button></div>
    </div>`;

  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  const screens = el('div', 'screens');
  screens.append(home, sel, draw);
  root.append(bg, shelfBack, gl, screens, flash, stamp, nameSheet, toast);

  const $ = (r, s) => r.querySelector(s);
  const homeStat = $(home, '.stat');
  const whoName = $(home, '.nm');
  const slots = $(home, '.shelf-slots');
  const shelfEmpty = $(home, '.shelf-empty');
  const shelfEl = $(home, '.shelf');
  const bubble = $(sel, '.bubble');
  const thumbs = $(sel, '.thumbs');
  const selCount = $(sel, '.count');
  const favBtn = $(sel, '.fav');
  const pname = $(sel, '.pname');
  const pmeta = $(sel, '.pmeta');
  const catEmpty = $(sel, '.cat-empty');

  /* ---- 首頁 ---- */
  const tabs = makeSeg('tabs', [['fav', '最愛'], ['recent', '最近']], (k) => h.onTab(k));
  $(home, '.tabs').append(tabs.wrap);
  $(home, '.who').onclick = () => {
    nameSheet.hidden = false;
    const i = $(nameSheet, '.nin');
    i.value = $(home, '.nm').textContent;
    requestAnimationFrame(() => { i.focus(); i.select(); });
  };
  const closeName = () => {
    if (nameSheet.hidden) return;
    nameSheet.hidden = true;
    h.onRename($(nameSheet, '.nin').value);
  };
  $(nameSheet, '.ndone').onclick = closeName;
  nameSheet.addEventListener('pointerdown', (e) => e.target === nameSheet && closeName());
  $(nameSheet, '.nin').addEventListener('keydown', (e) => { if (e.key === 'Enter') closeName(); });
  $(home, '.plus').onclick = () => h.onNewPack();
  home.querySelectorAll('.tile').forEach((t) => (t.onclick = () => h.onFriend(t.dataset.k)));

  /* ---- 卡包選擇 ---- */
  const cats = makeSeg('cats glass', [['all', '全部'], ['fav', '最愛'], ['recent', '最近'], ['friends', '朋友的', true]], (k) => h.onCat(k));
  $(sel, '.cats').append(cats.wrap);
  $(sel, '.back').onclick = () => h.onBack();
  favBtn.onclick = () => h.onFav();
  $(sel, '.edit').onclick = () => h.onEdit();
  $(sel, '.one').onclick = () => h.onDraw(1);
  $(sel, '.ten').onclick = () => h.onDraw(10);

  /* ---- 開包 ---- */
  const hint = $(draw, '.hint');
  const prog = $(draw, '.prog');
  const autoBtn = $(draw, '.auto');
  const nextBtn = $(draw, '.next');
  $(draw, '.back').onclick = () => h.onBack();
  $(draw, '.skip').onclick = () => h.onSkip();
  autoBtn.onclick = () => h.onAuto();
  nextBtn.onclick = () => h.onNext();

  /* ---- 玻璃高光跟著手指走 ---- */
  const glassMove = (e) => {
    const g = e.target.closest && e.target.closest('.glass, .btn, .tile, .icon, .plus');
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    g.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  screens.addEventListener('pointermove', glassMove);
  screens.addEventListener('pointerdown', glassMove);

  let tt = 0;
  let stampT = 0;
  const api = {
    gl, shelfBack,
    $: (s) => root.querySelector(s),

    showScreen(name) {
      root.dataset.screen = name; // 哪個畫面顯示,全部交給 CSS 的 [data-screen]
      requestAnimationFrame(() => { tabs.place(); cats.place(); });
    },

    setHome({ name, packs, cards, shelf, tab }) {
      whoName.textContent = name;
      homeStat.textContent = packs ? `${packs} 個卡包 · ${cards} 張卡片` : '還沒有卡包';
      tabs.set(tab);
      slots.innerHTML = '';
      shelf.forEach((p) => {
        const c = el('button', 'col');
        c.dataset.id = p.id;
        c.setAttribute('aria-label', `${p.name},${p.n} 張`);
        c.innerHTML = '<i class="slot"></i><b></b><span></span>';
        $(c, 'b').textContent = p.name || '未命名';
        $(c, 'span').textContent = p.n ? `${p.n} 張` : '空的';
        c.onclick = () => h.onShelfPick(p.id);
        slots.append(c);
      });
      shelfEmpty.hidden = shelf.length > 0;
      if (!shelf.length) {
        if (!packs) {
          shelfEmpty.innerHTML = '<b>櫥窗還是空的</b><p>新增你的第一個卡包,或先載入示範卡包來玩玩看。</p><div class="row"><button class="btn solid mk"><span>新增卡包</span></button><button class="btn glass demo"><span>載入示範</span></button></div>';
          $(shelfEmpty, '.mk').onclick = () => h.onNewPack();
          $(shelfEmpty, '.demo').onclick = () => h.onDemo();
        } else {
          shelfEmpty.innerHTML = `<b>${tab === 'fav' ? '還沒有最愛的卡包' : '還沒有最近的卡包'}</b><p>${tab === 'fav' ? '進到卡包頁,點右上角的愛心,就會放到這裡。' : '開過的卡包會出現在這裡。'}</p><div class="row"><button class="btn glass go"><span>去看卡包</span></button></div>`;
          $(shelfEmpty, '.go').onclick = () => h.onShelfPick(null);
        }
      }
      requestAnimationFrame(() => tabs.place());
    },

    // list: [{id,name,n,perOpen,fav,color,counts:{normal,rare,super_rare}}]
    setCats(cat, empty) {
      cats.set(cat);
      catEmpty.hidden = !empty;
      catEmpty.textContent = empty || '';
      sel.classList.toggle('none', !!empty);
    },
    setFocus(p, idx, total, preview) {
      sel.classList.toggle('none', !p);
      if (!p) { selCount.textContent = ''; pname.textContent = ''; pmeta.textContent = ''; return; }
      selCount.innerHTML = `<b>${idx + 1}</b><i>/</i>${total}`;
      pname.textContent = p.name || '未命名';
      const g = p.counts;
      pmeta.textContent = p.n ? `${p.n} 張 · 每包 ${p.perOpen} 張${g.super_rare ? ` · SSR ${g.super_rare}` : ''}${g.rare ? ` · SR ${g.rare}` : ''}` : '還沒有卡片,先去編輯加幾張照片';
      favBtn.classList.toggle('on', !!p.fav);
      favBtn.setAttribute('aria-pressed', String(!!p.fav));
      favBtn.setAttribute('aria-label', p.fav ? '取消最愛' : '加入最愛');
      root.style.setProperty('--pack', CONFIG.style.packColors[p.color] || '#000');
      // 預覽泡泡:這個卡包裡的幾張卡
      thumbs.innerHTML = '';
      bubble.classList.toggle('empty', !preview.length);
      preview.forEach((src, i) => {
        const t = el('i', 'th');
        t.style.backgroundImage = src ? `url(${src})` : 'none';
        t.style.setProperty('--r', `${(i - (preview.length - 1) / 2) * 5}deg`);
        t.style.setProperty('--i', i);
        thumbs.append(t);
      });
      bubble.classList.remove('pop');
      void bubble.offsetWidth;
      bubble.classList.add('pop');
    },

    setDraw({ mode, i, total, auto, next, hintText, canSkip = true }) {
      draw.classList.toggle('multi', mode === 'multi');
      draw.classList.toggle('can-next', !!next);
      $(draw, '.cur').textContent = String(i);
      $(draw, '.tot').textContent = String(total);
      autoBtn.classList.toggle('on', !!auto);
      autoBtn.setAttribute('aria-pressed', String(!!auto));
      $(draw, '.skip').hidden = !canSkip;
      hint.textContent = hintText || '';
      hint.classList.toggle('on', !!hintText);
      prog.classList.remove('bump');
      void prog.offsetWidth;
      prog.classList.add('bump');
    },

    // 讓畫面上的元素量位置(3D 用)
    rects() {
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; };
      return {
        shelf: [...slots.querySelectorAll('.slot')].map(R),
        shelfBox: R(shelfEl),
        carousel: R($(sel, '.carousel-slot')),
      };
    },
    syncShelfBack() {
      const r = shelfEl.getBoundingClientRect();
      Object.assign(shelfBack.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    },

    toast(msg) {
      toast.textContent = msg;
      toast.classList.add('on');
      clearTimeout(tt);
      tt = setTimeout(() => toast.classList.remove('on'), 2400);
    },
    // kind: 'white' | 'black'
    flash(kind = 'black', op = 0.5, sec = 0.28) {
      flash.style.background = kind === 'white' ? '#fff' : '#000';
      flash.style.transition = 'none';
      flash.style.opacity = String(op);
      requestAnimationFrame(() => {
        flash.style.transition = `opacity ${sec}s ease-out`;
        flash.style.opacity = '0';
      });
    },
    // 稀有度蓋章:SSR / SR 從大放小「砰」地蓋在畫面中央
    stamp(grade) {
      clearTimeout(stampT);
      stamp.textContent = grade;
      stamp.dataset.g = grade;
      stamp.classList.remove('go');
      void stamp.offsetWidth;
      stamp.classList.add('go');
      stampT = setTimeout(() => stamp.classList.remove('go'), 1500);
    },
    showError() {
      api.toast('這個裝置不支援 WebGL,暫時無法顯示 3D 卡包');
    },
    resizeSegs() { tabs.place(); cats.place(); },
    destroy() {
      clearTimeout(tt);
      clearTimeout(stampT);
      root.innerHTML = '';
    },
  };
  return api;
}
