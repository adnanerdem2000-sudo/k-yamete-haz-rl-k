// Yaşayan dünya: gökyüzünde dönen karga sürüleri (silah sesi/patlamada ürküp dağılır) ve şehirde sürekli tüten
// duman sütunları (yanan araç enkazları, yangın yerleri). İkisi de tek InstancedMesh; animasyon köşe
// gölgelendiricisinde (kanat çırpma, duman kartlarının kameraya dönmesi), CPU yalnız örnek matrislerini yazar.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

/** Basit kuş: gövde + iki kanat (kanat ucu köşelerinde aWing = ±1; gölgelendirici çırpar) */
function birdGeometry() {
  const pos = [], wing = [];
  const tri = (a, b, c, w) => { pos.push(...a, ...b, ...c); wing.push(w[0], w[1], w[2]); };
  // gövde (ince elmas), +Z ileri
  const nose = [0, 0, 0.32], tail = [0, 0.02, -0.3], top = [0, 0.07, 0], bot = [0, -0.05, 0], l = [0.06, 0, 0], r = [-0.06, 0, 0];
  for (const [a, b] of [[top, l], [l, bot], [bot, r], [r, top]]) { tri(nose, a, b, [0, 0, 0]); tri(tail, b, a, [0, 0, 0]); }
  // kanatlar (iki yüzlü çizilir)
  tri([0.05, 0.02, 0.1], [0.62, 0.0, -0.05], [0.05, 0.02, -0.12], [0, 1, 0]);
  tri([-0.05, 0.02, 0.1], [-0.05, 0.02, -0.12], [-0.62, 0.0, -0.05], [0, -1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  constructor(scene, flocks) {
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ color: 0x18181c, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;
          float flap = sin(uTime * 11.0 + ph * 6.0) * (0.55 + 0.45 * sin(uTime * 0.7 + ph));
          transformed.y += abs(aWing) * flap * 0.32 * abs(position.x) / 0.62;`);
    };
    mat.customProgramCacheKey = () => 'birds';
    this.flocks = flocks.map((f, k) => ({
      ...f, scare: 0, birds: Array.from({ length: f.n }, (_, i) => ({ a: (i / f.n) * Math.PI * 2 + k, r: f.r * (0.7 + Math.random() * 0.5), h: (Math.random() - 0.5) * 6, w: 0.5 + Math.random() * 0.5, ph: Math.random() * 6 })),
    }));
    const n = this.flocks.reduce((a, f) => a + f.n, 0);
    this.mesh = new THREE.InstancedMesh(birdGeometry(), mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'birds';
    scene.add(this.mesh);
    this.t = 0;
  }

  /** Gürültü (silah, patlama): yakındaki sürüler ürker — yükselir, hızlanır, açılır */
  scare(x, z, r) {
    for (const f of this.flocks) if (Math.hypot(f.x - x, f.z - z) < r + f.r + 40) f.scare = Math.min(1, f.scare + 0.8);
  }

  update(dt, ground) {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    let i = 0;
    for (const f of this.flocks) {
      f.scare = Math.max(0, f.scare - dt * 0.08);
      const sp = 1 + f.scare * 2.2, rr = 1 + f.scare * 0.8, up = f.scare * 22;
      const gy = f.gy ?? (f.gy = ground(f.x, f.z));
      for (const b of f.birds) {
        b.a += dt * (f.v * sp) / (b.r * rr) * b.w * (f.dir || 1);
        const x = f.x + Math.cos(b.a) * b.r * rr + Math.sin(this.t * 0.3 + b.ph) * 4;
        const z = f.z + Math.sin(b.a) * b.r * rr + Math.cos(this.t * 0.27 + b.ph) * 4;
        const y = gy + f.alt + b.h + Math.sin(this.t * 0.8 + b.ph) * 2.5 + up;
        // yön: çember teğeti (+Z ileri), dönüşe doğru yatış
        const yaw = Math.atan2(-Math.sin(b.a) * (f.dir || 1), Math.cos(b.a) * (f.dir || 1));
        _q.setFromEuler(new THREE.Euler(0, yaw, -0.35 * (f.dir || 1), 'YXZ'));
        _m.compose(_p.set(x, y, z), _q, _s.setScalar(1.1));
        this.mesh.setMatrixAt(i++, _m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Yumuşak duman lekesi dokusu (canvas) */
function smokeTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.4, y = S / 2 + (Math.random() - 0.5) * S * 0.4, r = S * (0.14 + Math.random() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SmokeColumns {
  constructor(scene, sites, per = 22) {
    this.sites = sites;
    this.per = per;
    const n = sites.length * per;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.MeshBasicMaterial({ map: smokeTexture(), color: 0x3c3a38, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vAlpha;')
        .replace('#include <begin_vertex>', 'vAlpha = aAlpha;\nfloat isc = length(instanceMatrix[0].xyz);\nvec3 ip = instanceMatrix[3].xyz;\nvec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);\nvec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);\nvec3 transformed = (camR * position.x + camU * position.y) * isc;')
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(ip + transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'smoke-columns';
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'smoke-columns';
    scene.add(this.mesh);
    // her puf: faz (0..1 ömür), yatay sapma
    this.puffs = [];
    sites.forEach((s) => { for (let k = 0; k < per; k++) this.puffs.push({ s, ph: k / per + Math.random() * 0.03, dx: (Math.random() - 0.5), dz: (Math.random() - 0.5), rot: Math.random() }); });
    this.wind = new THREE.Vector2(0.8, 0.3);
  }

  update(dt, windMul = 1) {
    let i = 0;
    for (const p of this.puffs) {
      const s = p.s;
      p.ph += dt / (s.life || 14);
      if (p.ph >= 1) { p.ph -= 1; p.dx = Math.random() - 0.5; p.dz = Math.random() - 0.5; }
      const k = p.ph, h = k * (s.h || 34);
      // yükseldikçe genişler ve rüzgârla sürüklenir; doğarken ve sönerken saydam
      const drift = k * k * 18 * windMul;
      const x = s.x + p.dx * (1 + k * 6) + this.wind.x * drift, z = s.z + p.dz * (1 + k * 6) + this.wind.y * drift;
      const sc = (s.size || 2.2) * (1 + k * 5.5);
      _m.compose(_p.set(x, s.y + h, z), _q.identity(), _s.setScalar(sc));
      this.mesh.setMatrixAt(i, _m);
      this.alpha.array[i] = Math.min(1, k * 8) * (1 - k) * (s.dense || 0.85);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}
