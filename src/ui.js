// 介面層(DOM):頂欄、卡包標籤、空狀態、提示、提示訊息。編輯器在 editor.js。
import { CONFIG } from './config.js';

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function createUI(root, h) {
  root.innerHTML = '';
  const bgShop = el('canvas', 'bg bg-shop');
  const bgDesk = el('canvas', 'bg bg-desk');
  const gl = el('canvas', 'gl');
  const flash = el('div', 'flash');

  const bar = el('header', 'bar');
  const brand = el('div', 'brand', '<b>day pocket</b>');
  const actions = el('div', 'actions');
  const back = el('button', 'btn', '回卡店');
  const skip = el('button', 'btn', '跳過');
  const fxBtn = el('button', 'btn', '特效 開');
  fxBtn.setAttribute('aria-pressed', 'true');
  const add = el('button', 'btn solid', '新增卡包');
  actions.append(back, skip, fxBtn, add);
  bar.append(brand, actions);

  const labels = el('div', 'labels');
  const empty = el('div', 'empty');
  empty.innerHTML = '<h1>卡店還是空的</h1><p>新增一個卡包,放進你的照片,就能掛上來開。</p>';
  const emptyBtn = el('button', 'btn solid big', '新增第一個卡包');
  empty.append(emptyBtn);
  empty.hidden = true;

  const dock = el('div', 'dock');
  const hint = el('p', 'hint');
  const again = el('button', 'btn solid big', '再開一次');
  dock.append(hint, again);
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');

  root.append(bgShop, bgDesk, gl, flash, bar, labels, empty, dock, toast);

  fxBtn.onclick = () => {
    CONFIG.fx.enabled = !CONFIG.fx.enabled;
    fxBtn.textContent = CONFIG.fx.enabled ? '特效 開' : '特效 關';
    fxBtn.setAttribute('aria-pressed', String(CONFIG.fx.enabled));
  };
  add.onclick = () => h.onNewPack();
  emptyBtn.onclick = () => h.onNewPack();
  back.onclick = () => h.onBack();
  skip.onclick = () => h.onSkip();
  again.onclick = () => h.onAgain();

  let labelEls = [];
  let tt = 0;
  return {
    bgShop, bgDesk, gl,
    setHint(t) { hint.textContent = t; hint.classList.toggle('on', !!t); },
    setMode({ view, shop, skip: s, again: a, back: b }) {
      add.hidden = !shop;
      skip.hidden = !s;
      again.hidden = !a;
      back.hidden = !b;
      labels.classList.toggle('off', view !== 'shop' || !shop);
    },
    setLabelsVisible(v) { labels.classList.toggle('off', !v); },
    setLabels(list) {
      labels.innerHTML = '';
      labelEls = list.map((p) => {
        const d = el('div', 'lab');
        const name = el('b');
        name.textContent = p.name || '未命名';
        const sub = el('span');
        sub.textContent = p.n ? `${p.n} 張` : '還沒有卡片';
        const edit = el('button', 'lnk', '編輯');
        edit.setAttribute('aria-label', `編輯「${p.name}」`);
        edit.onclick = () => h.onEdit(p.id);
        d.append(name, sub, edit);
        labels.append(d);
        return d;
      });
    },
    placeLabels(pts) {
      pts.forEach((p, i) => {
        const d = labelEls[i];
        if (d) d.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translateX(-50%)`;
      });
    },
    setEmpty(on) { empty.hidden = !on; },
    toast(msg) {
      toast.textContent = msg;
      toast.classList.add('on');
      clearTimeout(tt);
      tt = setTimeout(() => toast.classList.remove('on'), 2600);
    },
    flash() {
      flash.style.transition = 'none';
      flash.style.opacity = '0.8';
      requestAnimationFrame(() => {
        flash.style.transition = `opacity ${CONFIG.timing.flash}s ease-out`;
        flash.style.opacity = '0';
      });
    },
    showError() {
      hint.textContent = '這個裝置不支援 WebGL,暫時無法顯示 3D 卡包';
      hint.classList.add('on');
    },
    destroy() {
      clearTimeout(tt);
      root.innerHTML = '';
    },
  };
}
