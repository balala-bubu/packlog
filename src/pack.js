// 亮面糖果袋(參考 PTCG 卡包):上下壓紋封口、正反兩面、沿一條乾淨的直線切開上緣。
// 切口 = 兩半用同一條直線在 fragment shader 裡切掉(接縫無痕),
// 切過的地方有細亮邊 + 一道跟著手指的光痕,袋子裡透出光;切完上緣條帶整條彈飛並溶解。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { drawPackTexture, drawPackBack, radialTexture, canvasTexture } from './art.js';
import { smoothstep } from './spring.js';

const NOISE = /* glsl */ `
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash2(i),hash2(i+vec2(1.,0.)),f.x),mix(hash2(i+vec2(0.,1.)),hash2(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p*=2.03;a*=.5;}return s;}
`;

// style: { name, color, sticker, perOpen, cover:{x,y,scale}, text:{...} };opts.coverImg = 已載入的封面圖;opts.lite = 卡店裡掛著的低解析版
export function createPack(style = {}, opts = {}) {
  const C = CONFIG.pack;
  const lite = !!opts.lite;
  const colorHex = CONFIG.style.packColors[style.color] || C.color;
  const hw = C.width / 2;
  const hh = C.height / 2;
  const tearY = -hh + C.tearFrac * C.height;
  const margin = 0.08; // 上下兩半在撕裂線兩側重疊,用同一條線切掉,接縫才不會露

  const uniforms = {
    uTearY: { value: tearY },
    uDissolveCap: { value: 0 }, // 只有上緣條帶會溶解
    uDissolveBody: { value: 0 },
    uEdge: { value: new THREE.Vector3(...CONFIG.colors.edgeGlow) },
    uTearX: { value: -hw },
    uSide: { value: 1 },
    uAng: { value: 0 },
    uCurl: { value: 0 },
    uRim: { value: 0 },
    uHH: { value: hh },
    uJ: { value: new THREE.Vector3() }, // 果凍:x 左右歪斜、y 壓扁/拉長、z 鼓起
    uHint: { value: 0 }, // 手指靠近割線時,割線亮起來
  };

  const smooth01 = (t) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  const zAt = (x, y) => {
    const nx = Math.min(1, Math.abs(x) / hw);
    const side = Math.sqrt(Math.max(0, 1 - nx ** 4));
    const dEdge = hh - Math.abs(y);
    const body = smooth01((dEdge - C.seal * 0.6) / (C.seal * 2.2));
    let z = C.depth * (0.1 + 0.9 * body) * side;
    const crimpMask = 1 - smooth01((dEdge - C.seal) / 0.05);
    z += Math.sin(x * C.crimpFreq) * C.crimpAmp * crimpMask * side;
    return z;
  };

  // segX 要夠密:被撕起來的區段是靠頂點彎折,網格太疏邊緣會有階梯
  const build = (y0, y1, sign, segX) => {
    const h = y1 - y0;
    const sy = Math.max(10, Math.round((C.segY * h) / C.height));
    const g = new THREE.PlaneGeometry(C.width, h, segX, sy);
    g.translate(0, (y0 + y1) / 2, 0);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, sign * zAt(x, y));
      const u = (x + hw) / C.width;
      uv.setXY(i, sign < 0 ? 1 - u : u, (y + hh) / C.height); // 背面從後面看,u 要翻回來才不會鏡像
    }
    if (sign < 0) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
    }
    g.computeVertexNormals();
    return g;
  };

  const TW = lite ? CONFIG.shop.tex : 1024;
  const texH = Math.round((TW * C.height) / C.width);
  const cover = opts.coverImg ? { ...style.cover, img: opts.coverImg } : null;
  const mapFront = canvasTexture(drawPackTexture(TW, texH, C.tearFrac, colorHex, { sticker: style.sticker, cover, text: style.text }), { aniso: lite ? 2 : 8 });
  const mapBack = canvasTexture(drawPackBack(TW, texH, C.tearFrac, colorHex, { name: style.name, n: style.perOpen }), { aniso: lite ? 2 : 8 });

  const patch = (mat, mode) => {
    mat.customProgramCacheKey = () => `pack3-${mode}`;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.uniforms.uDissolve = mode === 'top' ? uniforms.uDissolveCap : uniforms.uDissolveBody;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPk;\nuniform float uTearX,uTearY,uSide,uAng,uCurl,uHH;\nuniform vec3 uJ;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vPk = position.xy;
          ${
            mode === 'top'
              ? `{
            // 已切開的那段以「切口前緣」為軸輕輕掀起;torn 用 smoothstep 過渡,邊緣才不會有階梯
            float torn = smoothstep(0., .035, (uTearX - transformed.x) * uSide);
            vec2 d = transformed.xy - vec2(uTearX, uTearY);
            float a = -uSide * uAng * torn;
            float cs = cos(a), sn = sin(a);
            transformed.xy = vec2(uTearX, uTearY) + vec2(d.x*cs - d.y*sn, d.x*sn + d.y*cs);
            transformed.z += abs(d.x) * uCurl * torn;
          }`
              : ''
          }
          {
            // 果凍:歪斜(上下反向位移)+ 壓扁/拉長(保持體積)+ 鼓起(沿著原本的曲面往外)
            float yy = clamp(position.y / uHH, -1., 1.);
            transformed.x += uJ.x * yy * (.55 + .45 * abs(yy));
            transformed.xy *= vec2(1. + uJ.y, 1. - uJ.y * .85);
            transformed.z += sign(position.z) * uJ.z * (1. - yy * yy) * (1. - pow(abs(position.x) / ${hw.toFixed(3)}, 2.));
          }`
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec2 vPk;\nuniform float uTearY,uDissolve,uTearX,uSide,uRim,uHH,uHint;\nuniform vec3 uEdge;\n${NOISE}`
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // 上下封口的細密鋸齒邊(參考真實卡包 / 你的設計稿)
          if (uHH - abs(vPk.y) < abs(fract(vPk.x * 12.0) - .5) * .09) discard;
          float jag = uTearY + sin(vPk.x * 7.0) * 0.0035;   // 幾乎筆直的切線,只有極輕微的手感起伏
          ${mode === 'top' ? 'if (vPk.y < jag) discard;' : 'if (vPk.y > jag) discard;'}
          float dn = fbm(vPk * 5.5 + vec2(3.7, 1.3));
          if (uDissolve > 0. && dn < uDissolve) discard;`
        )
        .replace(
          '#include <opaque_fragment>',
          `float glowBand = uDissolve > 0. ? 1. - smoothstep(0., .09, dn - uDissolve) : 0.;
          outgoingLight += uEdge * glowBand * 1.4;
          float tornF = smoothstep(0., .035, (uTearX - vPk.x) * uSide);
          float rim = (1. - smoothstep(0., .016, abs(vPk.y - jag))) * tornF * uRim;
          outgoingLight += vec3(1., .94, .78) * rim * 1.5;
          outgoingLight += vec3(1.) * (1. - smoothstep(0., .075, abs(vPk.y - jag))) * uHint * .45;
          #include <opaque_fragment>`
        );
    };
  };

  const physical = (map, mode) => {
    const m = new THREE.MeshPhysicalMaterial({
      map, roughness: 0.2, metalness: 0.02,
      clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.95,
      side: THREE.DoubleSide,
    });
    patch(m, mode);
    return m;
  };

  const capSeg = lite ? 70 : 220;
  const geos = [
    build(tearY - margin, hh, 1, capSeg), build(tearY - margin, hh, -1, capSeg),
    build(-hh, tearY + margin, 1, lite ? 40 : C.segX), build(-hh, tearY + margin, -1, lite ? 40 : C.segX),
  ];
  const mats = [physical(mapFront, 'top'), physical(mapBack, 'top'), physical(mapFront, 'bottom'), physical(mapBack, 'bottom')];
  const [capFront, capBack, bodyFront, bodyBack] = geos.map((g, i) => new THREE.Mesh(g, mats[i]));
  [capFront, capBack, bodyFront, bodyBack].forEach((m) => (m.raycast = () => {}));

  const group = new THREE.Group();
  const body = new THREE.Group();
  const capPivot = new THREE.Group(); // 彈飛時繞著切線中心轉
  capPivot.position.set(0, tearY, 0);
  const cap = new THREE.Group();
  cap.position.set(0, -tearY, 0);
  cap.add(capFront, capBack);
  capPivot.add(cap);
  body.add(bodyFront, bodyBack);
  group.add(body, capPivot);

  // 袋子裡透出的光(切開後從切口漏出來)
  const lightTex = canvasTexture(radialTexture([[0, 'rgba(255,240,200,1)'], [0.5, 'rgba(255,226,160,.45)'], [1, 'rgba(255,220,150,0)']], 128));
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(C.width * 0.95, 0.9),
    new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0, side: THREE.DoubleSide })
  );
  inner.position.set(0, tearY + 0.08, 0);
  inner.raycast = () => {};
  group.add(inner);

  // 跟著手指的光痕:貼著袋面(z 依曲面起伏),正反兩面各一條
  const slashGeos = [];
  const slashMats = [];
  const slashes = [1, -1].map((sign) => {
    const g = new THREE.PlaneGeometry(C.width, 0.055, 96, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, sign * (zAt(p.getX(i), tearY) + 0.014));
    g.translate(0, tearY, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 }, uB: { value: 0 }, uDir: { value: 1 }, uOn: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vX; void main(){ vUv=uv; vX=position.x; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; varying float vX; uniform float uA,uB,uDir,uOn;
        void main(){ if(vX<uA||vX>uB) discard;
          float t=clamp((vX-uA)/max(uB-uA,.0001),0.,1.); float head=uDir>0.?t:1.-t;
          float core=pow(max(1.-abs(vUv.y-.5)*2.,0.),1.3); float a=pow(head,1.7)*core*uOn;
          gl_FragColor=vec4(vec3(1.,.96,.8)*a*1.4,a); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.raycast = () => {};
    mesh.frustumCulled = false;
    group.add(mesh);
    slashGeos.push(g);
    slashMats.push(m);
    // 光痕前端的亮點
    const hg = new THREE.PlaneGeometry(0.34, 0.34);
    const hm = new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0, side: THREE.DoubleSide });
    const head = new THREE.Mesh(hg, hm);
    head.raycast = () => {};
    group.add(head);
    slashGeos.push(hg);
    slashMats.push(hm);
    return { sign, m, head, hm };
  });

  const hit = new THREE.Mesh(new THREE.PlaneGeometry(C.width, C.height), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  hit.position.z = 0;
  group.add(hit);

  return {
    group, body, cap, capPivot, hit, uniforms,
    width: C.width, height: C.height, tearY, zAt,
    // p: 0..1 切開進度(以 pack 本地座標計);side: +1 由本地左往右切,-1 反之
    setTear(p, side, slash = true) {
      uniforms.uSide.value = side;
      uniforms.uTearX.value = side > 0 ? -hw + p * C.width : hw - p * C.width;
      const k = smoothstep(0, 0.1, p);
      uniforms.uAng.value = 0.16 * k; // 乾淨俐落的切開,只微微掀起
      uniforms.uCurl.value = 0.07 * k;
      uniforms.uRim.value = smoothstep(0, 0.05, p);
      inner.material.opacity = Math.min(0.75, p * 0.9);
      const a = side > 0 ? -hw : uniforms.uTearX.value;
      const b = side > 0 ? uniforms.uTearX.value : hw;
      const headX = uniforms.uTearX.value;
      for (const s of slashes) {
        s.m.uniforms.uA.value = a;
        s.m.uniforms.uB.value = b;
        s.m.uniforms.uDir.value = side;
        s.m.uniforms.uOn.value = slash && p > 0.003 ? 1 : 0;
        s.head.position.set(headX, tearY, s.sign * (zAt(headX, tearY) + 0.03));
        s.hm.opacity = slash && p > 0.003 ? 0.9 : 0;
      }
    },
    setSlashOn(on) {
      for (const s of slashes) { s.m.uniforms.uOn.value = on ? s.m.uniforms.uOn.value : 0; if (!on) s.hm.opacity = 0; }
    },
    setInner(v) { inner.material.opacity = v; },
    setJelly(sx, sy, pz) { uniforms.uJ.value.set(sx, sy, pz); },
    setHint(v) { uniforms.uHint.value = v; },
    setDissolve(v) { uniforms.uDissolveCap.value = v; },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      slashGeos.forEach((g) => g.dispose());
      slashMats.forEach((m) => m.dispose());
      inner.geometry.dispose();
      inner.material.dispose();
      hit.geometry.dispose();
      hit.material.dispose();
      mapFront.dispose();
      mapBack.dispose();
      lightTex.dispose();
    },
  };
}
