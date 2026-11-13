// 編輯器:卡包(名稱、顏色、封面圖與位置大小、文字、每包張數、卡片們)+ 單張卡片(照片、日期、一句話、評級、心情矩陣、邊框)。
// 所有東西都是使用者自己上傳,改動立刻存進 store;右上「完成」關閉。
import { CONFIG } from './config.js';
import * as store from './store.js';
import { nearestMood, moodColor, QUADRANTS } from './mood.js';
import { drawPackTexture, drawCardFront, drawSticker, blankPhoto } from './art.js';
import { el } from './ui.js';

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
    if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(src);
};

// 心情矩陣底色:四角雙線性混色,畫在小 canvas 上再放大(瀏覽器會平滑插值),往白色靠一點讓它安靜
function paintPad(canvas) {
  const n = 40;
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const m = moodColor((x / (n - 1)) * 2 - 1, 1 - (y / (n - 1)) * 2).match(/\d+/g).map(Number);
      const k = 0.5, i = (y * n + x) * 4;
      img.data[i] = m[0] * (1 - k) + 247 * k;
      img.data[i + 1] = m[1] * (1 - k) + 247 * k;
      img.data[i + 2] = m[2] * (1 - k) + 246 * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function range(label, min, max, step, get, set, fmt = (v) => v) {
  const row = el('label', 'rng');
  const name = el('span', null, label);
  const input = el('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step;
  const val = el('output');
  input.oninput = () => { set(parseFloat(input.value)); val.textContent = fmt(parseFloat(input.value)); };
  const sync = () => { input.value = get(); val.textContent = fmt(get()); };
  row.append(name, input, val);
  return { row, input, sync };
}

export function createEditor(root, h) {
  /* ================= 卡包編輯 ================= */
  const sheet = el('div', 'sheet');
  sheet.hidden = true;
  const panel = el('div', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '卡包設定');
  panel.innerHTML = `
    <div class="phead"><h2>卡包設定</h2><button class="btn solid done">完成</button></div>
    <div class="top">
      <div class="pvwrap"><canvas class="pv" width="204" height="290"></canvas><small>在卡包上拖曳可移動封面</small></div>
      <div class="fields">
        <label class="fld"><span>名稱</span><input class="name" maxlength="14" /></label>
        <div class="fld"><span>每次開幾張</span><div class="seg per"></div></div>
      </div>
    </div>
    <section><h3>顏色</h3><div class="sw colors"></div></section>
    <section><h3>封面圖片</h3>
      <div class="row"><label class="btn file">選擇圖片<input class="coverfile" type="file" accept="image/*" /></label><button class="btn rmcover">移除</button></div>
      <div class="coverctl"></div>
    </section>
    <section><h3>文字</h3>
      <label class="check"><input class="texton" type="checkbox" /><span>在封面加上文字</span></label>
      <div class="textctl"><input class="textval" maxlength="16" placeholder="封面上的字" /><div class="textrng"></div><div class="seg tcolor"></div></div>
    </section>
    <section class="stksec"><h3>貼紙</h3><div class="stk"></div></section>
    <section><h3>卡片 <em class="cnt"></em></h3>
      <div class="grid"></div>
      <p class="note addnote"></p>
    </section>
    <div class="row end"><button class="btn danger delpack">刪除這個卡包</button></div>`;
  sheet.append(panel);

  const q = (s) => panel.querySelector(s);
  const pv = q('.pv');
  const nameIn = q('.name');
  const per = q('.per');
  const colorsEl = q('.colors');
  const coverFile = q('.coverfile');
  const rmCover = q('.rmcover');
  const coverCtl = q('.coverctl');
  const textOn = q('.texton');
  const textVal = q('.textval');
  const textRng = q('.textrng');
  const tcolor = q('.tcolor');
  const stkSec = q('.stksec');
  const stk = q('.stk');
  const grid = q('.grid');
  const cnt = q('.cnt');
  const addnote = q('.addnote');
  const delBtn = q('.delpack');

  let cur = null;
  let coverImg = null;
  let raf = 0;
  const drawPreview = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!cur) return;
      const W = 512, H = Math.round((W * CONFIG.pack.height) / CONFIG.pack.width);
      const full = drawPackTexture(W, H, CONFIG.pack.tearFrac, CONFIG.style.packColors[cur.color], {
        sticker: cur.sticker, cover: coverImg ? { ...cur.cover, img: coverImg } : null, text: cur.text,
      });
      const g = pv.getContext('2d');
      g.clearRect(0, 0, pv.width, pv.height);
      g.drawImage(full, 0, 0, pv.width, pv.height);
    });
  };
  const touch = () => { store.save(); drawPreview(); };

  nameIn.oninput = () => {
    const follow = cur.text.value === cur.name;
    cur.name = nameIn.value.slice(0, 14);
    if (follow) { cur.text.value = cur.name.slice(0, 16); textVal.value = cur.text.value; }
    touch();
  };
  [1, 2, 3, 4, 5].forEach((n) => {
    const b = el('button', 'segbtn', String(n));
    b.dataset.v = n;
    b.onclick = () => { cur.perOpen = n; mark(per, n); touch(); };
    per.append(b);
  });
  const mark = (root_, v) => root_.querySelectorAll('[data-v]').forEach((b) => {
    const on = b.dataset.v === String(v);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  Object.entries(CONFIG.style.packColors).forEach(([k, c]) => {
    const b = el('button', 'swbtn');
    b.style.background = c;
    b.dataset.v = k;
    b.setAttribute('aria-label', k);
    b.onclick = () => { cur.color = k; mark(colorsEl, k); touch(); };
    colorsEl.append(b);
  });
  CONFIG.style.stickers.forEach((k) => {
    const b = el('button', 'stkbtn');
    if (k === 'none') b.textContent = '無';
    else {
      const cv = el('canvas');
      cv.width = cv.height = 44;
      drawSticker(cv.getContext('2d'), k, 22, 22, 34);
      b.append(cv);
    }
    b.dataset.v = k;
    b.setAttribute('aria-label', k === 'none' ? '不放貼紙' : k);
    b.onclick = () => { cur.sticker = k; mark(stk, k); touch(); };
    stk.append(b);
  });

  const cx = range('左右', -0.6, 0.6, 0.01, () => cur.cover.x, (v) => { cur.cover.x = v; touch(); }, (v) => v.toFixed(2));
  const cy = range('上下', -0.6, 0.6, 0.01, () => cur.cover.y, (v) => { cur.cover.y = v; touch(); }, (v) => v.toFixed(2));
  const cs = range('大小', 0.2, 2, 0.02, () => cur.cover.scale, (v) => { cur.cover.scale = v; touch(); }, (v) => `${Math.round(v * 100)}%`);
  coverCtl.append(cx.row, cy.row, cs.row);
  const tsz = range('字大小', 0.04, 0.2, 0.005, () => cur.text.size, (v) => { cur.text.size = v; touch(); }, (v) => `${Math.round(v * 100)}`);
  const ty = range('上下', -0.45, 0.45, 0.01, () => cur.text.y, (v) => { cur.text.y = v; touch(); }, (v) => v.toFixed(2));
  textRng.append(tsz.row, ty.row);
  [['light', '白字'], ['dark', '深色字']].forEach(([k, t]) => {
    const b = el('button', 'segbtn', t);
    b.dataset.v = k;
    b.onclick = () => { cur.text.color = k; mark(tcolor, k); touch(); };
    tcolor.append(b);
  });
  textOn.onchange = () => { cur.text.on = textOn.checked; syncText(); touch(); };
  textVal.oninput = () => { cur.text.value = textVal.value; touch(); };
  const syncText = () => {
    q('.textctl').classList.toggle('dim', !cur.text.on);
    [textVal, tsz.input, ty.input, ...tcolor.querySelectorAll('button')].forEach((e) => (e.disabled = !cur.text.on));
  };
  const syncCover = () => {
    const has = !!cur.cover.img;
    coverCtl.classList.toggle('dim', !has);
    [cx, cy, cs].forEach((r) => (r.input.disabled = !has));
    rmCover.hidden = !has;
    stkSec.hidden = has; // 有封面圖時貼紙不顯示
  };

  coverFile.onchange = async () => {
    const f = coverFile.files && coverFile.files[0];
    coverFile.value = '';
    if (!f) return;
    const url = await store.shrinkImage(f, 1100);
    if (!url) { toastMsg('這張圖片讀不出來,換一張試試'); return; }
    cur.cover.img = url;
    cur.cover.x = 0; cur.cover.y = 0; cur.cover.scale = 0.8;
    coverImg = await loadImg(url);
    syncAll();
    touch();
  };
  rmCover.onclick = () => { cur.cover.img = ''; coverImg = null; syncCover(); touch(); };

  // 在預覽上直接拖曳封面 / 滾輪縮放
  let pvDrag = null;
  pv.addEventListener('pointerdown', (e) => {
    if (!cur.cover.img) return;
    pvDrag = { x: e.clientX, y: e.clientY, cx: cur.cover.x, cy: cur.cover.y };
    pv.setPointerCapture(e.pointerId);
  });
  pv.addEventListener('pointermove', (e) => {
    if (!pvDrag) return;
    const r = pv.getBoundingClientRect();
    cur.cover.x = Math.max(-0.6, Math.min(0.6, pvDrag.cx + (e.clientX - pvDrag.x) / r.width));
    cur.cover.y = Math.max(-0.6, Math.min(0.6, pvDrag.cy + (e.clientY - pvDrag.y) / r.height));
    cx.sync(); cy.sync();
    drawPreview();
  });
  const pvEnd = () => { if (pvDrag) { pvDrag = null; store.save(); } };
  pv.addEventListener('pointerup', pvEnd);
  pv.addEventListener('pointercancel', pvEnd);
  pv.addEventListener('wheel', (e) => {
    if (!cur.cover.img) return;
    e.preventDefault();
    cur.cover.scale = Math.max(0.2, Math.min(2, cur.cover.scale * Math.exp(-e.deltaY * 0.001)));
    cs.sync();
    touch();
  }, { passive: false });

  /* ---- 卡片格 ---- */
  const GRADE = (c) => CONFIG.rarity[c.rarity].grade;
  const renderGrid = () => {
    grid.innerHTML = '';
    cnt.textContent = `(${cur.cards.length})`;
    cur.cards.forEach((c) => {
      const b = el('button', 'thumb');
      b.style.backgroundImage = c.photo ? `url(${c.photo})` : 'none';
      b.setAttribute('aria-label', `編輯卡片 ${c.caption || c.date}`);
      b.innerHTML = `<i>${GRADE(c)}</i>`;
      b.onclick = () => openCard(c);
      grid.append(b);
    });
    const add = el('label', 'thumb addthumb', '<span>＋</span><small>加入照片</small><input type="file" accept="image/*" multiple />');
    add.querySelector('input').onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      addnote.textContent = `處理中…`;
      let last = null, bad = 0;
      for (const f of files) {
        const url = await store.shrinkImage(f);
        if (url) last = store.addCardTo(cur, { photo: url });
        else bad++;
      }
      addnote.textContent = bad ? `有 ${bad} 張讀不出來,已略過` : '';
      renderGrid();
      syncDel();
      if (files.length === 1 && last) openCard(last); // 單張:直接進去設定心情和一句話
    };
    grid.append(add);
    addnote.textContent = cur.cards.length ? '點一張卡片可以設定心情、評級和一句話。' : '先加幾張照片,每張照片就是一張卡片。';
  };
  const syncDel = () => { delBtn.textContent = '刪除這個卡包'; delBtn.classList.remove('armed'); };
  delBtn.onclick = () => {
    if (!delBtn.classList.contains('armed')) {
      delBtn.classList.add('armed');
      delBtn.textContent = `再按一次,刪除「${cur.name}」和它的 ${cur.cards.length} 張卡片`;
      return;
    }
    store.removePack(cur.id);
    cur = null;
    closePack();
  };

  function syncAll() {
    nameIn.value = cur.name;
    mark(per, cur.perOpen);
    mark(colorsEl, cur.color);
    mark(stk, cur.sticker);
    mark(tcolor, cur.text.color);
    textOn.checked = cur.text.on;
    textVal.value = cur.text.value;
    [cx, cy, cs, tsz, ty].forEach((r) => r.sync());
    syncCover();
    syncText();
  }

  let toastMsg = () => {};
  async function openPack(pack, isNew = false) {
    cur = pack;
    coverImg = await loadImg(pack.cover.img);
    syncAll();
    renderGrid();
    syncDel();
    drawPreview();
    sheet.hidden = false;
    panel.scrollTop = 0;
    h.onOpen();
    if (isNew) { nameIn.focus({ preventScroll: true }); nameIn.select(); }
  }
  function closePack() {
    if (cur) store.save();
    sheet.hidden = true;
    csheet.hidden = true;
    h.onClose();
  }
  q('.done').onclick = closePack;
  sheet.addEventListener('pointerdown', (e) => e.target === sheet && closePack());

  /* ================= 單張卡片 ================= */
  const csheet = el('div', 'sheet top');
  csheet.hidden = true;
  const cp = el('div', 'panel');
  cp.setAttribute('role', 'dialog');
  cp.setAttribute('aria-label', '卡片設定');
  cp.innerHTML = `
    <div class="phead"><h2>卡片</h2><button class="btn solid cdone">完成</button></div>
    <div class="top">
      <div class="pvwrap"><canvas class="cpv" width="180" height="253"></canvas></div>
      <div class="fields">
        <label class="fld"><span>日期</span><input class="date" type="date" /></label>
        <label class="fld"><span>一句話</span><input class="cap" maxlength="30" placeholder="這張照片的開心" /></label>
        <label class="btn file">換照片<input class="cfile" type="file" accept="image/*" /></label>
      </div>
    </div>
    <section><h3>評級</h3><div class="seg grade"></div></section>
    <section><h3>心情</h3>
      <p class="note">在矩陣裡點一下或拖曳:橫軸是愉快程度,縱軸是能量高低。</p>
      <div class="pad" tabindex="0" aria-label="心情矩陣,可用方向鍵調整">
        <canvas class="padbg"></canvas><i class="axis-x"></i><i class="axis-y"></i>
        <span class="q tl">${QUADRANTS.TL}</span><span class="q tr">${QUADRANTS.TR}</span><span class="q bl">${QUADRANTS.BL}</span><span class="q br">${QUADRANTS.BR}</span>
        <b class="dot"></b>
      </div>
      <div class="readout"><span class="word"></span></div>
    </section>
    <section><h3>照片邊框</h3><div class="bstyles"></div><div class="sw bcolors"></div></section>
    <div class="row end"><button class="btn danger delcard">刪除這張卡片</button></div>`;
  csheet.append(cp);
  root.append(sheet, csheet);

  const c$ = (s) => cp.querySelector(s);
  const cpv = c$('.cpv');
  const dateIn = c$('.date');
  const capIn = c$('.cap');
  const cfile = c$('.cfile');
  const grade = c$('.grade');
  const pad = c$('.pad');
  const dot = c$('.dot');
  const word = c$('.word');
  const bst = c$('.bstyles');
  const bcol = c$('.bcolors');
  const delCard = c$('.delcard');
  paintPad(c$('.padbg'));

  let card = null, photoImg = null, raf2 = 0;
  const drawCardPreview = () => {
    cancelAnimationFrame(raf2);
    raf2 = requestAnimationFrame(() => {
      if (!card) return;
      const full = drawCardFront(photoImg || blankPhoto(), card);
      const g = cpv.getContext('2d');
      g.clearRect(0, 0, cpv.width, cpv.height);
      g.drawImage(full, 0, 0, cpv.width, cpv.height);
    });
  };
  const cTouch = () => { store.save(); drawCardPreview(); };
  const setMood = (v, e) => {
    card.mood = { v: Math.max(-1, Math.min(1, v)), e: Math.max(-1, Math.min(1, e)) };
    dot.style.left = `${((card.mood.v + 1) / 2) * 100}%`;
    dot.style.top = `${((1 - card.mood.e) / 2) * 100}%`;
    const c = moodColor(card.mood.v, card.mood.e);
    dot.style.background = c;
    word.textContent = nearestMood(card.mood.v, card.mood.e);
    cTouch();
  };
  const fromEv = (e) => {
    const r = pad.getBoundingClientRect();
    setMood(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  };
  let dragging = false;
  pad.addEventListener('pointerdown', (e) => { dragging = true; pad.setPointerCapture(e.pointerId); dot.classList.add('held'); fromEv(e); });
  pad.addEventListener('pointermove', (e) => dragging && fromEv(e));
  const endDrag = () => { dragging = false; dot.classList.remove('held'); };
  pad.addEventListener('pointerup', endDrag);
  pad.addEventListener('pointercancel', endDrag);
  pad.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
    if (m) { e.preventDefault(); setMood(card.mood.v + m[0], card.mood.e + m[1]); }
  });
  Object.entries(CONFIG.rarity).forEach(([k, r]) => {
    const b = el('button', 'segbtn', `<b>${r.grade}</b><small>${r.label}</small>`);
    b.dataset.v = k;
    b.onclick = () => { card.rarity = k; mark(grade, k); cTouch(); };
    grade.append(b);
  });
  Object.entries(CONFIG.style.borderStyles).forEach(([k, t]) => {
    const b = el('button', 'segbtn', t);
    b.dataset.v = k;
    b.onclick = () => { card.border.style = k; mark(bst, k); cTouch(); };
    bst.append(b);
  });
  CONFIG.style.borderColors.forEach((c) => {
    const b = el('button', 'swbtn');
    b.style.background = c;
    b.dataset.v = c;
    b.setAttribute('aria-label', c);
    b.onclick = () => { card.border.color = c; mark(bcol, c); cTouch(); };
    bcol.append(b);
  });
  dateIn.onchange = () => { if (dateIn.value) { card.date = dateIn.value; cTouch(); } };
  capIn.oninput = () => { card.caption = capIn.value; cTouch(); };
  cfile.onchange = async () => {
    const f = cfile.files && cfile.files[0];
    cfile.value = '';
    if (!f) return;
    const url = await store.shrinkImage(f);
    if (!url) return;
    card.photo = url;
    photoImg = await loadImg(url);
    cTouch();
  };
  async function openCard(c) {
    card = c;
    photoImg = await loadImg(c.photo);
    dateIn.value = c.date;
    capIn.value = c.caption;
    mark(grade, c.rarity);
    mark(bst, c.border.style);
    mark(bcol, c.border.color);
    delCard.textContent = '刪除這張卡片';
    delCard.classList.remove('armed');
    csheet.hidden = false;
    cp.scrollTop = 0;
    setMood(c.mood.v, c.mood.e);
    capIn.focus({ preventScroll: true });
  }
  delCard.onclick = () => {
    if (!delCard.classList.contains('armed')) { delCard.classList.add('armed'); delCard.textContent = '再按一次,確定刪除'; return; }
    store.removeCardFrom(cur, card.id);
    closeCard();
  };
  function closeCard() {
    csheet.hidden = true;
    card = null;
    if (cur) { store.save(); renderGrid(); }
  }
  c$('.cdone').onclick = closeCard;
  csheet.addEventListener('pointerdown', (e) => e.target === csheet && closeCard());

  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!csheet.hidden) closeCard();
    else if (!sheet.hidden) closePack();
  };
  window.addEventListener('keydown', onKey);
  toastMsg = (m) => { addnote.textContent = m; };

  return {
    openPack,
    destroy() {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      sheet.remove();
      csheet.remove();
    },
  };
}
