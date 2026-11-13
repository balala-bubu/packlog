// 簡單的彈簧(半隱式歐拉 + 子步),不用線性插值。
export class Spring {
  constructor(value = 0, { k = 170, c = 14 } = {}) {
    this.x = value;
    this.v = 0;
    this.t = value;
    this.k = k;
    this.c = c;
  }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (this.t - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  snap(v = this.t) {
    this.x = this.t = v;
    this.v = 0;
  }
  get settled() {
    return Math.abs(this.t - this.x) < 1e-3 && Math.abs(this.v) < 1e-3;
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
