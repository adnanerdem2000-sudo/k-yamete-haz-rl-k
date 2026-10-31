// Sokak hayatı: rüzgârda uçuşan kâğıtlar ve sallanan asma dükkân tabelaları. İkisi de tek InstancedMesh;
// kâğıtlar CPU'da basit bir durum makinesiyle (yerde / havada takla) oyuncunun çevresinde dolaşır, tabelalar
// köşe gölgelendiricisinde askı noktası etrafında salınır (rüzgâr şiddetiyle).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Buruşuk kâğıt dokusu (canvas): sararmış sayfa, satırlar, bir başlık bloğu */
function paperTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#e6dfcc'; g.fillRect(0, 0, 64, 96);
  g.fillStyle = 'rgba(60,60,60,0.75)'; g.fillRect(6, 8, 52, 7);
  g.fillStyle = 'rgba(90,90,90,0.5)';
  for (let y = 22; y < 90; y += 6) g.fillRect(6, y, 30 + (y * 7) % 22, 1.6);
  g.fillStyle = 'rgba(120,110,90,0.35)'; g.fillRect(36, 24, 22, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Papers {
  /** regionOk(x,z) → şehir/mahalle mi; ground(x,z) → zemin yüksekliği */
  constructor(scene, n, ground, regionOk) {
    this.n = n; this.ground = ground; this.regionOk = regionOk;
    const geo = new THREE.PlaneGeometry(0.3, 0.42);
    const mat = new THREE.MeshStandardMaterial({ map: paperTexture(), side: THREE.DoubleSide, roughness: 0.95, transparent: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.name = 'papers';
    scene.add(this.mesh);
    this.items = Array.from({ length: n }, () => ({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, air: 0, alive: false, ph: Math.random() * 6 }));
    this.t = 0; this.gust = 0; this.gustT = 3;
    this.wind = new THREE.Vector2(0.8, 0.3);
  }

  update(dt, center, windMul = 1) {
    this.t += dt;
    // rüzgâr esintisi: ara ara 1,5–3 sn'lik güçlü esinti
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gust = this.gust > 0 ? 0 : 0.6 + Math.random() * 0.8; this.gustT = this.gust > 0 ? 1.5 + Math.random() * 1.5 : 4 + Math.random() * 8; }
    const w = (0.35 + this.gust) * windMul;
    const urban = this.regionOk(center.x, center.z);
    for (let i = 0; i < this.n; i++) {
      const p = this.items[i];
      const far = Math.hypot(p.x - center.x, p.z - center.z) > 60;
      if (!p.alive || far) {
        if (!urban) { if (p.alive) { p.alive = false; p.y = -100; } this.write(i, p); continue; }
        // oyuncunun çevresinde 12–45 m yarıçapta yeniden doğ (yerde)
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 33;
        p.x = center.x + Math.cos(a) * r; p.z = center.z + Math.sin(a) * r;
        p.y = this.ground(p.x, p.z) + 0.02; p.vx = p.vy = p.vz = 0; p.air = 0; p.alive = true;
        p.rx = -Math.PI / 2; p.ry = Math.random() * 6; p.rz = 0;
        this.write(i, p); continue;
      }
      if (p.air <= 0) {
        // yerde: esinti güçlüyse kalkar
        if (this.gust > 0.5 && Math.random() < dt * 0.6 * this.gust) { p.air = 1.2 + Math.random() * 2.2; p.vy = 1.5 + Math.random() * 2; p.vx = this.wind.x * w * 2.5; p.vz = this.wind.y * w * 2.5; }
        this.write(i, p); continue;
      }
      // havada: rüzgârla sürüklenir, takla atar, yerçekimi + hava direnci
      p.air -= dt;
      p.vx += (this.wind.x * w * 3 - p.vx) * dt * 1.5 + Math.sin(this.t * 3 + p.ph) * dt * 2;
      p.vz += (this.wind.y * w * 3 - p.vz) * dt * 1.5 + Math.cos(this.t * 2.7 + p.ph) * dt * 2;
      p.vy += (-3.5 + Math.sin(this.t * 4 + p.ph) * 2.5) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += dt * 4.5; p.ry += dt * 1.3; p.rz += dt * 2.2;
      const gy = this.ground(p.x, p.z) + 0.02;
      if (p.y <= gy) { p.y = gy; p.air = 0; p.vx = p.vy = p.vz = 0; p.rx = -Math.PI / 2 + (Math.random() - 0.5) * 0.15; p.rz = 0; }
      this.write(i, p);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  write(i, p) {
    _q.setFromEuler(_e.set(p.rx, p.ry, p.rz, 'YXZ'));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.alive ? 1 : 0.0001));
    this.mesh.setMatrixAt(i, _m);
  }
}

/** Asma tabela dokusu: koyu zeminde sade simge/yazı (atlas 4 çeşit) */
function hangingTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const cells = [['#2b2f3a', '#e8c35a', 'AÇIK'], ['#5a2a2a', '#f1e6d0', 'CAFE'], ['#2a4a3a', '#e6e6e6', '24h'], ['#3a3a3a', '#d84c3c', 'SATILIK']];
  cells.forEach(([bg, fg, txt], i) => {
    g.fillStyle = bg; g.fillRect(i * 64, 0, 64, 64);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(i * 64 + 4, 4, 56, 56);
    g.fillStyle = fg; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, i * 64 + 32, 34);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HangingSigns {
  /** spots: [{x, y, z, ry}] dükkân tabelası konumları (yüz yönü ry). Tabela kapının yanında duvara dik asılır. */
  constructor(scene, spots) {
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
    const n = spots.length;
    // geometri: askı kolu (ince kutu) + levha (dörtgen), pivot = kolun duvar ucu; aSway: levha köşeleri 1, kol 0
    const geo = new THREE.BoxGeometry(0.06, 0.6, 0.06).translate(0, -0.3, 0);
    const plate = new THREE.PlaneGeometry(0.7, 0.5).translate(0, -0.95, 0.0);
    const plateB = plate.clone();
    plate.rotateY(0); plateB.rotateY(Math.PI);
    const parts = [geo, plate, plateB];
    const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), uv = new Float32Array(total * 2), sway = new Float32Array(total), idx = [];
    let vo = 0, io = 0;
    parts.forEach((g, pi) => {
      const P = g.attributes.position, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        pos.set([P.getX(i), P.getY(i), P.getZ(i)], (vo + i) * 3);
        // kol dokusu: atlasın ilk hücresinin koyu kenarı; levha: hücre seçimi örnek başına (aCell)
        uv.set(pi === 0 ? [0.02, 0.02] : [U.getX(i) * 0.25, U.getY(i)], (vo + i) * 2);
        sway[vo + i] = pi === 0 ? 0 : 1;
      }
      const I = g.index.array;
      for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
      vo += P.count; io += I.length;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    const cell = new Float32Array(Math.max(1, n));
    for (let i = 0; i < n; i++) cell[i] = i % 4;
    merged.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
    const mat = new THREE.MeshStandardMaterial({ map: hangingTexture(), side: THREE.DoubleSide, roughness: 0.7, metalness: 0.2 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime; sh.uniforms.uWind = this.uniforms.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway; attribute float aCell; uniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.17;
          float ang = aSway * (sin(uTime * 1.7 + ph) * 0.12 + sin(uTime * 4.3 + ph * 2.0) * 0.04) * uWind;
          // kolun duvar ucu (0,0,0) etrafında Z ekseninde salınım: levha sarkaç gibi
          float cs = cos(ang), sn = sin(ang);
          transformed.xy = vec2(transformed.x * cs - transformed.y * sn, transformed.x * sn + transformed.y * cs);`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x += aCell * 0.25;');
    };
    mat.customProgramCacheKey = () => 'hanging-signs';
    this.mesh = new THREE.InstancedMesh(merged, mat, Math.max(1, n));
    spots.forEach((s, i) => {
      // duvara dik: tabela normali cepheye paralel; kol duvardan 0,35 m dışarı
      _q.setFromAxisAngle(_p.set(0, 1, 0), s.ry + Math.PI / 2);
      _m.compose(_p.set(s.x + Math.sin(s.ry) * 0.35, s.y, s.z + Math.cos(s.ry) * 0.35), _q, _s.setScalar(1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.castShadow = true;
    this.mesh.name = 'hanging-signs';
    scene.add(this.mesh);
  }
  update(dt, windMul = 1) { this.uniforms.uTime.value += dt; this.uniforms.uWind.value = windMul; }
}
