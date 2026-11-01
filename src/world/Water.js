// Stilize su: derinliğe göre renk (sığ turkuaz → derin mavi), kıyı köpüğü, dalga parıltısı.
// Arazi yükseklik haritası bir doku olarak gölgelendiriciye verilir.
import * as THREE from 'three';
import { WORLD, LAKES } from './WorldLayout.js';
import { Settings } from '../core/Settings.js';

// düzlemsel yansıma (Ultra / "Su yansımaları"): sanal kamera su düzlemine göre aynalanır, sahne düşük çözünürlüklü bir
// hedefe çizilir (su gizli, eğik yakın düzlemle su altı kırpılır); su gölgelendiricisi Fresnel ile karıştırır.
// three.js Reflector (MIT) yaklaşımı. Yalnız kamera suya yakınken ve suyun üstündeyken çizilir.
const _n = new THREE.Vector3(0, 1, 0), _rp = new THREE.Vector3(), _cp = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3(), _plane = new THREE.Plane();
const _clip = new THREE.Vector4(), _q = new THREE.Vector4(), _size = new THREE.Vector2();

export class Water {
  constructor(terrain, scene) {
    const V = terrain.N + 1;
    const data = new Float32Array(V * V);
    data.set(terrain.h);
    const tex = new THREE.DataTexture(data, V, V, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms = {
      uHeight: { value: tex }, uTime: { value: 0 }, uLevel: { value: WORLD.sea },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uShallow: { value: new THREE.Color('#57d3c6') }, uDeep: { value: new THREE.Color('#1c5c8c') }, uSky: { value: new THREE.Color('#9fd3ff') },
      uFogColor: { value: new THREE.Color('#cfe6f5') }, uFogDensity: { value: 0.0015 }, uDark: { value: 1 }, uRain: { value: 0 },
      uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() },
    };
    this.terrain = terrain;
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflRT = null;
    this.reflCount = 0; // test/ölçüm: kaç kez yansıma çizildi
    this._pickT = 0; this._pick = null;
    this.material = this.makeMaterial(WORLD.sea);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 3, WORLD.size * 3, 1, 1), this.material);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = WORLD.sea;
    sea.name = 'sea';
    sea.renderOrder = 1;
    scene.add(sea);
    this.meshes = [sea];
    this.lakeMats = [];
    for (const L of LAKES) {
      const mat = this.makeMaterial(L.level, true);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(L.r + 10, 56), mat);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(L.x, L.level, L.z);
      lake.name = 'lake';
      lake.renderOrder = 1;
      scene.add(lake);
      this.meshes.push(lake);
      this.lakeMats.push(mat);
    }
    this.lakeMat = this.lakeMats[0];
  }

  makeMaterial(level, lake = false) {
    const u = { ...this.uniforms, uLevel: { value: level }, uReflOn: { value: 0 } };
    if (lake) { u.uShallow = { value: new THREE.Color('#6fcf9f') }; u.uDeep = { value: new THREE.Color('#1f6a6a') }; }
    return new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`uniform mat4 uReflMat; varying vec3 vW; varying vec4 vRc; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vRc = uReflMat * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uHeight; uniform float uTime, uLevel, uFogDensity, uDark, uRain, uReflOn; uniform vec3 uSunDir, uSunColor, uShallow, uDeep, uSky, uFogColor;
        uniform sampler2D uRefl;
        varying vec3 vW; varying vec4 vRc;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 uv = (vW.xz + ${WORLD.half.toFixed(1)}) / ${WORLD.size.toFixed(1)};
          float h = -30.0;
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) h = texture2D(uHeight, uv).r;
          float depth = uLevel - h;
          if (depth < -0.05) discard;
          vec2 p = vW.xz * 0.12;
          float n1 = noise(p + vec2(uTime*0.35, uTime*0.2));
          float n2 = noise(p*2.3 - vec2(uTime*0.25, uTime*0.4));
          vec3 nrm = normalize(vec3((n1-0.5)*0.35, 1.0, (n2-0.5)*0.35));
          vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 9.0, depth));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);
          col = mix(col, uSky, fres * 0.45);
          // gerçek yansıma (Ultra): dalga normaliyle hafif bozulmuş, Fresnel ağırlıklı
          if (uReflOn > 0.5) {
            vec2 ruv = clamp(vRc.xy / vRc.w + nrm.xz * 0.035, 0.002, 0.998);
            vec3 rc = texture2D(uRefl, ruv).rgb;
            col = mix(col, rc, clamp(0.22 + fres * 0.6, 0.0, 0.78));
          }
          vec3 R = reflect(-V, nrm);
          float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 120.0);
          col += uSunColor * spec * 1.6;
          // kıyı köpüğü
          float foamBand = smoothstep(1.1, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 2.2 + depth * 9.0 + n1 * 6.0));
          float foam = foamBand * smoothstep(0.35, 0.65, noise(vW.xz * 0.6 + uTime*0.3));
          col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);
          // yağmur damlaları
          col += uRain * 0.12 * step(0.985, noise(vW.xz * 4.0 + floor(uTime*6.0)));
          col *= uDark;
          float alpha = clamp(0.55 + depth * 0.18, 0.55, 0.93);
          alpha = max(alpha, foam * 0.9);
          float fd = length(cameraPosition - vW);
          float fog = 1.0 - exp(-pow(uFogDensity * fd, 2.0));
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
    });
  }

  /** Yansıtılacak su: kameraya en yakın göl (kıyısına 150 m) ya da kamera kıyıdaysa deniz; 0,5 sn'de bir seçilir */
  pickWater(cam) {
    const now = performance.now();
    if (now - this._pickT < 500) return this._pick;
    this._pickT = now;
    let best = null, bd = Infinity;
    for (let i = 0; i < LAKES.length; i++) {
      const L = LAKES[i];
      const d = Math.hypot(cam.x - L.x, cam.z - L.z) - L.r;
      if (d < 150 && d < bd && cam.y > L.level + 0.3) { bd = d; best = { mat: this.lakeMats[i], level: L.level }; }
    }
    if (!best && cam.y > WORLD.sea + 0.3) {
      // kıyı: kameranın çevresinde (60/140 m) arazi deniz seviyesinin altına iniyorsa deniz görünür
      const T = this.terrain;
      let sea = T.heightAt(cam.x, cam.z) < WORLD.sea + 6;
      for (let k = 0; k < 8 && !sea; k++) {
        const a = (k / 8) * Math.PI * 2;
        for (const r of [60, 140]) if (T.heightAt(cam.x + Math.cos(a) * r, cam.z + Math.sin(a) * r) < WORLD.sea) { sea = true; break; }
      }
      if (sea) best = { mat: this.material, level: WORLD.sea };
    }
    this._pick = best;
    return best;
  }

  /** Graphics.beforeRender kancası: ayar açıksa ve su yakındaysa yansımayı çiz */
  renderReflection(renderer, scene, camera) {
    const on = Settings.get('graphics.waterRefl');
    const pick = on ? this.pickWater(camera.position) : null;
    for (const m of [this.material, ...this.lakeMats]) m.uniforms.uReflOn.value = pick && m === pick.mat ? 1 : 0;
    if (!pick) return;
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(64, Math.round(_size.x / 3)), h = Math.max(64, Math.round(_size.y / 3));
    if (!this.reflRT) { this.reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }); this.uniforms.uRefl.value = this.reflRT.texture; }
    else if (this.reflRT.width !== w || this.reflRT.height !== h) this.reflRT.setSize(w, h);
    // sanal (aynalı) kamera
    _rp.set(0, pick.level, 0);
    camera.updateMatrixWorld();
    _cp.setFromMatrixPosition(camera.matrixWorld);
    _rot.extractRotation(camera.matrixWorld);
    _view.subVectors(_rp, _cp);
    _view.x = 0; _view.z = 0; // yatay düzlem: yalnız yükseklik farkı
    if (_view.dot(_n) > 0) return; // kamera suyun altında
    const V = this.reflCam;
    V.position.set(_cp.x, 2 * pick.level - _cp.y, _cp.z);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _tgt.set(_look.x, 2 * pick.level - _look.y, _look.z);
    V.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    V.lookAt(_tgt);
    V.far = camera.far; V.near = camera.near;
    V.updateMatrixWorld();
    V.projectionMatrix.copy(camera.projectionMatrix);
    // doku matrisi (dünya → yansıma UV)
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(V.projectionMatrix).multiply(V.matrixWorldInverse);
    // eğik yakın düzlem: su düzleminin altını kırp
    _plane.setFromNormalAndCoplanarPoint(_n, _rp).applyMatrix4(V.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = V.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1 - 0.003; e[14] = _clip.w;
    V.projectionMatrixInverse.copy(V.projectionMatrix).invert();
    // çiz: su gizli, gölge haritası yeniden hesaplanmaz
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate, prevXR = renderer.xr.enabled;
    for (const m of this.meshes) m.visible = false;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.reflRT);
    renderer.clear();
    renderer.render(scene, V);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow; renderer.xr.enabled = prevXR;
    for (const m of this.meshes) m.visible = true;
    this.reflCount++;
  }

  update(t, sunDir, sunColor, fogColor, fogDensity, dark = 1, rain = 0) {
    for (const m of [this.material, ...this.lakeMats]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uSunDir.value.copy(sunDir);
      m.uniforms.uSunColor.value.copy(sunColor);
      m.uniforms.uFogColor.value.copy(fogColor);
      m.uniforms.uFogDensity.value = fogDensity;
      m.uniforms.uDark.value = dark;
      m.uniforms.uRain.value = rain;
    }
  }
}
