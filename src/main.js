import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Spring, clamp } from './spring.js';
import * as store from './store.js';
import { drawShopWall, drawDesk, blankPhoto, radialTexture, canvasTexture } from './art.js';
import { makeEnvironment } from './env.js';
import { createPack } from './pack.js';
import { Card, createCardShared, CARD_W } from './card.js';
import { Confetti, GoldDust } from './particles.js';
import { createUI } from './ui.js';
import { createEditor } from './editor.js';

const FOV = 32;
const TAN = Math.tan((FOV / 2) * (Math.PI / 180));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const PACK_H = CONFIG.pack.height;

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

const fontReady = Promise.race([
  document.fonts ? document.fonts.load('700 24px Huninn', '週末小事日常').catch(() => {}) : Promise.resolve(),
  new Promise((r) => setTimeout(r, 1800)),
]);

class App {
  constructor(root) {
    this.root = root;
    this.alive = true;
    this.gen = 0; // 開包世代:換包/回卡店時讓還在載入的舊工作作廢
    this.shopGen = 0;
    this.time = 0;
    this.timers = [];
    this.cards = [];
    this.nodes = [];
    this.pack = null;
    this.view = 'shop'; // 'shop' | 'desk'
    this.state = 'loading';
    this.drag = null;
    this.ptr = { x: 0, y: 0, mouse: false };
    this.selected = null;
    this.sheetOpen = false;
    this.dissolveT = -1;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.deskData = null;
    this.lastTap = -9;

    this.ui = createUI(root, {
      onNewPack: () => this.editor.openPack(store.addPack({}), true),
      onEdit: (id) => this.editor.openPack(store.getPack(id)),
      onBack: () => this.goShop(),
      onSkip: () => this.skip(),
      onAgain: () => this.openAgain(),
    });
    this.editor = createEditor(root, {
      onOpen: () => (this.sheetOpen = true),
      onClose: () => { this.sheetOpen = false; this.buildShop(); },
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
    r.toneMapping = THREE.NeutralToneMapping; // 不會把白紙洗灰
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.key = new THREE.DirectionalLight('#fff6ea', 0.85);
    this.key.position.set(-3, 4, 6);
    this.scene.add(this.key);
    this.envRT = makeEnvironment(r);
    this.scene.environment = this.envRT.texture;
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    this.shared = createCardShared('#5da4f5');
    this.confetti = new Confetti(this.scene);
    this.dust = new GoldDust(this.scene);

    this.glowTex = canvasTexture(radialTexture([[0, 'rgba(255,236,200,.8)'], [0.5, 'rgba(255,226,170,.25)'], [1, 'rgba(255,226,170,0)']], 256));
    this.shadowTex = canvasTexture(radialTexture([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']], 128));

    const S = CONFIG.spring;
    this.tear = new Spring(0, S.tear);
    this.packY = new Spring(0, S.packExit);
    this.kick = new Spring(0, { k: 120, c: 7 });
    this.yaw = new Spring(0, S.turn); // 卡包翻轉(0 = 正面, π = 背面)
    this.pitch = new Spring(0, S.tilt);
    // 果凍:左右歪斜 jx、壓扁/拉長 jy(放手會彈回去、過頭再回來)
    this.jx = new Spring(0, { k: CONFIG.jelly.k, c: CONFIG.jelly.c });
    this.jy = new Spring(0, { k: CONFIG.jelly.squashK, c: CONFIG.jelly.squashC });
    this.hint = new Spring(0, { k: 200, c: 22 });
    // 卡包在桌面上的位置 / 大小 / 傾斜(從卡店走過來時用)
    const mv = { k: 70, c: 12 };
    this.px = new Spring(0, mv); this.py = new Spring(-0.05, mv); this.ps = new Spring(1, mv); this.rz = new Spring(0, { k: 60, c: 9 });
    this.camD = new Spring(10, { k: 60, c: 13 }); this.camY = new Spring(0, { k: 60, c: 13 });
    this.shopX = new Spring(0, { k: 90, c: 15 });
    this.shopOut = new Spring(0, { k: 42, c: 8.5 });
    this.capT = -1;
    this.clock = new THREE.Clock();

    this.bind();
    this.resize(true);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    store.loadPacks().then(() => {
      if (!this.alive) return;
      this.state = 'shop';
      this.buildShop();
    });
  }

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
    };
    c.addEventListener('pointerdown', this.h.down);
    c.addEventListener('pointermove', this.h.move);
    c.addEventListener('pointerup', this.h.up);
    c.addEventListener('pointercancel', this.h.up);
    c.addEventListener('pointerleave', this.h.leave);
    c.addEventListener('webglcontextlost', this.h.lost);
    window.addEventListener('resize', this.h.resize);
    document.addEventListener('visibilitychange', this.h.vis);
  }
  fxOn(name) {
    return !this.reduced && CONFIG.fx.enabled && CONFIG.fx[name];
  }
  after(sec, fn) {
    this.timers.push({ at: this.time + sec, fn });
  }

  /* ---------- 版面 / 鏡頭 ---------- */
  frameFor(view) {
    const n = this.cards.length || this.deskData?.perOpen || CONFIG.pack.cardsPerPack;
    if (view === 'shop') {
      const needW = this.aspect < 0.85 ? 4.3 : 8;
      return { d: Math.max(5.0 / 2 / TAN, needW / 2 / (TAN * this.aspect)), y: 0.25 };
    }
    const needW = (n - 1) * this.spread() + CARD_W + 0.5;
    return { d: Math.max(4.8 / 2 / TAN, needW / 2 / (TAN * this.aspect)), y: -0.2 };
  }
  applyFrame(snap) {
    const f = this.frameFor(this.view);
    if (snap) { this.camD.snap(f.d); this.camY.snap(f.y); }
    this.camD.t = f.d;
    this.camY.t = f.y;
  }
  resize(first) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.aspect = w / h;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = this.aspect;
    this.cam.updateProjectionMatrix();
    this.applyFrame(true);
    clearTimeout(this._bgT);
    this._bgT = setTimeout(() => {
      drawShopWall(this.ui.bgShop, w, h, dpr);
      drawDesk(this.ui.bgDesk, w, h, dpr);
    }, first ? 0 : 80);
    if (this.cards.length && (this.state === 'reveal' || this.state === 'done')) {
      this.cards.forEach((c, i) => { const s = this.slot(i); if (c !== this.selected) c.moveTo(s.x, s.y, s.z, s.rz); });
    }
    this.clampShop(true);
  }
  spread() {
    return this.aspect < 0.85 ? 0.74 : 1.32;
  }
  slot(i) {
    const n = this.cards.length || CONFIG.pack.cardsPerPack;
    const o = i - (n - 1) / 2;
    const portrait = this.aspect < 0.85;
    return { x: o * this.spread(), y: 0.12 - Math.abs(o) * (portrait ? 0.02 : 0.04), z: 0.35 + i * 0.02, rz: -o * (portrait ? 0.1 : 0.08) };
  }

  /* ---------- 卡店:一排吊著的卡包 ---------- */
  disposeShop() {
    if (!this.shopG) return;
    this.scene.remove(this.shopG);
    this.nodes.forEach((n) => { n.pack.dispose(); n.thread.geometry.dispose(); n.thread.material.dispose(); n.shadow.geometry.dispose(); n.shadow.material.dispose(); });
    this.railMesh.geometry.dispose();
    this.railMesh.material.dispose();
    this.shopG = null;
    this.nodes = [];
  }
  async buildShop() {
    const gen = ++this.shopGen;
    const list = store.getPacks();
    const imgs = await Promise.all(list.map((p) => (p.cover.img ? loadImage(p.cover.img) : null)));
    await fontReady; // 圓體載入後再畫卡包文字
    if (!this.alive || gen !== this.shopGen || this.view !== 'shop') return;
    this.disposeShop();
    const S = CONFIG.shop;
    const hh = PACK_H / 2;
    const g = new THREE.Group();
    const railLen = Math.max(60, list.length * S.gap + 40);
    this.railMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, railLen, 14).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#26282b', metalness: 0.75, roughness: 0.35 })
    );
    this.railMesh.position.set(0, S.rail, -0.05);
    this.railMesh.raycast = () => {};
    g.add(this.railMesh);
    const tg = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6).translate(0, -0.5, 0);
    this.nodes = list.map((data, i) => {
      const pivot = new THREE.Group();
      const hang = new THREE.Group();
      const pack = createPack(data, { lite: true, coverImg: imgs[i] });
      hang.add(pack.group);
      hang.scale.setScalar(S.scale);
      hang.position.y = -(S.thread + hh * S.scale);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 3.3),
        new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.16 })
      );
      shadow.position.set(0.14, -0.12, -0.55);
      shadow.raycast = () => {};
      hang.add(shadow);
      const thread = new THREE.Mesh(tg.clone(), new THREE.MeshBasicMaterial({ color: '#4a4c52' }));
      thread.scale.y = S.thread + 0.04;
      thread.raycast = () => {};
      pivot.add(thread, hang);
      g.add(pivot);
      const node = {
        data, img: imgs[i], pivot, hang, pack, thread, shadow, i,
        sw: new Spring(0, { k: 20, c: 1.3 }), // 單擺:幅度慢慢衰減
        jx: new Spring(0, { k: CONFIG.jelly.k, c: CONFIG.jelly.c }),
        jy: new Spring(0, { k: CONFIG.jelly.squashK, c: CONFIG.jelly.squashC }),
        press: false,
      };
      pack.hit.userData.node = node;
      return node;
    });
    tg.dispose();
    this.shopG = g;
    g.position.y = this.shopOut.x;
    this.scene.add(g);
    this.ui.setLabels(list.map((p) => ({ id: p.id, name: p.name, n: p.cards.length })));
    this.ui.setEmpty(list.length === 0);
    this.clampShop(true);
    this.syncUI();
  }
  shopRange() {
    const n = this.nodes.length;
    const halfW = this.camD.t * TAN * this.aspect;
    const total = (n - 1) * CONFIG.shop.gap;
    return Math.max(0, total / 2 + CONFIG.shop.gap * 0.62 - halfW);
  }
  clampShop(snap) {
    const m = this.shopRange();
    this.shopX.t = clamp(this.shopX.t, -m, m);
    if (snap) this.shopX.x = clamp(this.shopX.x, -m, m);
  }
  nodeX(i) {
    return (i - (this.nodes.length - 1) / 2) * CONFIG.shop.gap + this.shopX.x;
  }

  goShop() {
    this.gen++;
    this.clearPack();
    this.cam.updateMatrixWorld();
    this.view = 'shop';
    this.state = 'shop';
    this.root.classList.remove('desk');
    this.shopOut.snap(this.reduced ? 0 : 8);
    this.shopOut.t = 0;
    this.applyFrame(false);
    this.buildShop();
    this.syncUI();
  }

  /* ---------- 選一包 → 走到書桌 ---------- */
  async selectPack(n) {
    if (this.state !== 'shop') return;
    const data = n.data;
    if (!data.cards.length) {
      this.ui.toast('這個卡包還沒有卡片,先加幾張照片吧');
      n.jy.v += 3;
      this.editor.openPack(data);
      return;
    }
    const gen = ++this.gen;
    this.state = 'selecting';
    this.deskData = data;
    this.ui.setLabelsVisible(false);
    this.syncUI();
    n.hang.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3().setFromMatrixPosition(n.hang.matrixWorld);
    // 在卡店裡掛著的那包是低解析版;同一個位置換上高解析版,同時把吊線收掉(選下去就取下來了)
    this.buildPack(data, n.img);
    this.px.snap(wp.x); this.py.snap(wp.y); this.ps.snap(CONFIG.shop.scale); this.rz.snap(n.pivot.rotation.z);
    this.px.t = 0; this.py.t = -0.05; this.ps.t = 1; this.rz.t = 0;
    n.hang.visible = false;
    n.thread.visible = false;
    this.view = 'desk';
    this.root.classList.add('desk');
    this.shopOut.t = 9;
    this.applyFrame(false);
    const ok = this.prepareCards(data, gen);
    this.after(this.reduced ? 0.05 : 0.95, async () => {
      if (!(await ok) || gen !== this.gen) return;
      this.disposeShop();
      this.beginDesk();
    });
  }

  /* ---------- 一包的生命週期 ---------- */
  clearPack() {
    this.timers.length = 0;
    this.drag = null;
    this.selected = null;
    this.dissolveT = -1;
    this.cards.forEach((c) => c.dispose());
    this.cards = [];
    if (this.packRoot) {
      this.scene.remove(this.packRoot);
      this.pack?.dispose();
      this.glow?.material.dispose();
      this.glow?.geometry.dispose();
      this.pshadow?.material.dispose();
      this.pshadow?.geometry.dispose();
      this.packRoot = this.pack = this.glow = this.pshadow = null;
    }
    this.confetti.active = false;
    this.confetti.mesh.visible = false;
    this.dust.pts.visible = false;
    [this.tear, this.packY, this.yaw, this.pitch, this.jx, this.jy, this.hint, this.kick].forEach((s) => s.snap(0));
    this.capT = -1;
  }

  async prepareCards(data, gen) {
    const picks = store.drawFrom(data);
    const photos = await Promise.all(picks.map((c) => (c.photo ? loadImage(c.photo) : null)));
    if (!this.alive || gen !== this.gen) return false;
    this.shared.updateBack(CONFIG.style.packColors[data.color]); // 卡背跟卡包同色系
    this.cards = picks.map((d, i) => {
      const card = new Card(d, photos[i] || blankPhoto(), this.shared);
      card.onLand = (c) => this.onLand(c);
      card.place(0, -0.25, -0.05 + i * 0.01, 0);
      card.root.visible = false; // 藏在袋子裡,撕開時才現身(包才能自由翻轉)
      this.scene.add(card.root);
      return card;
    });
    this.applyFrame(false);
    return true;
  }

  beginDesk() {
    if (this.reduced) {
      this.scene.remove(this.packRoot);
      this.pack.dispose(); this.glow.material.dispose(); this.glow.geometry.dispose(); this.pshadow.material.dispose(); this.pshadow.geometry.dispose();
      this.packRoot = this.pack = this.glow = this.pshadow = null;
      this.cards.forEach((c, i) => { const s = this.slot(i); c.root.visible = true; c.place(s.x, s.y, s.z, s.rz); });
      this.state = 'reveal';
    } else {
      this.state = 'pack';
    }
    this.syncUI();
  }

  async openAgain() {
    const data = this.deskData;
    if (!data) return;
    const gen = ++this.gen;
    const img = data.cover.img ? await loadImage(data.cover.img) : null;
    if (gen !== this.gen) return;
    this.clearPack();
    this.state = 'loading';
    this.syncUI();
    this.buildPack(data, img);
    this.px.snap(0); this.py.snap(-0.05); this.ps.snap(1); this.rz.snap(0);
    if (!(await this.prepareCards(data, gen))) return;
    this.beginDesk();
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
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.34 })
    );
    this.pshadow.position.set(0.12, -0.18, -0.5); // 躺在桌面上的卡包,影子貼在後面
    this.pshadow.raycast = () => {};
    this.packRoot.add(this.glow, this.pshadow);
    this.packRoot.position.set(this.px.x, this.py.x, 0);
    this.scene.add(this.packRoot);
  }

  syncUI() {
    const s = this.state;
    this.ui.setMode({
      view: this.view,
      shop: s === 'shop',
      skip: this.view === 'desk' && (s === 'pack' || s === 'opening' || s === 'reveal'),
      again: s === 'done',
      back: this.view === 'desk' && s !== 'loading' && s !== 'selecting',
    });
    const hints = {
      pack: '沿著虛線橫向滑過去,把上緣切開 · 拖曳其他地方可以轉動卡包',
      reveal: '點一下卡片翻面,拖曳可以轉動',
      done: this.deskData ? `「${this.deskData.name}」開完了` : '',
    };
    this.ui.setHint(hints[s] || (s === 'shop' && this.nodes.length ? '點一個卡包拿下來開' : ''));
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
  pickShop(x, y) {
    if (!this.nodes.length) return null;
    const hit = this.ray(x, y).intersectObjects(this.nodes.map((n) => n.pack.hit), false)[0];
    return hit ? hit.object.userData.node : null;
  }
  pickPack(x, y) {
    if (!this.pack) return null;
    this.pack.group.updateWorldMatrix(true, true);
    const hit = this.ray(x, y).intersectObject(this.pack.hit, false)[0];
    return hit ? hit.point : null;
  }
  // 手指碰到的點是不是在割線那一條窄帶上
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
    if (this.state === 'shop') {
      const node = this.pickShop(e.clientX, e.clientY);
      this.drag = { kind: 'shop', node, x0: e.clientX, y0: e.clientY, moved: false, sx0: this.shopX.t, lastX: e.clientX, vel: 0, id: e.pointerId };
      if (node) node.press = true;
    } else if (this.state === 'pack') {
      const pt = this.pickPack(e.clientX, e.clientY);
      if (!pt) return;
      const P = this.pack;
      const n = Math.round(this.yaw.t / Math.PI);
      const settled = Math.abs(this.yaw.x - n * Math.PI) < 0.3 && Math.abs(this.pitch.x) < 0.2;
      const facing = Math.abs(n) % 2 === 0 ? 1 : -1;
      const sSide = pt.x < this.packRoot.position.x ? 1 : -1; // 螢幕上從哪一側開始切
      if (settled && this.nearCut(pt)) {
        // 碰到割線:才切得下來
        this.hint.t = 1;
        this.drag = { kind: 'tear', x0: e.clientX, y0: e.clientY, sSide, side: sSide * facing, moved: false, w: this.packScreenW() * 0.82, id: e.pointerId };
      } else {
        this.press = true; // 按在袋身:軟軟地凹下去
        this.drag = { kind: 'turn', x0: e.clientX, y0: e.clientY, yaw0: this.yaw.t, lastX: e.clientX, vyaw: 0, moved: false, id: e.pointerId };
      }
      void P;
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
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  onUp(e) {
    const d = this.drag;
    if (!d || (d.id !== undefined && e.pointerId !== d.id)) return;
    this.drag = null;
    if (d.kind === 'shop') {
      if (d.node) { d.node.press = false; d.node.jy.v -= 2.5; }
      if (!d.moved) {
        if (d.node) this.selectPack(d.node);
      } else {
        this.shopX.t = d.sx0 + (this.ptr.x - d.x0) * this.pxToWorld() + d.vel * 0.22;
        this.clampShop();
      }
    } else if (d.kind === 'tear') {
      this.hint.t = 0;
      if (!d.moved) { // 只是點一下割線:割線亮一下提示
        this.hint.t = 1;
        this.after(0.45, () => (this.hint.t = 0));
        this.kick.v = 4;
      }
      this.tear.t = 0; // 沒撕完就彈回去
    } else if (d.kind === 'turn') {
      this.press = false;
      this.jy.v -= 2.2; // 放手:果凍彈一下
      if (d.moved) {
        this.yaw.t = Math.round((this.yaw.t + d.vyaw * 0.18) / Math.PI) * Math.PI; // 依放手速度吸附到最近的一面
        this.pitch.t = 0;
      } else if (this.time - this.lastTap < 0.35) {
        this.yaw.t = Math.round(this.yaw.t / Math.PI) * Math.PI + Math.PI; // 連點兩下 = 翻面
        this.lastTap = -9;
      } else {
        this.lastTap = this.time;
      }
    } else if (d.kind === 'card') {
      d.card.setTilt(0, 0);
      if (!d.moved) this.tapCard(d.card);
    }
  }
  pxToWorld() {
    return (2 * this.camD.t * TAN * this.aspect) / Math.max(1, this.canvas.clientWidth);
  }
  tapCard(card) {
    if (!card.faceUp) {
      if (this.reduced) card.setFaceUp(true, true);
      else card.setFaceUp(true);
      this.select(card);
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
      card.setSelected(true, this.aspect < 0.85 ? 1.4 : 1.25); // 點開單卡:先到畫面中央放大
      card.moveTo(0, 0.1, 1.0, 0);
    }
  }
  applyDrag(dt) {
    const d = this.drag;
    if (!d) return;
    const dx = this.ptr.x - d.x0;
    const dy = this.ptr.y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 7) d.moved = true;
    if (d.kind === 'shop') {
      if (d.moved) {
        if (d.node) d.node.press = false;
        const u = this.pxToWorld();
        const m = this.shopRange();
        const raw = d.sx0 + dx * u;
        // 超出邊界時有一點橡皮筋阻力
        this.shopX.t = raw > m ? m + (raw - m) * 0.3 : raw < -m ? -m + (raw + m) * 0.3 : raw;
        const v = ((this.ptr.x - d.lastX) * u) / Math.max(dt, 0.001);
        d.vel += (v - d.vel) * 0.25;
        d.lastX = this.ptr.x;
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

  /* ---------- 開包演出(最小版) ---------- */
  open() {
    this.state = 'opening';
    this.openDir = this.drag?.sSide || 1; // 條帶往手指揮過去的方向飛
    this.openFacing = Math.abs(Math.round(this.yaw.t / Math.PI)) % 2 === 0 ? 1 : -1;
    this.drag = null;
    this.hint.t = 0;
    this.tear.t = 1;
    this.cards.forEach((c) => (c.root.visible = true));
    this.capT = 0;
    this.syncUI();
    const T = CONFIG.timing;
    const P = this.pack;
    if (this.fxOn('flash')) this.ui.flash();
    if (this.fxOn('particles')) this.confetti.burst(0, this.packRoot.position.y + P.tearY, 0.45, P.width * 0.9);
    if (navigator.vibrate) navigator.vibrate(18);
    if (this.fxOn('dissolve')) this.dissolveT = 0;
    else P.cap.visible = false;

    const mid = (this.cards.length - 1) / 2;
    this.cards.forEach((c, i) => {
      this.after(T.cardRise + i * T.cardStagger, () => c.moveTo((i - mid) * 0.14, 0.62, -0.02 + i * 0.01, 0));
    });
    this.after(T.packExit, () => {
      this.packY.t = -6;
      this.cards.forEach((c, i) => { const s = this.slot(i); c.moveTo(s.x, s.y, s.z, s.rz); });
    });
    this.after(T.foretell, () => {
      if (this.state !== 'opening') return;
      this.state = 'reveal';
      this.syncUI();
      const top = this.cards[this.cards.length - 1];
      if (top && top.data.rarity !== 'normal' && !top.faceUp) top.tremble = true; // 稀有卡預告
    });
  }

  removePackMesh() {
    if (!this.pack) return;
    this.scene.remove(this.packRoot);
    this.pack.dispose(); this.glow.material.dispose(); this.glow.geometry.dispose();
    this.pshadow.material.dispose(); this.pshadow.geometry.dispose();
    this.packRoot = this.pack = this.glow = this.pshadow = null;
  }

  skip() {
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
    this.syncUI();
  }

  onLand(card) {
    if (card.data.rarity === 'super_rare' && this.fxOn('particles')) this.dust.start(this.camD.t * TAN * this.aspect, this.camD.t * TAN);
    if (this.cards.every((c) => c.faceUp && c._landed)) {
      this.after(0.5, () => {
        if (this.state === 'reveal') { this.state = 'done'; this.syncUI(); }
      });
    }
  }

  /* ---------- 每個 frame ---------- */
  loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta()); // dt 上限,切分頁回來不會瞬移
    this.time += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.cam);
  }

  stepShop(dt) {
    const S = CONFIG.shop;
    this.shopX.step(dt);
    this.shopOut.step(dt);
    if (this.shopG) this.shopG.position.y = this.shopOut.x;
    const panVel = this.drag?.kind === 'shop' && this.drag.moved ? this.drag.vel : (this.shopX.v || 0);
    const hover = this.ptr.mouse && !this.drag && this.state === 'shop' ? this.pickShop(this.ptr.x, this.ptr.y) : null;
    this.canvas.style.cursor = hover ? 'pointer' : '';
    for (const n of this.nodes) {
      n.pivot.position.set(this.nodeX(n.i), S.rail, 0);
      // 單擺:拖動/捲動時卡包被「甩」在後面,停下來再慢慢晃回來;平時只有極輕微的呼吸般晃動
      n.sw.t = clamp(-panVel * 0.045, -0.3, 0.3) + (this.reduced ? 0 : Math.sin(this.time * 0.8 + n.i * 1.7) * 0.012);
      n.sw.step(dt);
      n.pivot.rotation.z = n.sw.x;
      n.jx.t = clamp(-n.sw.v * 0.07, -0.2, 0.2);
      n.jx.step(dt);
      n.jy.t = n.press ? 0.04 : 0;
      n.jy.step(dt);
      n.pack.setJelly(n.jx.x, n.jy.x, -n.jy.x * 3.5);
    }
    this.ui.placeLabels(this.nodes.map((n) => {
      const v = new THREE.Vector3(this.nodeX(n.i), -1.25 + this.shopOut.x, 0).project(this.cam);
      return { x: ((v.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - v.y) / 2) * this.canvas.clientHeight };
    }));
  }

  step(dt) {
    const T = CONFIG.timing;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].at) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    }
    this.applyDrag(dt);
    this.camD.step(dt); this.camY.step(dt);
    this.cam.position.set(0, this.camY.x, this.camD.x);
    this.cam.lookAt(0, this.camY.x, 0);
    if (this.view === 'shop' || this.shopG) this.stepShop(dt);

    if (this.pack) {
      this.tear.step(dt);
      this.packY.step(dt);
      this.kick.t = 0;
      this.kick.step(dt);
      this.px.step(dt); this.py.step(dt); this.ps.step(dt); this.rz.step(dt);
      const p = clamp(this.tear.x, 0, 1);
      this.yaw.step(dt);
      this.pitch.step(dt);
      this.pack.group.rotation.set(this.pitch.x, this.yaw.x, 0);
      this.pack.setTear(p, this.drag?.side || this.lastSide || 1, this.state === 'pack' && this.fxOn('slash'));
      if (this.drag?.side) this.lastSide = this.drag.side;

      // 滑鼠移到割線上:割線亮起來(觸控沒有 hover,按下去才亮)
      if (this.state === 'pack' && this.ptr.mouse && !this.drag) {
        const pt = this.pickPack(this.ptr.x, this.ptr.y);
        this.hint.t = pt && this.nearCut(pt) ? 0.8 : 0;
        this.canvas.style.cursor = pt ? (this.nearCut(pt) ? 'ew-resize' : 'grab') : '';
      }
      this.hint.step(dt);
      this.pack.setHint(Math.max(0, this.hint.x));

      // 果凍:轉動的速度 → 歪斜(有慣性,放手會晃);按下 → 凹進去,放手彈回、過頭再回來
      this.jx.t = this.state === 'pack' ? clamp(-this.yaw.v * CONFIG.jelly.turn, -0.22, 0.22) : 0;
      this.jx.step(dt);
      this.jy.t = this.press ? 0.04 : 0;
      this.jy.step(dt);
      this.pack.setJelly(this.jx.x, this.jy.x, -this.jy.x * 3.5);

      const idle = this.state === 'pack' && this.fxOn('shake') ? Math.sin((this.time * Math.PI * 2) / T.shake) * 0.01 * (1 - p) : 0;
      this.packRoot.rotation.z = this.rz.x + idle + this.kick.x * 0.05;
      this.packRoot.scale.setScalar(this.ps.x);
      this.packRoot.position.set(this.px.x, this.py.x + this.packY.x, 0);
      const g = this.state === 'pack' && this.fxOn('glow') ? 0.2 + 0.08 * Math.sin((this.time * Math.PI * 2) / T.glowPulse) + p * 0.45 : 0;
      this.glow.material.opacity += (g - this.glow.material.opacity) * Math.min(1, dt * 8);
      if (this.capT >= 0) {
        // 切下的上緣條帶:整條往揮過去的方向飛出、翻轉,同時溶解
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
    clearTimeout(this._bgT);
    if (this.canvas && this.h) {
      this.canvas.removeEventListener('pointerdown', this.h.down);
      this.canvas.removeEventListener('pointermove', this.h.move);
      this.canvas.removeEventListener('pointerup', this.h.up);
      this.canvas.removeEventListener('pointercancel', this.h.up);
      this.canvas.removeEventListener('pointerleave', this.h.leave);
      this.canvas.removeEventListener('webglcontextlost', this.h.lost);
      window.removeEventListener('resize', this.h.resize);
      document.removeEventListener('visibilitychange', this.h.vis);
    }
    if (this.renderer) {
      this.clearPack();
      this.disposeShop();
      this.shared.dispose();
      this.confetti.dispose();
      this.dust.dispose();
      this.glowTex.dispose();
      this.shadowTex.dispose();
      this.envRT.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
    this.editor?.destroy();
    this.ui.destroy();
  }
}

const app = new App(document.getElementById('app'));
window.__app = app; // 方便除錯與自動化測試
window.addEventListener('pagehide', () => app.destroy(), { once: true });
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
