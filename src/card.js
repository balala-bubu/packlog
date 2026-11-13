// 拍立得感卡片:有厚度與圓角,正面照片 + 評級 + 日期 + 心情 + 一句話,背面是系列圖案。
// 稀有(SR)以上才有全息(iridescence + 細閃 normal map);普通(R)卡絕對沒有。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Spring, clamp } from './spring.js';
import {
  CARD_PX, layoutFor, drawCardFront, drawCardBack, drawCardMask, glitterNormal,
  radialTexture, stickerCanvas, canvasTexture,
} from './art.js';

const W = CONFIG.card.w;
const H = (W * CARD_PX.h) / CARD_PX.w;
const BEVEL = 0.004;

function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// 所有卡共用的幾何/貼圖/材質,最後一次釋放
export function createCardShared(tint) {
  const shape = roundedShape(W, H, CONFIG.card.radius);
  const depth = CONFIG.card.depth;
  const body = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 10,
  });
  body.translate(0, 0, -depth / 2);
  const face = new THREE.ShapeGeometry(shape, 10);
  const uv = face.attributes.uv;
  const p = face.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getY(i) + H / 2) / H);

  const tex = {
    back: canvasTexture(drawCardBack(tint)),
    maskPolaroid: canvasTexture(drawCardMask('polaroid'), { srgb: false }),
    maskTicket: canvasTexture(drawCardMask('ticket'), { srgb: false }),
    glitter: canvasTexture(glitterNormal(256), { srgb: false, repeat: [5, 7] }),
    shadow: canvasTexture(radialTexture([[0, 'rgba(70,50,35,.55)'], [0.55, 'rgba(70,50,35,.2)'], [1, 'rgba(70,50,35,0)']], 128)),
    stickers: {},
  };
  const getSticker = (k) => (tex.stickers[k] ||= canvasTexture(stickerCanvas(k)));
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.75 });
  const backMat = new THREE.MeshPhysicalMaterial({ map: tex.back, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const faceGeoBack = face; // 背面共用同一個 face,只是轉 180°
  const mask = (style) => (style === 'ticket' ? tex.maskTicket : tex.maskPolaroid);
  // 換卡包顏色時,卡背跟著換成同色系
  const updateBack = (c) => {
    tex.back.image = drawCardBack(c);
    tex.back.needsUpdate = true;
  };
  return {
    body, face, faceGeoBack, tex, bodyMat, backMat, getSticker, depth, mask, updateBack,
    dispose() {
      body.dispose(); face.dispose();
      Object.values(tex).forEach((t) => t && t.dispose && t.dispose());
      Object.values(tex.stickers).forEach((t) => t.dispose());
      bodyMat.dispose(); backMat.dispose();
    },
  };
}

// 位置用「照片區內的比例」表示,這樣拍立得/票根(照片區大小不同)都貼得對
const LAYER_SPECS = {
  rare: [{ kind: 'sparkle', fx: 0.86, fy: 0.15, s: 0.34, z: 0.05 }],
  super_rare: [
    { kind: 'rainbow', fx: 0.76, fy: 0.74, s: 0.5, z: 0.05 },
    { kind: 'cat', fx: 0.19, fy: 0.85, s: 0.36, z: 0.1 },
    { kind: 'star', fx: 0.88, fy: 0.18, s: 0.3, z: 0.15 },
  ],
};

const SWEEP_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const SWEEP_FS = `varying vec2 vUv; uniform float uT; uniform vec3 uCol;
void main(){ float d=vUv.x*.8+vUv.y*.6; float pos=mix(-.25,1.55,uT);
  float b=smoothstep(.22,0.,abs(d-pos)); float a=b*.85*sin(uT*3.14159); gl_FragColor=vec4(uCol*a,a); }`;

export class Card {
  constructor(data, photo, shared) {
    this.data = data;
    this.shared = shared;
    const rc = CONFIG.rarity[data.rarity] || CONFIG.rarity.normal;
    this.rc = rc;
    this.disposables = [];

    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.root.userData.card = this;

    const z = shared.depth / 2 + BEVEL + 0.0006;
    const body = new THREE.Mesh(shared.body, shared.bodyMat);
    this.inner.add(body);

    const bstyle = (data.border && data.border.style) || 'polaroid';
    const mask = shared.mask(bstyle);
    const P = layoutFor(bstyle).photo;
    this.frontCanvas = drawCardFront(photo, data);
    this.frontTex = canvasTexture(this.frontCanvas);
    this.frontTex.generateMipmaps = true;
    this.frontMat = rc.holo
      ? new THREE.MeshPhysicalMaterial({
          map: this.frontTex, roughness: 0.3, metalness: 0.2,
          clearcoat: 1, clearcoatRoughness: 0.12, clearcoatMap: mask,
          metalnessMap: mask, specularIntensityMap: mask,
          iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 800],
          iridescenceMap: mask,
          normalMap: shared.tex.glitter, normalScale: new THREE.Vector2(0.55, 0.55),
          envMapIntensity: 1.5,
        })
      : new THREE.MeshPhysicalMaterial({
          map: this.frontTex, roughness: 0.62, metalness: 0,
          clearcoat: 0.2, clearcoatRoughness: 0.5, iridescence: 0, envMapIntensity: 0.7,
        });
    const front = new THREE.Mesh(shared.face, this.frontMat);
    front.position.z = z;
    const back = new THREE.Mesh(shared.faceGeoBack, shared.backMat);
    back.position.z = -z;
    back.rotation.y = Math.PI;
    this.inner.add(front, back);
    this.hitMeshes = [body, front, back];

    // 稀有卡:掃光
    if (rc.sweep) {
      this.sweepMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(...rc.sweep) } },
        vertexShader: SWEEP_VS, fragmentShader: SWEEP_FS,
      });
      this.sweep = new THREE.Mesh(shared.face, this.sweepMat);
      this.sweep.position.z = z + 0.0012;
      this.sweep.visible = false;
      this.sweep.raycast = () => {};
      this.inner.add(this.sweep);
    }

    // 紙雕疊層:不同高度的貼紙,翻開時依序彈出,傾斜時有視差
    this.layers = [];
    (LAYER_SPECS[data.rarity] || []).forEach((sp, i) => {
      const m = new THREE.MeshBasicMaterial({ map: shared.getSticker(sp.kind), transparent: true, toneMapped: false });
      const g = new THREE.PlaneGeometry((sp.s * 320) / 260, (sp.s * 320) / 260);
      const mesh = new THREE.Mesh(g, m);
      const px = P.x + sp.fx * P.w;
      const py = P.y + sp.fy * P.h;
      mesh.position.set((px / CARD_PX.w - 0.5) * W, (0.5 - py / CARD_PX.h) * H, z + sp.z);
      mesh.scale.setScalar(0.0001);
      mesh.raycast = () => {};
      this.inner.add(mesh);
      this.layers.push({ mesh, mat: m, geo: g, pop: new Spring(0, CONFIG.spring.pop), delay: i * 0.09, rot: (i - 1) * 0.08 });
    });

    // 軟陰影
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shared.tex.shadow, transparent: true, depthWrite: false, opacity: 0.3 });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1);
    this.shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.shadow.scale.set(W * 1.3, H * 1.2, 1);
    this.shadow.position.set(0.07, -0.1, -0.12);
    this.shadow.raycast = () => {};
    this.root.add(this.shadow);

    const S = CONFIG.spring;
    this.sx = new Spring(0, S.move); this.sy = new Spring(0, S.move); this.sz = new Spring(0, S.move);
    this.rz = new Spring(0, S.move);
    this.flip = new Spring(Math.PI, S.flip); // π = 背面朝上(蓋著), 0 = 正面
    this.tiltX = new Spring(0, S.tilt); this.tiltY = new Spring(0, S.tilt);
    this.sq = new Spring(1, S.squash);
    this.sel = new Spring(1, S.move);
    this.lift = new Spring(0, S.move);
    this.faceUp = false;
    this.selected = false;
    this.tremble = false;
    this._swept = true; this._landed = true;
    this.sweepT = -1;
    this.popAt = -1;
    this.onLand = null;
  }

  place(x, y, z, rz) {
    [[this.sx, x], [this.sy, y], [this.sz, z], [this.rz, rz]].forEach(([s, v]) => s.snap(v));
  }
  moveTo(x, y, z, rz) {
    this.sx.t = x; this.sy.t = y; this.sz.t = z; this.rz.t = rz;
  }
  setFaceUp(up, instant = false) {
    this.faceUp = up;
    this.flip.t = up ? 0 : Math.PI;
    if (instant) {
      this.flip.snap(this.flip.t);
      this._landed = this._swept = true;
      this.layers.forEach((l) => { l.pop.snap(up ? 1 : 0); });
      return;
    }
    if (up) { this._swept = false; this._landed = false; this.tremble = false; }
  }
  setSelected(on, scale = 1.25) {
    this.selected = on;
    this.sel.t = on ? scale : 1;
  }
  setTilt(tx, ty) { this.tiltX.t = tx; this.tiltY.t = ty; }

  update(dt, t, fxOn) {
    for (const s of [this.sx, this.sy, this.sz, this.rz, this.flip, this.tiltX, this.tiltY, this.sq, this.sel, this.lift]) s.step(dt);

    const prog = clamp(1 - this.flip.x / Math.PI, 0, 1);
    const bump = Math.sin(prog * Math.PI) * CONFIG.card.flipBump;
    let tx = 0, ty = 0, tr = 0;
    if (this.tremble && fxOn('shake')) {
      tx = Math.sin(t * 71) * 0.006; ty = Math.cos(t * 83) * 0.004; tr = Math.sin(t * 64) * 0.014;
    }
    this.root.position.set(this.sx.x + tx, this.sy.x + ty, this.sz.x + this.lift.x + bump);
    this.root.rotation.z = this.rz.x + tr;
    const sc = this.sq.x * this.sel.x;
    this.root.scale.set(sc, sc, sc);
    this.inner.rotation.set(this.tiltX.x, this.flip.x + this.tiltY.x, 0);

    if (this.faceUp && !this._swept && prog > 0.5) {
      this._swept = true;
      if (this.sweep && fxOn('sweep')) this.sweepT = 0;
    }
    if (this.faceUp && !this._landed && this.flip.x < 0.08) {
      this._landed = true;
      if (fxOn('squash')) { this.sq.x = 1; this.sq.v = -CONFIG.squash.dip; }
      if (this.layers.length) {
        if (fxOn('layers')) this.popAt = t;
        else this.layers.forEach((l) => l.pop.snap(1));
      }
      if (this.onLand) this.onLand(this);
    }

    if (this.sweep) {
      if (this.sweepT >= 0) {
        this.sweepT += dt / CONFIG.timing.sweep;
        this.sweep.visible = this.sweepT < 1;
        this.sweepMat.uniforms.uT.value = clamp(this.sweepT, 0, 1);
        if (this.sweepT >= 1) this.sweepT = -1;
      }
    }
    for (const l of this.layers) {
      if (this.popAt >= 0 && t - this.popAt >= l.delay) l.pop.t = 1;
      if (!this.faceUp && this.flip.x > 2.9) { l.pop.t = 0; if (this.popAt >= 0) this.popAt = -1; }
      l.pop.step(dt);
      l.mesh.scale.setScalar(Math.max(0.0001, l.pop.x));
      l.mesh.rotation.z = l.rot * (1 - clamp(l.pop.x, 0, 1)) * 3;
    }
    const lift = this.lift.x / 0.55;
    this.shadowMat.opacity = 0.3 - lift * 0.1;
    this.shadow.position.z = -0.12 - this.lift.x * 0.2;
    this.shadow.position.x = 0.07 + lift * 0.05;
    this.shadow.position.y = -0.1 - lift * 0.05;
  }

  dispose() {
    this.frontMat.dispose();
    this.frontTex.dispose();
    this.sweepMat?.dispose();
    this.shadowMat.dispose();
    this.shadowGeo.dispose();
    this.layers.forEach((l) => { l.mat.dispose(); l.geo.dispose(); });
    this.root.removeFromParent();
  }
}

export const CARD_H = H;
export const CARD_W = W;
