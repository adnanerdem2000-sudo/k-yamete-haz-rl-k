// Stilize su: derinliğe göre renk (sığ turkuaz → derin mavi), kıyı köpüğü, dalga parıltısı.
// Arazi yükseklik haritası bir doku olarak gölgelendiriciye verilir.
import * as THREE from 'three';
import { WORLD, LAKE } from './WorldLayout.js';

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
    };
    this.material = this.makeMaterial(WORLD.sea);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), this.material);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = WORLD.sea;
    sea.name = 'sea';
    sea.renderOrder = 1;
    scene.add(sea);
    this.lakeMat = this.makeMaterial(LAKE.level, true);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 10, 48), this.lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(LAKE.x, LAKE.level, LAKE.z);
    lake.name = 'lake';
    lake.renderOrder = 1;
    scene.add(lake);
    this.meshes = [sea, lake];
  }

  makeMaterial(level, lake = false) {
    const u = { ...this.uniforms, uLevel: { value: level } };
    if (lake) { u.uShallow = { value: new THREE.Color('#6fcf9f') }; u.uDeep = { value: new THREE.Color('#1f6a6a') }; }
    return new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uHeight; uniform float uTime, uLevel, uFogDensity, uDark, uRain; uniform vec3 uSunDir, uSunColor, uShallow, uDeep, uSky, uFogColor;
        varying vec3 vW;
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

  update(t, sunDir, sunColor, fogColor, fogDensity, dark = 1, rain = 0) {
    for (const m of [this.material, this.lakeMat]) {
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
