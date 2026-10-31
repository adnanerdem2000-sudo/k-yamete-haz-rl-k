// Görsel efektler: stilize vuruş kıvılcımları, toz, duman, ateş, mermi izleri, namlu alevi,
// işaret (ping), yüzen hasar sayıları. Şiddet stilize ve ölçülü tutulur.
import * as THREE from 'three';
import { softDot } from '../world/TextureFactory.js';

const MAX = 600;

export class Effects {
  constructor(session) {
    this.s = session;
    const scene = session.game.scene;
    // parçacık havuzu (Points)
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() } }, transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.05) discard; gl_FragColor = vec4(vC, t.a * 0.9); }',
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) { this.size[i] = 0; this.pos[i * 3 + 1] = -9999; }
    // izler
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 });
    this.flashes = [];
    this.texts = [];
    this.pings = [];
    this.fires = [];
  }

  emit(x, y, z, n, o = {}) {
    for (let k = 0; k < n; k++) {
      let i = this.parts.length < MAX ? this.parts.length : -1;
      if (i < 0) { this.parts.shift(); i = this.parts.length; }
      const sp = o.speed ?? 3;
      this.parts.push({
        x, y, z, vx: (Math.random() - 0.5) * sp + (o.vx || 0), vy: Math.random() * sp * (o.up ?? 0.8) + (o.vy || 0), vz: (Math.random() - 0.5) * sp + (o.vz || 0),
        life: o.life ?? 0.6, max: o.life ?? 0.6, size: o.size ?? 0.25, grow: o.grow ?? 0, grav: o.grav ?? 9, color: new THREE.Color(o.color || '#ffffff'), drag: o.drag ?? 0.5,
      });
    }
  }

  // ---- hazır efektler
  hit(x, y, z, kind = 'flesh') {
    if (kind === 'flesh') { this.emit(x, y, z, 8, { color: '#5d2a5a', speed: 3, life: 0.45, size: 0.18 }); this.emit(x, y, z, 4, { color: '#ffe08a', speed: 5, life: 0.18, size: 0.12, grav: 0 }); }
    else if (kind === 'wood') this.emit(x, y, z, 8, { color: '#a0784a', speed: 3, life: 0.5, size: 0.14 });
    else if (kind === 'metal') this.emit(x, y, z, 10, { color: '#ffd27a', speed: 6, life: 0.25, size: 0.08 });
    else this.emit(x, y, z, 6, { color: '#c8b8a0', speed: 2, life: 0.6, size: 0.2, grav: 2 });
  }
  dust(x, y, z, n = 6) { this.emit(x, y, z, n, { color: '#cbbfa8', speed: 1.5, life: 0.9, size: 0.45, grav: 0.5, up: 0.4, grow: 0.6 }); }
  smoke(x, y, z, n = 3, color = '#777777') { this.emit(x, y, z, n, { color, speed: 0.6, life: 2.4, size: 0.6, grav: -0.8, up: 0.3, grow: 1.2 }); }
  toxic(x, y, z) { this.emit(x, y, z, 30, { color: '#9dff3d', speed: 2.5, life: 2.2, size: 0.7, grav: -0.3, grow: 1.5 }); }
  death(x, y, z) { this.emit(x, y + 0.8, z, 14, { color: '#4a2a4a', speed: 2.5, life: 0.8, size: 0.25 }); this.dust(x, y, z, 8); }
  splash(x, y, z) { this.emit(x, y, z, 14, { color: '#cfe8ff', speed: 3, life: 0.6, size: 0.18 }); }
  sparks(x, y, z) { this.emit(x, y, z, 12, { color: '#ffcc55', speed: 5, life: 0.35, size: 0.08 }); }

  muzzle(x, y, z) {
    const l = new THREE.PointLight(0xffc870, 30, 10, 2);
    l.position.set(x, y, z);
    this.s.game.scene.add(l);
    this.flashes.push({ l, t: 0.06 });
    this.emit(x, y, z, 5, { color: '#fff1a8', speed: 2, life: 0.08, size: 0.25, grav: 0 });
    this.smoke(x, y, z, 2, '#9a9a9a');
  }

  tracer(ax, ay, az, bx, by, bz) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)]);
    const l = new THREE.Line(g, this.tracerMat);
    this.s.game.scene.add(l);
    this.tracers.push({ l, t: 0.07 });
  }

  /** Yüzen metin (hasar, +eşya) */
  text(x, y, z, str, color = '#ffffff', size = 1) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = `${Math.round(34 * size)}px "Luckiest Guy", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(str, 128, 32); g.fillStyle = color; g.fillText(str, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.4, 0.35, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    this.s.game.scene.add(sp);
    this.texts.push({ sp, t: 0, life: 1.1 });
  }

  ping(x, y, z, name, label) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, side: THREE.DoubleSide, transparent: true, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, depthTest: false }));
    beam.position.y = 3;
    g.add(beam);
    g.position.set(x, y + 0.05, z);
    g.renderOrder = 9;
    this.s.game.scene.add(g);
    this.pings.push({ g, t: 0, life: 8 });
    this.text(x, y + 6.4, z, `${name}: ${label}`, '#ffd27a', 0.8);
    this.texts[this.texts.length - 1].life = 4;
  }

  /** Kalıcı ateş (kamp ateşi, molotof, patlama) */
  fire(x, y, z, life = 10, scale = 1) {
    const f = { x, y, z, life, scale, light: { x, y: y + 0.8, z, color: 0xff7a2a, intensity: 22 * scale, range: 12 * scale, flicker: true, on: true, always: true } };
    this.s.env.extraLights.push(f.light);
    this.fires.push(f);
    return f;
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
    }
    for (const p of this.parts) {
      if (n >= MAX) break;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      const k = p.life / p.max;
      this.col[n * 3] = p.color.r; this.col[n * 3 + 1] = p.color.g; this.col[n * 3 + 2] = p.color.b;
      this.size[n] = p.size * Math.min(1, k * 2.5);
      n++;
    }
    for (let i = n; i < MAX; i++) { if (this.size[i] === 0) break; this.size[i] = 0; this.pos[i * 3 + 1] = -9999; }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.t -= dt; if (t.t <= 0) { this.s.game.scene.remove(t.l); t.l.geometry.dispose(); this.tracers.splice(i, 1); } }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t -= dt; if (f.t <= 0) { this.s.game.scene.remove(f.l); this.flashes.splice(i, 1); } }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.t += dt;
      t.sp.position.y += dt * 0.6;
      t.sp.material.opacity = Math.max(0, 1 - t.t / t.life);
      if (t.t >= t.life) { this.s.game.scene.remove(t.sp); t.sp.material.map.dispose(); this.texts.splice(i, 1); }
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]; p.t += dt;
      p.g.children[0].scale.setScalar(1 + Math.sin(p.t * 6) * 0.15);
      if (p.t >= p.life) { this.s.game.scene.remove(p.g); this.pings.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      if (Math.random() < dt * 30 * f.scale) this.emit(f.x + (Math.random() - 0.5) * 0.6 * f.scale, f.y + 0.2, f.z + (Math.random() - 0.5) * 0.6 * f.scale, 1, { color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd25a', speed: 0.5, life: 0.7, size: 0.4 * f.scale, grav: -3, up: 0.2 });
      if (Math.random() < dt * 4) this.smoke(f.x, f.y + 1.2 * f.scale, f.z, 1, '#555555');
      if (f.life <= 0) { const k = this.s.env.extraLights.indexOf(f.light); if (k >= 0) this.s.env.extraLights.splice(k, 1); this.fires.splice(i, 1); }
    }
  }

  dispose() {
    const sc = this.s.game.scene;
    sc.remove(this.points);
    for (const t of this.tracers) sc.remove(t.l);
    for (const f of this.flashes) sc.remove(f.l);
    for (const t of this.texts) sc.remove(t.sp);
    for (const p of this.pings) sc.remove(p.g);
  }
}
