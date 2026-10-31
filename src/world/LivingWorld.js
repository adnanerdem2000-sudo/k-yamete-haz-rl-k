// Yaşayan dünya: gökyüzünde dönen karga sürüleri (silah sesi/patlamada ürküp dağılır) ve şehirde sürekli tüten
// duman sütunları (yanan araç enkazları, yangın yerleri). İkisi de tek InstancedMesh; animasyon köşe
// gölgelendiricisinde (kanat çırpma, duman kartlarının kameraya dönmesi), CPU yalnız örnek matrislerini yazar.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

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
  /**
   * flocks: [{x, z, alt, r, n, v, dir}] daire çizen sürüler; perches: [{x, y, z, r}] konulabilecek yerler (çatılar).
   * Sürü ara ara yakın bir çatıya iner (süzülerek), bir süre tüner, sonra havalanır; gürültü ya da yaklaşan oyuncu
   * (13 m) ürkütür. Tüneyen kuşlar kanat çırpmaz (aStill örnek niteliği).
   */
  constructor(scene, flocks, perches = []) {
    this.uniforms = { uTime: { value: 0 } };
    this.perches = perches;
    const mat = new THREE.MeshLambertMaterial({ color: 0x18181c, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; attribute float aStill; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;
          float flap = sin(uTime * 11.0 + ph * 6.0) * (0.55 + 0.45 * sin(uTime * 0.7 + ph)) * (1.0 - aStill);
          // tüneyen kuş: kanatlar gövdeye katlanır (uçları aşağı/içeri)
          transformed.y += abs(aWing) * flap * 0.32 * abs(position.x) / 0.62 - aStill * abs(aWing) * 0.05 * abs(position.x) / 0.62;
          transformed.x *= 1.0 - aStill * abs(aWing) * 0.45;`);
    };
    mat.customProgramCacheKey = () => 'birds2';
    this.flocks = flocks.map((f, k) => ({
      ...f, scare: 0, mode: 'fly', modeT: 15 + Math.random() * 40, land: 0, perch: null,
      birds: Array.from({ length: f.n }, (_, i) => ({ a: (i / f.n) * Math.PI * 2 + k, r: f.r * (0.7 + Math.random() * 0.5), h: (Math.random() - 0.5) * 6, w: 0.5 + Math.random() * 0.5, ph: Math.random() * 6, px: 0, py: 0, pz: 0, pyaw: 0 })),
    }));
    const n = this.flocks.reduce((a, f) => a + f.n, 0);
    const geo = birdGeometry();
    this.still = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.still.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStill', this.still);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'birds';
    scene.add(this.mesh);
    this.t = 0;
  }

  /** Gürültü (silah, patlama): yakındaki sürüler ürker — yükselir, hızlanır, açılır; tüneyenler havalanır */
  scare(x, z, r) {
    for (const f of this.flocks) if (Math.hypot(f.x - x, f.z - z) < r + f.r + 40) f.scare = Math.min(1, f.scare + 0.8);
  }

  /** Sürü merkezine yakın (≤ 1,3 r + 20 m) rastgele bir tünek */
  pickPerch(f) {
    const c = this.perches.filter((p) => Math.hypot(p.x - f.x, p.z - f.z) < f.r * 1.3 + 20);
    if (!c.length) return null;
    return c[Math.floor(Math.random() * c.length)];
  }

  /** Sürü durum makinesi: fly → land → perched → takeoff → fly */
  stepMode(f, dt, player) {
    f.modeT -= dt;
    if (f.mode === 'fly') {
      if (f.modeT <= 0 && f.scare < 0.05) {
        const p = this.pickPerch(f);
        if (p) {
          f.perch = p; f.mode = 'land'; f.landT = 0;
          for (const b of f.birds) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * p.r; b.px = p.x + Math.cos(a) * rr; b.pz = p.z + Math.sin(a) * rr; b.py = p.y + 0.06; b.pyaw = Math.random() * Math.PI * 2; }
        } else f.modeT = 40;
      }
    } else if (f.mode === 'land') {
      f.land = Math.min(1, f.land + dt / 4);
      if (f.scare > 0.05) f.mode = 'takeoff';
      else if (f.land >= 1) { f.mode = 'perched'; f.modeT = 25 + Math.random() * 50; }
    } else if (f.mode === 'perched') {
      const near = player && f.perch && Math.hypot(player.x - f.perch.x, player.z - f.perch.z) < 13 && Math.abs(player.y - f.perch.y) < 9;
      if (near) f.scare = Math.max(f.scare, 0.6);
      if (f.modeT <= 0 || f.scare > 0.05) f.mode = 'takeoff';
    } else if (f.mode === 'takeoff') {
      f.land = Math.max(0, f.land - dt / 2.2);
      if (f.land <= 0) { f.mode = 'fly'; f.perch = null; f.modeT = 45 + Math.random() * 60; }
    }
  }

  update(dt, ground, player = null) {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    let i = 0;
    const st = this.still.array;
    for (const f of this.flocks) {
      f.scare = Math.max(0, f.scare - dt * 0.08);
      this.stepMode(f, dt, player);
      const sp = 1 + f.scare * 2.2, rr = 1 + f.scare * 0.8, up = f.scare * 22;
      const gy = f.gy ?? (f.gy = ground(f.x, f.z));
      // iniş/kalkış karışımı: yumuşak eğri; tüneme eşiği 0,97
      const k = f.land <= 0 ? 0 : f.land >= 1 ? 1 : f.land * f.land * (3 - 2 * f.land);
      for (const b of f.birds) {
        if (k < 1) b.a += dt * (f.v * sp) / (b.r * rr) * b.w * (f.dir || 1);
        let x = f.x + Math.cos(b.a) * b.r * rr + Math.sin(this.t * 0.3 + b.ph) * 4;
        let z = f.z + Math.sin(b.a) * b.r * rr + Math.cos(this.t * 0.27 + b.ph) * 4;
        let y = gy + f.alt + b.h + Math.sin(this.t * 0.8 + b.ph) * 2.5 + up;
        // yön: çember teğeti (+Z ileri), dönüşe doğru yatış
        let yaw = Math.atan2(-Math.sin(b.a) * (f.dir || 1), Math.cos(b.a) * (f.dir || 1)), roll = -0.35 * (f.dir || 1);
        if (k > 0) {
          // süzülerek tüneğe: konum karışımı, kanat çırpma azalır, son anda yön tünek yönüne döner
          const tx = b.px, tz = b.pz, ty = b.py + (1 - k) * 2.5;
          const dx = tx - x, dz = tz - z;
          const toward = Math.atan2(dx, dz);
          x += dx * k; z += dz * k; y += (ty - y) * k;
          const da = Math.atan2(Math.sin(toward - yaw), Math.cos(toward - yaw));
          yaw += da * Math.min(1, k * 1.5);
          if (k > 0.97) yaw = b.pyaw;
          roll *= 1 - k;
        }
        st[i] = k > 0.97 ? 1 : 0;
        _q.setFromEuler(_e.set(0, yaw, roll, 'YXZ'));
        _m.compose(_p.set(x, y, z), _q, _s.setScalar(1.1));
        this.mesh.setMatrixAt(i++, _m);
      }
    }
    this.still.needsUpdate = true;
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
