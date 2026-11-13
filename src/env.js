// 程式生成的 HDRI 環境貼圖(柔光箱 + 暖色天空漸層),不用外部檔案。
// 亮面糖果袋和全息卡的反光全靠它;沒有環境貼圖,clearcoat 會是死的。
// 之後想換真正的 .hdr:用 RGBELoader 載入後丟給 PMREMGenerator 即可。
import * as THREE from 'three';

export function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 40, 20);
  const pos = geo.attributes.position;
  const cols = [];
  const lo = new THREE.Color('#eceff3');
  const mid = new THREE.Color('#ffffff');
  const hi = new THREE.Color('#d5e0ee');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 10 * 0.5 + 0.5;
    if (t < 0.5) c.copy(lo).lerp(mid, t * 2);
    else c.copy(mid).lerp(hi, (t - 0.5) * 2);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  s.add(sky);

  const mats = [sky.material];
  const geos = [geo];
  const panel = (w, h, p, rgb, k) => {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    m.color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k); // >1 才是 HDR 亮度
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...p);
    mesh.lookAt(0, 0, 0);
    s.add(mesh);
    mats.push(m);
    geos.push(g);
  };
  panel(5, 3, [-5, 5, 5], [1, 1, 1], 7); // 主光:左上前
  panel(2.5, 5, [7, 1, 3], [1, 0.92, 0.96], 4); // 右側長條
  panel(7, 1.2, [0, 7, -1], [1, 1, 1], 5); // 頂光
  panel(4, 2.5, [-7, -1, -3], [0.75, 0.88, 1], 3); // 左後冷色
  panel(3, 3, [3, -4, 6], [1, 0.95, 0.9], 2.2); // 下前暖色補光

  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.025);
  pm.dispose();
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  return rt;
}
