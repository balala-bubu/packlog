import * as THREE from 'three';
import { CONFIG } from './config.js';
import { radialTexture, canvasTexture } from './art.js';

const rand = (a, b) => a + Math.random() * (b - a);

// 紙屑:一個 InstancedMesh,CPU 更新。數量很少(config.particles.confetti),刻意克制。
export class Confetti {
  constructor(scene) {
    this.n = CONFIG.particles.confetti;
    this.geo = new THREE.PlaneGeometry(0.05, 0.085);
    this.mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    const col = new THREE.Color();
    CONFIG.colors.confetti.forEach(() => {});
    for (let i = 0; i < this.n; i++) {
      col.set(CONFIG.colors.confetti[i % CONFIG.colors.confetti.length]);
      this.mesh.setColorAt(i, col);
    }
    this.p = Array.from({ length: this.n }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, age: 9, life: 1, ph: 0 }));
    this.dummy = new THREE.Object3D();
    this.active = false;
    scene.add(this.mesh);
    this.scene = scene;
  }
  burst(ox, oy, oz, spreadX) {
    this.active = true;
    this.mesh.visible = true;
    for (const q of this.p) {
      q.x = ox + rand(-0.5, 0.5) * spreadX;
      q.y = oy;
      q.z = oz + rand(0, 0.2);
      q.vx = rand(-1.5, 1.5);
      q.vy = rand(1.4, 3.4);
      q.vz = rand(0.2, 1.4);
      q.rx = rand(0, 6);
      q.ry = rand(0, 6);
      q.rz = rand(0, 6);
      q.sx = rand(-6, 6);
      q.sy = rand(-6, 6);
      q.sz = rand(-4, 4);
      q.age = 0;
      q.life = rand(1.5, 2.4);
      q.ph = rand(0, 6);
    }
  }
  update(dt) {
    if (!this.active) return;
    let alive = 0;
    const d = this.dummy;
    this.p.forEach((q, i) => {
      q.age += dt;
      if (q.age >= q.life) {
        d.scale.setScalar(0.0001);
      } else {
        alive++;
        q.vy -= 4.2 * dt;
        q.vx += Math.sin(q.age * 6 + q.ph) * 0.9 * dt;
        q.vx *= 1 - 0.9 * dt;
        q.vy *= 1 - 0.7 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        q.rx += q.sx * dt;
        q.ry += q.sy * dt;
        q.rz += q.sz * dt;
        const k = Math.min(1, (q.life - q.age) / 0.5);
        d.position.set(q.x, q.y, q.z);
        d.rotation.set(q.rx, q.ry, q.rz);
        d.scale.setScalar(Math.max(0.0001, k));
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// 金色閃光粉:最後揭曉稀有卡時輕輕落下,數量很少
export class GoldDust {
  constructor(scene) {
    this.n = CONFIG.particles.dust;
    this.tex = canvasTexture(radialTexture([[0, 'rgba(255,240,190,1)'], [0.35, 'rgba(255,214,120,.8)'], [1, 'rgba(255,200,90,0)']]));
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.12, map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.visible = false;
    this.pts.raycast = () => {};
    this.v = new Float32Array(this.n);
    this.t = 0;
    this.dur = 0;
    scene.add(this.pts);
    this.scene = scene;
  }
  start(halfW, halfH) {
    this.t = 0;
    this.dur = 2.6;
    this.pts.visible = true;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = rand(-halfW, halfW);
      this.pos[i * 3 + 1] = rand(halfH * 0.2, halfH * 1.2);
      this.pos[i * 3 + 2] = rand(0.2, 1.2);
      this.v[i] = rand(0.35, 0.9);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  update(dt) {
    if (!this.pts.visible) return;
    this.t += dt;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3 + 1] -= this.v[i] * dt;
      this.pos[i * 3] += Math.sin(this.t * 2 + i) * 0.08 * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    const k = this.t / this.dur;
    this.mat.opacity = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
    if (k >= 1) this.pts.visible = false;
  }
  dispose() {
    this.scene.remove(this.pts);
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
