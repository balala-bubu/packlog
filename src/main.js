import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Spring, clamp } from './spring.js';
import * as store from './store.js';
import { blankPhoto, radialTexture, canvasTexture } from './art.js';
import { makeEnvironment } from './env.js';
import { createPack } from './pack.js';
import { Card, createCardShared, CARD_W } from './card.js';
import { Confetti, GoldDust } from './particles.js';
import { createUI, buzz } from './ui.js';
import { createEditor } from './editor.js';
import { createResults } from './results.js';
import { seedDemo } from './demo.js';
import { fontReady } from './fonts.js';

// 鏡頭固定:z=0 平面的可視高度永遠是 HW,所有版面(首頁櫥窗、卡包輪播、開包)都從 DOM 元素的位置換算成世界座標
const FOV = 32;
const TAN = Math.tan((FOV / 2) * (Math.PI / 180));
const HW = 4.8;
const CAM_D = HW / 2 / TAN;
const PACK_W = CONFIG.pack.width;
const PACK_H = CONFIG.pack.height;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

const imgCache = new Map();
function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    }));
    if (imgCache.size > 100) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(url);
}

const countRarity = (p) => p.cards.reduce((o, c) => { o[c.rarity] = (o[c.rarity] || 0) + 1; return o; }, { normal: 0, rare: 0, super_rare: 0 });

class App {
  constructor(root) {
    this.root = root;
    this.alive = true;
    this.gen = 0; // 開包世代:換包/離開時讓還在載入的舊工作作廢
    this.nodeGen = 0;
    this.time = 0;
    this.timers = [];
    this.cards = [];
    this.nodes = [];
    this.ghosts = [];
    this.pack = null;
    this.screen = 'home'; // home | select | draw | results
    this.state = 'idle'; // draw 子狀態:loading | arriving | pack | opening | reveal | collecting | done
    this.tab = 'fav'; // 首頁櫥窗:fav | recent
    this.cat = 'all'; // 選擇頁分類:all | fav | recent
    this.fi = 0; // 輪播目前聚焦的索引
    this.session = null;
    this.auto = false;
    this.drag = null;
    this.rects = null;
    this.sheetOpen = false;
    this.dissolveT = -1;
    this.depth = 0; // 瀏覽器歷史深度(返回鍵)
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastTap = -9;

    this.ui = createUI(root, {
      onNewPack: () => this.editor.openPack(store.addPack({}), true),
      onDemo: () => { seedDemo(); this.refresh(); this.ui.toast('已載入 3 個示範卡包'); },
      onRename: (v) => { store.setUserName(v); this.updateHome(); },
      onTab: (k) => { this.tab = k; this.updateHome(); },
      onShelfPick: (id) => this.goSelect(id),
      onFriend: () => this.ui.toast('朋友的卡包即將開放'),
      onCat: (k) => this.setCat(k),
      onBack: () => this.back(),
      onFav: () => this.toggleFav(),
      onEdit: () => { const p = this.focusedPack(); if (p) this.editor.openPack(p); },
      onDraw: (n) => this.startDraw(n),
      onSkip: () => this.skip(),
      onAuto: () => this.toggleAuto(),
      onNext: () => this.toResults(),
    });
    this.results = createResults(root, {
      onDone: () => this.goHome(true),
      onAgain: () => this.startDraw(this.session ? this.session.count : 1),
    });
    this.editor = createEditor(root, {
      onOpen: () => (this.sheetOpen = true),
      onClose: () => { this.sheetOpen = false; this.refresh(); },
    });
    this.canvas = this.ui.gl;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      this.ui.showError();
      this.alive = false;
      return;
    }
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.key = new THREE.DirectionalLight('#ffffff', 0.85);
    this.key.position.set(-3, 4, 6);
    this.scene.add(this.key);
    this.envRT = makeEnvironment(r);
    this.scene.environment = this.envRT.texture;
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    this.cam.position.set(0, 0, CAM_D);
    this.shared = createCardShared('#5da4f5');
    this.confetti = new Confetti(this.scene);
    this.dust = new GoldDust(this.scene);
    this.shadowTex = canvasTexture(radialTexture([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']], 128));
    this.glowTex = canvasTexture(radialTexture([[0, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']], 128));

    const S = CONFIG.spring;
    this.tear = new Spring(0, S.tear);
    this.packY = new Spring(0, S.packExit);
    this.kick = new Spring(0, { k: 120, c: 7 });
    this.yaw = new Spring(0, S.turn);
    this.pitch = new Spring(0, S.tilt);
    this.jx = new Spring(0, { k: CONFIG.jelly.k, c: CONFIG.jelly.c });
    this.jy = new Spring(0, { k: CONFIG.jelly.squashK, c: CONFIG.jelly.squashC });
    this.hint = new Spring(0, { k: 200, c: 22 });
    const mv = { k: 70, c: 12 };
    this.px = new Spring(0, mv); this.py = new Spring(0, mv); this.ps = new Spring(1, mv); this.rz = new Spring(0, { k: 60, c: 9 });
    this.sm = new Spring(0, { k: 85, c: 12.5 }); // 0 = 首頁櫥窗,1 = 輪播
    this.dm = new Spring(0, { k: 80, c: 14 }); // 1 = 進入開包,卡包輪播收起來
    this.focus = new Spring(0, { k: 120, c: 15 });
    this.capT = -1;
    this.clock = new THREE.Clock();

    this.bind();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    store.loadPacks().then(async () => {
      await fontReady;
      if (!this.alive) return;
      this.refresh();
    });
  }

  /* ---------- 座標換算:螢幕 px ↔ 世界 ---------- */
  px2w() { return HW / this.ch; }
  wx(px) { return (px - this.cw / 2) * this.px2w(); }
  wy(py) { return -(py - this.ch / 2) * this.px2w(); }

  /* ---------- 事件 ---------- */
  bind() {
    const c = this.canvas;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => { this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.mouse = e.pointerType === 'mouse'; },
      up: (e) => this.onUp(e),
      leave: () => { this.ptr.mouse = false; },
      resize: () => this.resize(),
      vis: () => {
        if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
        else if (!this.raf && this.alive) { this.clock.getDelta(); this.raf = requestAnimationFrame(this.loop); }
      },
      lost: (e) => e.preventDefault(),
      pop: () => this.onPop(),
    };
    this.ptr = { x: 0, y: 0, mouse: false };
    c.addEventListener('pointerdown', this.h.down);
    c.addEventListener('pointermove', this.h.move);
    c.addEventListener('pointerup', this.h.up);
    c.addEventListener('pointercancel', this.h.up);
    c.addEventListener('pointerleave', this.h.leave);
    c.addEventListener('webglcontextlost', this.h.lost);
    window.addEventListener('resize', this.h.resize);
    window.addEventListener('popstate', this.h.pop);
    document.addEventListener('visibilitychange', this.h.vis);
  }
  fxOn(name) {
    return !this.reduced && CONFIG.fx.enabled && CONFIG.fx[name];
  }
  after(sec, fn) {
    this.timers.push({ at: this.time + sec, fn });
  }

  /* ---------- 版面 ---------- */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cw = w; this.ch = h;
    this.aspect = w / h;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = this.aspect;
    this.cam.updateProjectionMatrix();
    this.deskLayout();
    cancelAnimationFrame(this._mr);
    this._mr = requestAnimationFrame(() => this.measure());
    clearTimeout(this._mt);
    this._mt = setTimeout(() => this.measure(), 350); // 手機網址列收起之後再量一次
    if (this.cards.length && (this.state === 'reveal' || this.state === 'done')) {
      this.cards.forEach((c, i) => { const s = this.slot(i); if (c !== this.selected) c.moveTo(s.x, s.y, s.z, s.rz); });
    }
  }
  measure() {
    if (!this.alive) return;
    this.rects = this.ui.rects();
    this.ui.syncShelfBack();
    this.ui.resizeSegs();
  }
  // 開包桌面:卡包大小與整排卡片的縮放(窄螢幕縮小,才排得下)
  deskLayout() {
    const W = HW * this.aspect;
    this.deskScale = Math.min(1.05, (W * 0.74) / PACK_W, (HW * 0.52) / PACK_H);
    this.deskY = 0.18;
    const n = this.session ? Math.min(this.session.data.perOpen, 5) : CONFIG.pack.cardsPerPack;
    const needW = (n - 1) * this.spread() + CARD_W + 0.2;
    this.cardK = Math.min(1, (W * 0.84) / needW);
    this.cards.forEach((c) => (c.k = this.cardK));
  }
  spread() {
    return this.aspect < 0.85 ? 0.74 : 1.32;
  }
  slot(i) {
    const n = this.cards.length || CONFIG.pack.cardsPerPack;
    const o = i - (n - 1) / 2;
    const portrait = this.aspect < 0.85;
    const k = this.cardK;
    return { x: o * this.spread() * k, y: 0.2 - Math.abs(o) * (portrait ? 0.02 : 0.04), z: 0.35 + i * 0.02, rz: -o * (portrait ? 0.1 : 0.08) };
  }

  /* ---------- 資料 → 畫面 ---------- */
  shelfList() {
    const l = this.tab === 'fav' ? store.getFavs() : store.getRecents();
    return l.slice(0, 3);
  }
  carouselList() {
    if (this.cat === 'fav') return store.getFavs();
    if (this.cat === 'recent') return store.getRecents();
    return store.getPacks();
  }
  focusedPack() { return this.carouselList()[this.fi] || null; }

  async refresh() {
    await this.buildNodes();
    this.updateHome();
    this.updateSelect();
  }
  updateHome() {
    const packs = store.getPacks();
    const shelf = this.shelfList();
    this.shelfIds = shelf.map((p) => p.id);
    this.ui.setHome({
      name: store.getUserName(),
      packs: packs.length,
      cards: packs.reduce((a, p) => a + p.cards.length, 0),
      shelf: shelf.map((p) => ({ id: p.id, name: p.name, n: p.cards.length })),
      tab: this.tab,
    });
    cancelAnimationFrame(this._mr);
    this._mr = requestAnimationFrame(() => this.measure());
  }
  updateSelect(keepId) {
    const list = this.carouselList();
    if (keepId) { const k = list.findIndex((p) => p.id === keepId); if (k >= 0) this.fi = k; }
    this.fi = clamp(this.fi, 0, Math.max(0, list.length - 1));
    this.focus.t = this.fi;
    const emptyMsg = list.length
      ? ''
      : this.cat === 'fav' ? '還沒有最愛的卡包。到「全部」點愛心加入。' : this.cat === 'recent' ? '還沒有開過的卡包。' : '還沒有卡包,回首頁新增一個。';
    this.ui.setCats(this.cat, emptyMsg);
    this.retarget(list);
    this.syncFocusUI();
  }
  syncFocusUI() {
    const list = this.carouselList();
    const p = list[this.fi];
    if (!p) { this.ui.setFocus(null, 0, 0, []); return; }
    const withPhoto = p.cards.filter((c) => c.photo).slice(0, 4);
    const preview = (withPhoto.length ? withPhoto : p.cards.slice(0, 4)).map((c) => c.photo);
    this.ui.setFocus({ ...p, n: p.cards.length, counts: countRarity(p) }, this.fi, list.length, preview);
    this.shared.updateBack(CONFIG.style.packColors[p.color]);
  }
  retarget(list = this.carouselList()) {
    this.nodes.forEach((n) => {
      const k = list.indexOf(n.data);
      if (k >= 0) {
        if (n.vis.x < 0.05) n.idx.snap(k);
        n.idx.t = k;
        n.vis.t = 1;
      } else n.vis.t = 0;
    });
  }
  setCat(k) {
    if (k === 'friends') { this.ui.toast('朋友的卡包即將開放'); return; }
    if (k === this.cat) return;
    const keep = this.focusedPack()?.id;
    this.cat = k;
    this.updateSelect(keep);
    this.fi = clamp(this.carouselList().findIndex((p) => p.id === keep), 0, 99);
    this.updateSelect();
    buzz(6);
  }
  toggleFav() {
    const p = this.focusedPack();
    if (!p) return;
    const on = store.toggleFav(p);
    buzz(on ? [10, 30, 10] : 6);
    if (on && this.fxOn('particles')) this.confetti.burst(0, this.wy(this.rects ? this.rects.carousel.y : this.ch * 0.45), 0.6, PACK_W);
    this.ui.toast(on ? '已加入最愛,會放在首頁櫥窗' : '已從最愛移除');
    if (this.cat === 'fav' && !on) this.updateSelect();
    else this.syncFocusUI();
    this.updateHome();
  }

  /* ---------- 卡包節點:首頁櫥窗 / 選擇頁輪播 共用 ---------- */
  disposeNodes() {
    this.nodes.forEach((n) => {
      this.scene.remove(n.holder);
      n.pack.dispose();
      n.shadow.geometry.dispose();
      n.shadow.material.dispose();
    });
    this.nodes = [];
  }
  async buildNodes() {
    const gen = ++this.nodeGen;
    const list = store.getPacks();
    const imgs = await Promise.all(list.map((p) => loadImage(p.cover.img)));
    await fontReady;
    if (!this.alive || gen !== this.nodeGen) return;
    this.disposeNodes();
    this.nodes = list.map((data, i) => {
      const holder = new THREE.Group();
      const pack = createPack(data, { lite: true, coverImg: imgs[i] });
      holder.add(pack.group);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 3.2),
        new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.3 })
      );
      shadow.position.set(0.14, -0.14, -0.5);
      shadow.raycast = () => {};
      holder.add(shadow);
      holder.visible = false;
      this.scene.add(holder);
      const node = {
        data, img: imgs[i], holder, pack, shadow, i, hidden: false,
        idx: new Spring(i, { k: 110, c: 15 }),
        vis: new Spring(1, { k: 120, c: 16 }),
        jx: new Spring(0, { k: CONFIG.jelly.k, c: CONFIG.jelly.c }),
        jy: new Spring(0, { k: CONFIG.jelly.squashK, c: CONFIG.jelly.squashC }),
        sw: new Spring(0, { k: 24, c: 1.8 }),
        press: false,
      };
      pack.hit.userData.node = node;
      return node;
    });
    this.retarget();
  }
  nodeOf(data) { return this.nodes.find((n) => n.data === data); }
  bounceNode(id) {
    const n = this.nodes.find((x) => x.data.id === id);
    if (n) { n.jy.v += 3.5; n.sw.v += 1.5; }
  }

  // 每個 frame:算出每個卡包的位置 = 首頁櫥窗位置 ↔ 輪播位置 用 sm 混合
  poseNodes(dt) {
    const R = this.rects;
    if (!R || !this.nodes.length) return;
    const pw = this.px2w();
    const shelf = this.shelfIds || [];
    const m = this.sm.x;
    const dmix = 1 - clamp(this.dm.x, 0, 1);
    // 輪播
    const c = R.carousel;
    const s0 = Math.min((c.h * 0.9 * pw) / PACK_H, (c.w * 0.54 * pw) / PACK_W);
    const cx = this.wx(c.x), cy = this.wy(c.y);
    this.stepPx = (PACK_W * s0 * 0.78) / pw; // 輪播拖多少 px 換一個
    const fv = this.focus.v;
    for (const n of this.nodes) {
      n.idx.step(dt); n.vis.step(dt);
      // 櫥窗
      const si = shelf.indexOf(n.data.id);
      let hx, hy, hs, hyaw, hrz, hz = 0;
      if (si >= 0 && R.shelf[si]) {
        // 櫥窗:最多三包,中間那包最大、在最前面,兩側略小、微微轉向中間(包可以比欄位寬,疊在一起)
        const r = R.shelf[si];
        const o = si - (shelf.length - 1) / 2;
        const fan = shelf.length >= 3; // 三包:中間那包大、壓在兩側前面;一或兩包:各自站好、不重疊
        hx = this.wx(r.x); hy = this.wy(r.y) - (fan ? Math.abs(o) * 0.05 : 0);
        hs = Math.min((r.h * 0.92 * pw) / PACK_H, (r.w * (fan ? 1.4 : 0.96) * pw) / PACK_W) * (fan ? 1.04 - 0.14 * Math.abs(o) : 1);
        hyaw = -o * (fan ? 0.34 : 0.2);
        hrz = o * 0.05;
        hz = -Math.abs(o) * 0.5;
      } else {
        hx = this.wx(R.shelfBox.x); hy = this.wy(R.shelfBox.y); hs = 0; hyaw = 0; hrz = 0;
      }
      // 輪播
      const o = n.idx.x - this.focus.x;
      const a = Math.abs(o);
      const sc = a <= 1 ? 1 - 0.34 * a : Math.max(0, 0.66 - (a - 1) * 0.45);
      const dx = PACK_W * s0 * (a <= 1 ? 0.78 * a : 0.78 + (a - 1) * 0.52);
      const sx = cx + Math.sign(o) * dx;
      const sy = cy - a * 0.03;
      const ss = s0 * sc * clamp(n.vis.x, 0, 1.1);
      const syaw = -clamp(o, -1, 1) * 0.55;
      const srz = clamp(o, -1, 1) * 0.05;
      const sz = -Math.min(a, 1.6) * 0.8;

      const x = lerp(hx, sx, m), y = lerp(hy, sy, m), z = lerp(hz, sz, m);
      const s = lerp(hs, ss, m) * dmix * (n.hidden ? 0 : 1);
      const idle = this.reduced ? 0 : Math.sin(this.time * 0.9 + n.i * 1.7) * 0.012;
      n.holder.position.set(x, y, z);
      n.holder.scale.setScalar(Math.max(0.0001, s));
      n.holder.visible = s > 0.004;
      n.holder.rotation.set(0, lerp(hyaw, syaw, m), lerp(hrz, srz, m) + idle);
      // 果凍:輪播滑動的速度 → 歪斜;按下 → 凹
      n.jx.t = clamp(-fv * 0.05 * m, -0.22, 0.22);
      n.jx.step(dt);
      n.jy.t = n.press ? 0.04 : 0;
      n.jy.step(dt);
      n.pack.setJelly(n.jx.x, n.jy.x, -n.jy.x * 3.5);
    }
  }
  pickNode(x, y) {
    const objs = this.nodes.filter((n) => n.holder.visible).map((n) => n.pack.hit);
    if (!objs.length) return null;
    const hit = this.ray(x, y).intersectObjects(objs, false)[0];
    return hit ? hit.object.userData.node : null;
  }

  /* ---------- 導覽 ---------- */
  push(screen) {
    this.depth++;
    try { history.pushState({ s: screen }, ''); } catch (_) { /* ignore */ }
  }
  replace(screen) {
    try { history.replaceState({ s: screen }, ''); } catch (_) { /* ignore */ }
  }
  // 返回:優先走瀏覽器歷史(手機返回鍵才會一致)
  back() {
    if (this.depth > 0) history.back();
    else this.stepBack();
  }
  onPop() {
    if (this._silent) { this._silent = false; this.depth = 0; return; }
    if (this.depth > 0) this.depth--;
    this.stepBack(true);
  }
  stepBack() {
    if (this.sheetOpen) return;
    if (this.screen === 'draw') this.leaveDraw();
    else if (this.screen === 'results') this.goHome(false);
    else if (this.screen === 'select') this.goHome(false);
  }
  setScreen(s) {
    this.screen = s;
    this.ui.showScreen(s);
  }
  goSelect(id) {
    if (this.screen !== 'home') return;
    this.cat = 'all';
    const list = this.carouselList();
    const k = list.findIndex((p) => p.id === id);
    this.fi = k >= 0 ? k : 0;
    this.focus.snap(this.fi);
    this.setScreen('select');
    this.sm.t = 1;
    this.updateSelect();
    this.push('select');
    buzz(8);
    if (id) this.bounceNode(id);
  }
  goHome(reset) {
    if (reset && this.depth > 0) { this._silent = true; const d = this.depth; this.depth = 0; history.go(-d); }
    this.gen++;
    this.timers.length = 0;
    this.clearPack();
    this.clearGhosts();
    this.results.hide();
    this.nodes.forEach((n) => (n.hidden = false));
    this.setScreen('home');
    this.sm.t = 0;
    this.dm.t = 0;
    this.state = 'idle';
    this.updateHome();
  }
  leaveDraw() {
    this.gen++;
    this.timers.length = 0;
    this.clearPack();
    this.clearGhosts();
    this.nodes.forEach((n) => (n.hidden = false));
    this.setScreen('select');
    this.dm.t = 0;
    this.state = 'idle';
    this.session = null;
    this.updateSelect();
  }

  /* ---------- 開包:一包 / 十包 ---------- */
  async startDraw(count) {
    const from = this.screen;
    if (from !== 'select' && from !== 'results') return;
    const data = from === 'results' && this.session ? this.session.data : this.focusedPack();
    if (!data) return;
    const node = this.nodeOf(data);
    if (!data.cards.length) {
      this.ui.toast('這個卡包還沒有卡片,先加幾張照片吧');
      if (node) node.jy.v += 3;
      this.editor.openPack(data);
      return;
    }
    this.gen++;
    this.timers.length = 0;
    this.results.hide();
    this.session = {
      data, count, i: 0,
      packs: Array.from({ length: count }, () => ({ cards: store.drawFrom(data), flags: [] })),
    };
    store.touchOpened(data);
    this.auto = false;
    this.deskLayout();
    this.shared.updateBack(CONFIG.style.packColors[data.color]);
    this.sessImg = await loadImage(data.cover.img);
    let pose = null;
    if (node && from === 'select') {
      node.holder.updateWorldMatrix(true, false);
      pose = { x: node.holder.position.x, y: node.holder.position.y, s: node.holder.scale.x, rz: node.holder.rotation.z };
    }
    this.setScreen('draw');
    if (from === 'results') this.replace('draw'); // 結果 → 再抽一次:取代這一層歷史,返回鍵才不會多按
    else this.push('draw');
    this.nodes.forEach((n) => { if (n.data === data) n.hidden = true; });
    this.dm.t = 1;
    this.sm.t = 1;
    buzz(10);
    this.beginPack(0, pose);
  }

  async beginPack(i, from) {
    const S = this.session;
    if (!S) return;
    const gen = ++this.gen;
    this.clearPack();
    S.i = i;
    this.state = 'loading';
    this.syncDrawUI();
    this.buildPack(S.data, this.sessImg);
    const sc = this.deskScale;
    if (from) { this.px.snap(from.x); this.py.snap(from.y); this.ps.snap(from.s); this.rz.snap(from.rz || 0); }
    else { this.px.snap(0); this.py.snap(this.deskY - 0.6); this.ps.snap(sc * 0.85); this.rz.snap(0); }
    this.px.t = 0; this.py.t = this.deskY; this.ps.t = sc; this.rz.t = 0;
    this.packRoot.position.set(this.px.x, this.py.x, 0);
    this.packRoot.scale.setScalar(this.ps.x);
    this.syncGhosts();
    const ok = await this.prepareCards(S.packs[i].cards, gen);
    if (!ok) return;
    this.state = 'arriving';
    this.syncDrawUI();
    this.after(this.reduced ? 0.05 : 0.8, () => {
      if (gen !== this.gen || this.state !== 'arriving') return;
      this.state = 'pack';
      this.syncDrawUI();
      if (this.auto) this.after(0.45, () => this.autoTear(gen));
    });
  }

  async prepareCards(picks, gen) {
    const photos = await Promise.all(picks.map((c) => loadImage(c.photo)));
    if (!this.alive || gen !== this.gen) return false;
    this.cards = picks.map((d, i) => {
      const card = new Card(d, photos[i] || blankPhoto(), this.shared);
      card.k = this.cardK;
      card.onLand = (c) => this.onLand(c);
      card.place(0, -0.25, -0.05 + i * 0.01, 0);
      card.root.visible = false; // 藏在袋子裡,撕開時才現身
      this.scene.add(card.root);
      return card;
    });
    return true;
  }

  // 10 包:後面疊著還沒開的包,只露出上緣
  syncGhosts() {
    const S = this.session;
    const need = S && S.count > 1 ? Math.min(1, S.count - 1 - S.i) : 0;
    while (this.ghosts.length < need) {
      const d = this.ghosts.length + 1;
      const pack = createPack(S.data, { lite: true, coverImg: this.sessImg });
      this.scene.add(pack.group);
      const g = { pack, d: new Spring(d + 1, { k: 110, c: 14 }) };
      g.d.t = d;
      this.ghosts.push(g);
    }
    while (this.ghosts.length > need) this.disposeGhost(this.ghosts.pop());
    this.ghosts.forEach((g, k) => (g.d.t = k + 1));
  }
  disposeGhost(g) {
    this.scene.remove(g.pack.group);
    g.pack.dispose();
  }
  clearGhosts() {
    this.ghosts.forEach((g) => this.disposeGhost(g));
    this.ghosts = [];
  }
  stepGhosts(dt) {
    const sc = this.ps.t;
    for (const g of this.ghosts) {
      g.d.step(dt);
      const d = g.d.x;
      const gp = g.pack.group;
      gp.position.set(0, this.deskY + 0.14 * sc * d, -0.14 * d);
      gp.scale.setScalar(sc * (1 - 0.035 * d));
      gp.rotation.set(0, 0, Math.sin(d * 2.1) * 0.012);
    }
  }

  clearPack() {
    this.drag = null;
    this.selected = null;
    this.dissolveT = -1;
    this.cards.forEach((c) => c.dispose());
    this.cards = [];
    if (this.packRoot) this.removePackMesh();
    this.confetti.active = false;
    this.confetti.mesh.visible = false;
    this.dust.pts.visible = false;
    [this.tear, this.packY, this.yaw, this.pitch, this.jx, this.jy, this.hint, this.kick].forEach((s) => s.snap(0));
    this.capT = -1;
    this.collectFly = false;
    this.autoTearing = false;
  }

  buildPack(data, img) {
    this.pack = createPack(data, { coverImg: img });
    this.packRoot = new THREE.Group();
    this.packRoot.add(this.pack.group);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6),
      new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 })
    );
    this.glow.position.z = -0.7;
    this.glow.raycast = () => {};
    this.pshadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 3.6),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.2 })
    );
    this.pshadow.position.set(0.12, -0.18, -0.5);
    this.pshadow.raycast = () => {};
    this.packRoot.add(this.glow, this.pshadow);
    this.scene.add(this.packRoot);
  }
  removePackMesh() {
    if (!this.pack) return;
    this.scene.remove(this.packRoot);
    this.pack.dispose(); this.glow.material.dispose(); this.glow.geometry.dispose();
    this.pshadow.material.dispose(); this.pshadow.geometry.dispose();
    this.packRoot = this.pack = this.glow = this.pshadow = null;
  }

  syncDrawUI() {
    const S = this.session;
    if (!S) return;
    const multi = S.count > 1;
    const s = this.state;
    const hints = {
      pack: '沿著虛線橫向滑過去,把上緣切開',
      reveal: '點一下卡片翻面',
      done: '',
      collecting: '點一下可以跳到下一包',
    };
    this.ui.setDraw({
      mode: multi ? 'multi' : 'single',
      i: S.i + 1,
      total: S.count,
      auto: this.auto,
      next: s === 'done' && !multi,
      hintText: s === 'pack' && this.auto ? '' : hints[s] || '',
      canSkip: s !== 'loading' && s !== 'done',
    });
  }
  toggleAuto() {
    this.auto = !this.auto;
    buzz(8);
    this.syncDrawUI();
    if (this.auto && this.state === 'pack') this.autoTear(this.gen);
  }
  // 自動開包:割線自己被撕開
  autoTear(gen) {
    if (gen !== this.gen || this.state !== 'pack' || !this.auto) return;
    this.drag = null;
    this.lastSide = 1;
    this.autoTearing = true;
    this.hint.t = 1;
    this.tear.t = 1;
  }

  /* ---------- 輸入 ---------- */
  ndc(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  ray(x, y) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc(x, y), this.cam);
    return rc;
  }
  pickPack(x, y) {
    if (!this.pack) return null;
    this.pack.group.updateWorldMatrix(true, true);
    const hit = this.ray(x, y).intersectObject(this.pack.hit, false)[0];
    return hit ? hit.point : null;
  }
  nearCut(point) {
    const l = this.pack.group.worldToLocal(point.clone());
    return Math.abs(l.y - this.pack.tearY) < 0.26 && Math.abs(l.x) <= this.pack.width / 2 + 0.05;
  }
  packScreenW() {
    const a = new THREE.Vector3(-this.pack.width / 2, 0, 0).applyMatrix4(this.packRoot.matrixWorld).project(this.cam);
    const b = new THREE.Vector3(this.pack.width / 2, 0, 0).applyMatrix4(this.packRoot.matrixWorld).project(this.cam);
    return Math.abs(b.x - a.x) * 0.5 * this.canvas.clientWidth;
  }
  onDown(e) {
    if (!e.isPrimary || this.sheetOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.ptr.x = e.clientX;
    this.ptr.y = e.clientY;
    this.ptr.mouse = e.pointerType === 'mouse';
    if (this.screen === 'select') {
      if (!this.carouselList().length) return;
      const node = this.pickNode(e.clientX, e.clientY);
      this.drag = { kind: 'car', node, x0: e.clientX, f0: this.focus.t, moved: false, lastX: e.clientX, vel: 0, id: e.pointerId };
      if (node) node.press = true;
    } else if (this.screen === 'draw') {
      if (this.state === 'collecting') { this.flyCards(this.gen); return; }
      if (this.state === 'pack') {
        const pt = this.pickPack(e.clientX, e.clientY);
        if (!pt) return;
        if (this.autoTearing) return;
        const n = Math.round(this.yaw.t / Math.PI);
        const settled = Math.abs(this.yaw.x - n * Math.PI) < 0.3 && Math.abs(this.pitch.x) < 0.2;
        const facing = Math.abs(n) % 2 === 0 ? 1 : -1;
        const sSide = pt.x < this.packRoot.position.x ? 1 : -1;
        if (settled && this.nearCut(pt)) {
          this.hint.t = 1;
          this.drag = { kind: 'tear', x0: e.clientX, y0: e.clientY, sSide, side: sSide * facing, moved: false, w: this.packScreenW() * 0.82, id: e.pointerId };
        } else {
          this.press = true;
          this.drag = { kind: 'turn', x0: e.clientX, y0: e.clientY, yaw0: this.yaw.t, lastX: e.clientX, vyaw: 0, moved: false, id: e.pointerId };
        }
      } else if ((this.state === 'reveal' || this.state === 'done') && this.cards.length) {
        const hits = this.ray(e.clientX, e.clientY).intersectObjects(this.cards.map((c) => c.root), true);
        let card = null;
        for (const h of hits) {
          let o = h.object;
          while (o && !o.userData.card) o = o.parent;
          if (o) { card = o.userData.card; break; }
        }
        if (card) this.drag = { kind: 'card', card, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
        else { if (this.selected) this.select(null); return; }
      } else return;
    } else return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  onUp(e) {
    const d = this.drag;
    if (!d || (d.id !== undefined && e.pointerId !== d.id)) return;
    this.drag = null;
    if (d.kind === 'car') {
      if (d.node) { d.node.press = false; d.node.jy.v -= 2.5; }
      const n = this.carouselList().length;
      if (!d.moved) {
        // 點一下:點到側邊的卡包就移過去;點中間的卡包軟軟彈一下
        if (d.node) {
          const k = this.carouselList().indexOf(d.node.data);
          if (k >= 0 && k !== this.fi) { this.fi = k; this.focus.t = k; this.syncFocusUI(); buzz(6); }
          else d.node.jy.v += 3;
        }
      } else {
        const k = clamp(Math.round(this.focus.t - d.vel * 0.16), 0, n - 1);
        if (k !== this.fi) { this.fi = k; this.syncFocusUI(); buzz(6); }
        this.focus.t = this.fi;
      }
    } else if (d.kind === 'tear') {
      this.hint.t = 0;
      if (!d.moved) {
        this.hint.t = 1;
        this.after(0.45, () => (this.hint.t = 0));
        this.kick.v = 4;
      }
      this.tear.t = 0;
    } else if (d.kind === 'turn') {
      this.press = false;
      this.jy.v -= 2.2;
      if (d.moved) {
        this.yaw.t = Math.round((this.yaw.t + d.vyaw * 0.18) / Math.PI) * Math.PI;
        this.pitch.t = 0;
      } else if (this.time - this.lastTap < 0.35) {
        this.yaw.t = Math.round(this.yaw.t / Math.PI) * Math.PI + Math.PI;
        this.lastTap = -9;
      } else {
        this.lastTap = this.time;
      }
    } else if (d.kind === 'card') {
      d.card.setTilt(0, 0);
      if (!d.moved) this.tapCard(d.card);
    }
  }
  tapCard(card) {
    if (!card.faceUp) {
      if (this.reduced) card.setFaceUp(true, true);
      else card.setFaceUp(true);
      this.select(card);
      buzz(8);
      if (this.reduced) this.onLand(card);
    } else this.select(card === this.selected ? null : card);
  }
  select(card) {
    if (this.selected && this.selected !== card) {
      this.selected.setSelected(false);
      const i = this.cards.indexOf(this.selected);
      const s = this.slot(i);
      this.selected.moveTo(s.x, s.y, s.z, s.rz);
    }
    this.selected = card;
    if (card) {
      const W = HW * this.aspect;
      card.setSelected(true, clamp((W * 0.82) / CARD_W / this.cardK, 1.1, 1.5)); // 點開單卡:到畫面中央放大
      card.moveTo(0, 0.15, 1.0, 0);
    }
  }
  applyDrag(dt) {
    const d = this.drag;
    if (!d) return;
    const dx = this.ptr.x - d.x0;
    const dy = this.ptr.y - (d.y0 ?? 0);
    if (!d.moved && Math.hypot(dx, d.y0 === undefined ? 0 : dy) > 7) d.moved = true;
    if (d.kind === 'car') {
      if (d.moved) {
        if (d.node) d.node.press = false;
        const n = this.carouselList().length;
        const raw = d.f0 - dx / Math.max(60, this.stepPx || 160);
        // 兩端有一點橡皮筋阻力
        this.focus.t = raw < 0 ? raw * 0.35 : raw > n - 1 ? n - 1 + (raw - (n - 1)) * 0.35 : raw;
        const v = (-(this.ptr.x - d.lastX) / Math.max(60, this.stepPx || 160)) / Math.max(dt, 0.001);
        d.vel += (v - d.vel) * 0.25;
        d.lastX = this.ptr.x;
        // 滑到哪個,資訊就跟著換
        const k = clamp(Math.round(this.focus.t), 0, n - 1);
        if (k !== this.fi) { this.fi = k; this.syncFocusUI(); buzz(4); }
      }
    } else if (d.kind === 'tear') {
      this.tear.t = clamp((dx * d.sSide) / d.w, 0, 1);
      if (this.tear.x >= 0.965 && this.state === 'pack') this.open();
    } else if (d.kind === 'turn' && d.moved) {
      this.press = false;
      const k = 0.012;
      this.yaw.t = d.yaw0 + dx * k;
      this.pitch.t = clamp(dy * 0.004, -0.3, 0.3);
      const v = ((this.ptr.x - d.lastX) * k) / Math.max(dt, 0.001);
      d.vyaw += (v - d.vyaw) * 0.3;
      d.lastX = this.ptr.x;
    } else if (d.kind === 'card' && d.moved) {
      const k = this.canvas.clientWidth < 500 ? 260 : 360;
      d.card.setTilt(clamp(dy / k, -0.7, 0.7), clamp(dx / k, -0.95, 0.95));
    }
  }

  /* ---------- 撕開 ---------- */
  open() {
    const gen = this.gen;
    this.state = 'opening';
    this.openDir = this.drag?.sSide || 1;
    this.openFacing = Math.abs(Math.round(this.yaw.t / Math.PI)) % 2 === 0 ? 1 : -1;
    this.drag = null;
    this.autoTearing = false;
    this.hint.t = 0;
    this.tear.t = 1;
    this.cards.forEach((c) => (c.root.visible = true));
    this.capT = 0;
    this.syncDrawUI();
    const T = CONFIG.timing;
    const P = this.pack;
    const multi = this.session.count > 1;
    this.ghosts.forEach((g) => (g.d.t = 0.4)); // 後面疊的包先靠回去,卡片飛出來時畫面乾淨
    const topRare = this.cards.reduce((m, c) => (c.data.rarity === 'super_rare' ? 2 : c.data.rarity === 'rare' ? Math.max(m, 1) : m), 0);
    if (this.fxOn('flash')) this.ui.flash('black', 0.22, 0.2);
    if (this.fxOn('particles')) this.confetti.burst(0, this.packRoot.position.y + P.tearY * this.ps.x, 0.45, P.width * 0.9);
    buzz(18);
    if (this.fxOn('dissolve')) this.dissolveT = 0;
    else P.cap.visible = false;

    const mid = (this.cards.length - 1) / 2;
    this.cards.forEach((c, i) => {
      this.after(T.cardRise + i * T.cardStagger, () => c.moveTo((i - mid) * 0.14, 0.7, -0.02 + i * 0.01, 0));
    });
    this.after(multi ? T.packExit * 0.7 : T.packExit, () => {
      this.packY.t = -6;
      this.cards.forEach((c, i) => { const s = this.slot(i); c.moveTo(s.x, s.y, s.z, s.rz); });
    });
    if (multi) {
      this.runCollect(gen, topRare);
    } else {
      this.after(T.foretell, () => {
        if (this.state !== 'opening') return;
        this.state = 'reveal';
        this.syncDrawUI();
        const top = this.cards[this.cards.length - 1];
        if (top && top.data.rarity !== 'normal' && !top.faceUp) top.tremble = true;
      });
    }
  }

  // 十連抽:卡片升起 → 一張張自動翻開 → 停一下 → 飛走 → 下一包
  runCollect(gen, topRare) {
    const T = CONFIG.timing;
    this.state = 'collecting';
    this.syncDrawUI();
    const n = this.cards.length;
    const t0 = T.packExit * 0.7 + 0.35;
    this.cards.forEach((c, i) => this.after(t0 + i * 0.16, () => { if (gen === this.gen) c.setFaceUp(true); }));
    const hold = topRare === 2 ? 1.7 : topRare === 1 ? 1.2 : 0.7;
    this.collectFly = false;
    this.after(t0 + n * 0.16 + 0.5 + hold, () => this.flyCards(gen));
  }
  flyCards(gen) {
    if (gen !== this.gen || this.collectFly || this.state !== 'collecting') return;
    this.collectFly = true;
    this.cards.forEach((c, i) => {
      this.after(i * 0.05, () => {
        c.tremble = false;
        c.moveTo(((i - (this.cards.length - 1) / 2) * 0.5) * this.cardK, -3.6, 0.6, (i - 1) * 0.4);
      });
    });
    this.after(0.5, () => { if (gen === this.gen) this.nextPack(); });
  }
  nextPack() {
    const S = this.session;
    if (!S) return;
    if (S.i + 1 >= S.count) { this.toResults(); return; }
    // 疊在後面的下一包走上來
    const g0 = this.ghosts.shift();
    let from = null;
    if (g0) {
      from = { x: 0, y: g0.pack.group.position.y, s: g0.pack.group.scale.x, rz: 0 };
      this.disposeGhost(g0);
    }
    this.beginPack(S.i + 1, from);
  }

  skip() {
    const S = this.session;
    if (!S) return;
    if (S.count > 1) { this.toResults(); return; }
    this.timers.length = 0;
    this.drag = null;
    this.removePackMesh();
    this.confetti.active = false;
    this.confetti.mesh.visible = false;
    this.cards.forEach((c, i) => {
      const s = this.slot(i);
      c.root.visible = true;
      c.place(s.x, s.y, s.z, s.rz);
      c.setSelected(false);
      c.tremble = false;
      c.setFaceUp(true, true);
    });
    this.selected = null;
    this.state = 'done';
    this.syncDrawUI();
  }

  toResults() {
    const S = this.session;
    if (!S || this.screen === 'results') return;
    this.gen++;
    this.timers.length = 0;
    const all = S.packs.flatMap((p) => p.cards);
    const flags = store.markSeen(all);
    let k = 0;
    S.packs.forEach((p) => { p.flags = p.cards.map(() => flags[k++]); });
    this.setScreen('results');
    this.replace('results'); // 開包 → 結果:同一層
    this.results.show({ name: S.data.name, count: S.count, packs: S.packs });
    // 結果頁是不透明的整頁,3D 的包/卡/疊包立刻清掉,後面不留任何東西
    this.clearPack();
    this.clearGhosts();
  }

  onLand(card) {
    const r = card.data.rarity;
    if (r === 'super_rare') {
      if (this.fxOn('particles')) this.dust.start(HW * this.aspect / 2, HW / 2);
      this.ui.stamp('SSR');
      if (this.fxOn('flash')) this.ui.flash('black', 0.3, 0.45);
      buzz([24, 40, 24, 40, 60]);
    } else if (r === 'rare') {
      this.ui.stamp('SR');
      buzz([16, 30, 16]);
    }
    if (this.session && this.session.count === 1 && this.cards.every((c) => c.faceUp && c._landed)) {
      this.after(0.5, () => {
        if (this.state === 'reveal') { this.state = 'done'; this.syncDrawUI(); }
      });
    }
  }

  /* ---------- 每個 frame ---------- */
  loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.cam);
  }

  step(dt) {
    const T = CONFIG.timing;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (t && this.time >= t.at) { this.timers.splice(i, 1); t.fn(); }
    }
    this.applyDrag(dt);
    this.sm.step(dt); this.dm.step(dt); this.focus.step(dt);
    this.poseNodes(dt);
    this.stepGhosts(dt);

    if (this.pack) {
      this.tear.step(dt);
      this.packY.step(dt);
      this.kick.t = 0;
      this.kick.step(dt);
      this.px.step(dt); this.py.step(dt); this.ps.step(dt); this.rz.step(dt);
      const p = clamp(this.tear.x, 0, 1);
      if (this.autoTearing && this.state === 'pack' && this.tear.x >= 0.965) this.open();
      this.yaw.step(dt);
      this.pitch.step(dt);
      this.pack.group.rotation.set(this.pitch.x, this.yaw.x, 0);
      this.pack.setTear(p, this.drag?.side || this.lastSide || 1, this.state === 'pack' && this.fxOn('slash'));
      if (this.drag?.side) this.lastSide = this.drag.side;

      if (this.state === 'pack' && this.ptr.mouse && !this.drag) {
        const pt = this.pickPack(this.ptr.x, this.ptr.y);
        this.hint.t = pt && this.nearCut(pt) ? 0.8 : 0;
        this.canvas.style.cursor = pt ? (this.nearCut(pt) ? 'ew-resize' : 'grab') : '';
      }
      this.hint.step(dt);
      this.pack.setHint(Math.max(0, this.hint.x));

      this.jx.t = this.state === 'pack' ? clamp(-this.yaw.v * CONFIG.jelly.turn, -0.22, 0.22) : 0;
      this.jx.step(dt);
      this.jy.t = this.press ? 0.04 : 0;
      this.jy.step(dt);
      this.pack.setJelly(this.jx.x, this.jy.x, -this.jy.x * 3.5);

      const idle = this.state === 'pack' && this.fxOn('shake') ? Math.sin((this.time * Math.PI * 2) / T.shake) * 0.01 * (1 - p) : 0;
      this.packRoot.rotation.z = this.rz.x + idle + this.kick.x * 0.05;
      this.packRoot.scale.setScalar(Math.max(0.0001, this.ps.x));
      this.packRoot.position.set(this.px.x, this.py.x + this.packY.x, 0);
      if (this.capT >= 0) {
        this.capT += dt;
        const t = Math.min(1, this.capT / T.capFly);
        const e = easeOut(t);
        const dir = this.openDir * this.openFacing;
        const cp = this.pack.capPivot;
        cp.position.set(dir * 1.7 * e, this.pack.tearY + 1.5 * e, 0.6 * e);
        cp.rotation.set(0.9 * e, 0, -dir * 1.6 * e);
        this.pack.setInner(0.85 * (1 - clamp(this.capT / 0.7, 0, 1)));
      }
      if (this.dissolveT >= 0) {
        this.dissolveT += dt / T.dissolve;
        this.pack.setDissolve(easeOut(Math.min(1, this.dissolveT)) * 0.98);
        if (this.dissolveT >= 1) { this.pack.cap.visible = false; this.dissolveT = -1; }
      }
      if (this.packY.x < -5) this.removePackMesh();
    }
    const fx = (n) => this.fxOn(n);
    this.cards.forEach((c) => c.update(dt, this.time, fx));
    this.confetti.update(dt);
    this.dust.update(dt);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this._mr);
    clearTimeout(this._mt);
    if (this.canvas && this.h) {
      this.canvas.removeEventListener('pointerdown', this.h.down);
      this.canvas.removeEventListener('pointermove', this.h.move);
      this.canvas.removeEventListener('pointerup', this.h.up);
      this.canvas.removeEventListener('pointercancel', this.h.up);
      this.canvas.removeEventListener('pointerleave', this.h.leave);
      this.canvas.removeEventListener('webglcontextlost', this.h.lost);
      window.removeEventListener('resize', this.h.resize);
      window.removeEventListener('popstate', this.h.pop);
      document.removeEventListener('visibilitychange', this.h.vis);
    }
    if (this.renderer) {
      this.clearPack();
      this.clearGhosts();
      this.disposeNodes();
      this.shared.dispose();
      this.confetti.dispose();
      this.dust.dispose();
      this.shadowTex.dispose();
      this.glowTex.dispose();
      this.envRT.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
    this.editor?.destroy();
    this.results?.destroy();
    this.ui.destroy();
  }
}

const app = new App(document.getElementById('app'));
window.__app = app; // 方便除錯與自動化測試
window.addEventListener('pagehide', () => app.destroy(), { once: true });
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
