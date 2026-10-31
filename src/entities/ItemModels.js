// Eşya modelleri: kit modeli (CC0) ya da prosedürel stilize model. Aynı model hem yerdeki eşya,
// hem eldeki eşya hem de envanter ikonu için kullanılır. Modeller en büyük boyutu "size"
// metre olacak şekilde normalize edilir ve merkezlenir.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';

const MC = new Map();
const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!MC.has(k)) MC.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0, ...o }));
  return MC.get(k);
};
const box = (w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); return m; };
const cyl = (r1, r2, h, c, x = 0, y = 0, z = 0, rx = 0, rz = 0, seg = 12, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(c, o)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); return m; };
const sph = (r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(c, o)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; };
const G = (...ch) => { const g = new THREE.Group(); for (const c of ch) g.add(c); return g; };
const METAL = { metalness: 0.6, roughness: 0.35 };

// Uzun eşyalar +X ekseni boyunca (namlu/sap ucu +X), yukarı +Y
const BUILD = {
  bandage: () => G(cyl(0.35, 0.35, 0.4, '#f5f5f0', 0, 0, 0, Math.PI / 2), cyl(0.12, 0.12, 0.42, '#e0d6c6', 0, 0, 0, Math.PI / 2)),
  medkit: () => G(box(1, 0.6, 0.35, '#e53935'), box(0.12, 0.38, 0.37, '#ffffff'), box(0.38, 0.12, 0.37, '#ffffff'), box(0.3, 0.06, 0.1, '#7f0000', 0, 0.33, 0)),
  pills_white: () => G(cyl(0.22, 0.22, 0.55, '#ffffff'), cyl(0.24, 0.24, 0.14, '#1e88e5', 0, 0.33, 0)),
  pills_box: () => G(box(0.7, 0.45, 0.25, '#ffffff'), box(0.7, 0.12, 0.26, '#43a047', 0, 0.08, 0), box(0.2, 0.06, 0.26, '#e53935', -0.2, -0.12, 0)),
  pills_black: () => G(cyl(0.22, 0.22, 0.5, '#37474f'), cyl(0.24, 0.24, 0.12, '#ffffff', 0, 0.31, 0)),
  pills_orange: () => G(cyl(0.22, 0.22, 0.5, '#fb8c00'), cyl(0.24, 0.24, 0.12, '#ffffff', 0, 0.31, 0)),
  antiseptic: () => G(cyl(0.2, 0.25, 0.7, '#8d6e63'), cyl(0.08, 0.1, 0.15, '#ffffff', 0, 0.43, 0), box(0.3, 0.25, 0.02, '#ffffff', 0, 0, 0.24)),
  splint: () => G(box(1, 0.08, 0.2, '#c8a46a', 0, 0.06, 0), box(1, 0.08, 0.2, '#c8a46a', 0, -0.06, 0), box(0.12, 0.25, 0.25, '#f5f5f0', -0.25, 0, 0), box(0.12, 0.25, 0.25, '#f5f5f0', 0.25, 0, 0)),
  plank: () => G(box(1, 0.06, 0.18, '#c69a63'), box(1, 0.01, 0.005, '#8d6e45', 0, 0.031, 0.04)),
  log: () => G(cyl(0.16, 0.16, 1, '#6d4c41', 0, 0, 0, 0, Math.PI / 2, 10), cyl(0.13, 0.13, 1.01, '#d7b48a', 0, 0, 0, 0, Math.PI / 2, 10)),
  scrap: () => G(box(0.6, 0.06, 0.4, '#8d9499', 0, 0, 0, METAL), box(0.4, 0.06, 0.3, '#b0763e', 0.1, 0.07, 0.05, METAL), cyl(0.04, 0.04, 0.6, '#6d7478', -0.1, 0.12, -0.1, 0, Math.PI / 2, 8, METAL)),
  sheet: () => G(box(0.9, 0.04, 0.6, '#a5aeb5', 0, 0, 0, METAL), box(0.9, 0.045, 0.02, '#7b858c', 0, 0, 0.15, METAL), box(0.9, 0.045, 0.02, '#7b858c', 0, 0, -0.15, METAL)),
  nails: () => { const g = G(box(0.5, 0.3, 0.35, '#8d6e63')); for (let i = 0; i < 6; i++) g.add(cyl(0.015, 0.015, 0.3, '#b0bec5', -0.15 + i * 0.06, 0.25, 0, 0.2, 0, 6, METAL)); return g; },
  screws: () => { const g = G(box(0.5, 0.3, 0.35, '#455a64')); for (let i = 0; i < 5; i++) g.add(cyl(0.025, 0.02, 0.25, '#cfd8dc', -0.15 + i * 0.07, 0.25, 0, 0, 0, 6, METAL)); return g; },
  glass_pane: () => G(box(0.8, 0.6, 0.03, '#bfe6ff', 0, 0, 0, { transparent: true, opacity: 0.6, roughness: 0.05 }), box(0.82, 0.04, 0.04, '#90a4ae', 0, 0.3, 0)),
  plastic: () => G(cyl(0.25, 0.3, 0.5, '#4fc3f7', 0, 0, 0, 0, 0, 10, { roughness: 0.3 }), cyl(0.12, 0.12, 0.1, '#0288d1', 0, 0.3, 0)),
  cloth: () => G(box(0.6, 0.12, 0.45, '#9575cd'), box(0.55, 0.1, 0.42, '#b39ddb', 0.03, 0.11, 0.01)),
  rope: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.04, 0.05, 6, 18), mat('#c8a46a')); t.rotation.x = Math.PI / 2; t.position.y = i * 0.07; g.add(t); } return g; },
  cement: () => G(box(0.7, 0.35, 0.45, '#d7ccc8'), box(0.4, 0.2, 0.01, '#5d4037', 0, 0.02, 0.23)),
  chip: () => G(box(0.7, 0.05, 0.5, '#2e7d32'), box(0.2, 0.08, 0.2, '#212121', -0.1, 0.05, 0), box(0.12, 0.12, 0.12, '#fdd835', 0.2, 0.06, 0.1), cyl(0.05, 0.05, 0.14, '#1565c0', 0.18, 0.1, -0.15)),
  wire: () => { const g = new THREE.Group(); for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 20), mat(i ? '#e53935' : '#1e88e5')); t.rotation.x = Math.PI / 2; t.position.y = i * 0.06; g.add(t); } return g; },
  tape: () => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.1, 8, 18), mat('#9e9e9e')); return G(t); },
  leather: () => G(box(0.7, 0.05, 0.5, '#8d5524'), box(0.3, 0.06, 0.2, '#6b3e1b', 0.25, 0, 0.2)),
  battery: () => G(cyl(0.12, 0.12, 0.5, '#212121', 0, 0, 0, 0, 0, 10), cyl(0.125, 0.125, 0.18, '#fbc02d', 0, 0.17, 0, 0, 0, 10), cyl(0.04, 0.04, 0.06, '#bdbdbd', 0, 0.28, 0)),
  seeds: () => G(box(0.4, 0.55, 0.06, '#fff3e0'), box(0.3, 0.3, 0.065, '#66bb6a', 0, 0.05, 0), sph(0.06, '#e53935', 0, 0.06, 0.04)),
  engine: () => G(box(0.6, 0.45, 0.45, '#546e7a', 0, 0, 0, METAL), cyl(0.1, 0.1, 0.5, '#90a4ae', -0.15, 0.3, 0, 0, 0, 10, METAL), cyl(0.1, 0.1, 0.5, '#90a4ae', 0.15, 0.3, 0, 0, 0, 10, METAL), cyl(0.18, 0.18, 0.12, '#263238', 0.35, 0, 0, 0, Math.PI / 2, 14, METAL)),
  tire: () => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 10, 20), mat('#212121', { roughness: 0.9 })); return G(t, cyl(0.2, 0.2, 0.12, '#9e9e9e', 0, 0, 0, Math.PI / 2, 0, 12, METAL)); },
  car_battery: () => G(box(0.6, 0.4, 0.35, '#263238'), box(0.6, 0.06, 0.35, '#c62828', 0, 0.22, 0), cyl(0.04, 0.04, 0.06, '#bdbdbd', -0.2, 0.27, 0), cyl(0.04, 0.04, 0.06, '#bdbdbd', 0.2, 0.27, 0)),
  jerrycan: () => G(box(0.45, 0.6, 0.22, '#c62828', 0, 0, 0, { roughness: 0.4 }), box(0.2, 0.08, 0.1, '#b71c1c', 0.05, 0.34, 0), cyl(0.05, 0.05, 0.12, '#212121', -0.15, 0.36, 0, 0, 0.5)),
  toolbox: () => G(box(0.8, 0.4, 0.35, '#e53935', 0, 0, 0, { roughness: 0.4 }), box(0.4, 0.05, 0.06, '#424242', 0, 0.3, 0), box(0.05, 0.1, 0.06, '#424242', -0.18, 0.25, 0), box(0.05, 0.1, 0.06, '#424242', 0.18, 0.25, 0), box(0.82, 0.03, 0.36, '#b71c1c', 0, 0.08, 0)),
  flashlight: () => G(cyl(0.08, 0.08, 0.45, '#37474f', 0, 0, 0, 0, Math.PI / 2, 12, METAL), cyl(0.13, 0.09, 0.15, '#263238', 0.28, 0, 0, 0, Math.PI / 2, 12, METAL), cyl(0.12, 0.12, 0.01, '#fff9c4', 0.355, 0, 0, 0, Math.PI / 2, 12, { emissive: '#fff59d', emissiveIntensity: 0.6 })),
  hammer: () => G(cyl(0.035, 0.04, 0.7, '#8d6e45', 0, 0, 0, 0, Math.PI / 2), box(0.12, 0.3, 0.1, '#546e7a', 0.37, 0.05, 0, METAL), box(0.12, 0.1, 0.08, '#546e7a', 0.37, -0.12, 0, METAL)),
  screwdriver: () => G(cyl(0.05, 0.05, 0.25, '#fbc02d', -0.12, 0, 0, 0, Math.PI / 2), cyl(0.015, 0.015, 0.3, '#b0bec5', 0.15, 0, 0, 0, Math.PI / 2, 6, METAL)),
  wrench: () => G(box(0.6, 0.05, 0.08, '#90a4ae', 0, 0, 0, METAL), box(0.12, 0.05, 0.18, '#90a4ae', 0.3, 0, 0, METAL), box(0.1, 0.05, 0.16, '#90a4ae', -0.3, 0, 0, METAL)),
  crowbar: () => G(cyl(0.025, 0.025, 0.85, '#c62828', 0, 0, 0, 0, Math.PI / 2, 8, METAL), box(0.04, 0.16, 0.04, '#c62828', 0.43, 0.06, 0, METAL), box(0.12, 0.04, 0.04, '#c62828', -0.46, -0.03, 0, METAL)),
  radio: () => G(box(0.3, 0.55, 0.14, '#263238'), box(0.22, 0.15, 0.01, '#80cbc4', 0, 0.12, 0.075, { emissive: '#26a69a', emissiveIntensity: 0.4 }), cyl(0.02, 0.02, 0.4, '#111', 0.1, 0.45, 0), cyl(0.04, 0.04, 0.03, '#e53935', -0.08, -0.12, 0.075, Math.PI / 2)),
  binoculars: () => G(cyl(0.08, 0.08, 0.3, '#212121', -0.06, 0, 0, Math.PI / 2), cyl(0.08, 0.08, 0.3, '#212121', 0.06, 0, 0, Math.PI / 2), box(0.1, 0.06, 0.1, '#37474f', 0, 0.02, 0)),
  lockpick: () => G(box(0.4, 0.02, 0.03, '#b0bec5', 0, 0, 0, METAL), box(0.03, 0.06, 0.03, '#b0bec5', 0.2, 0.03, 0, METAL), box(0.4, 0.02, 0.03, '#90a4ae', 0, 0, 0.06, METAL)),
  rod: () => G(cyl(0.015, 0.03, 1.6, '#5d4037', 0, 0, 0, 0, Math.PI / 2, 6), cyl(0.06, 0.06, 0.06, '#9e9e9e', -0.55, -0.05, 0, Math.PI / 2, 0, 10, METAL)),
  lighter: () => G(box(0.12, 0.25, 0.06, '#e53935'), box(0.1, 0.06, 0.05, '#bdbdbd', 0, 0.15, 0, METAL)),
  sleepbag: () => G(cyl(0.22, 0.22, 0.6, '#1565c0', 0, 0, 0, 0, Math.PI / 2, 12), box(0.05, 0.46, 0.46, '#0d47a1', 0.3, 0, 0)),
  backpack: () => G(box(0.5, 0.6, 0.28, '#5d7b3a'), box(0.38, 0.22, 0.08, '#4a6630', 0, -0.12, 0.17)),
  backpack_big: () => G(box(0.6, 0.85, 0.35, '#8d6e45'), box(0.45, 0.25, 0.1, '#6d5434', 0, -0.2, 0.22), cyl(0.12, 0.12, 0.55, '#c62828', 0, 0.5, 0, 0, Math.PI / 2)),
  molotov: () => G(cyl(0.12, 0.15, 0.4, '#2e7d32', 0, 0, 0, 0, 0, 10, { transparent: true, opacity: 0.8 }), cyl(0.05, 0.06, 0.15, '#2e7d32', 0, 0.27, 0), box(0.06, 0.18, 0.06, '#fff3e0', 0.02, 0.38, 0)),
  bat: () => G(cyl(0.035, 0.07, 0.95, '#c8a46a', 0, 0, 0, 0, -Math.PI / 2, 10), cyl(0.04, 0.04, 0.05, '#8d6e45', -0.47, 0, 0, 0, Math.PI / 2, 10)),
  spiked_bat: () => { const g = BUILD.bat(); for (let i = 0; i < 6; i++) g.add(cyl(0.01, 0.01, 0.16, '#cfd8dc', 0.15 + (i % 3) * 0.1, Math.cos(i) * 0.06, Math.sin(i) * 0.06, i, i * 0.7, 4, METAL)); return g; },
  machete: () => G(box(0.6, 0.1, 0.015, '#cfd8dc', 0.15, 0, 0, METAL), box(0.22, 0.06, 0.05, '#3e2723', -0.27, 0, 0)),
  pipe: () => G(cyl(0.04, 0.04, 0.9, '#78909c', 0, 0, 0, 0, Math.PI / 2, 10, METAL), cyl(0.055, 0.055, 0.08, '#607d8b', 0.42, 0, 0, 0, Math.PI / 2, 10, METAL)),
  pistol: () => G(box(0.32, 0.08, 0.05, '#263238', 0.04, 0.05, 0, METAL), box(0.08, 0.16, 0.05, '#37474f', -0.07, -0.06, 0), box(0.04, 0.04, 0.06, '#212121', 0.2, 0.06, 0, METAL), box(0.02, 0.05, 0.03, '#212121', -0.01, -0.03, 0)),
  shotgun: () => G(cyl(0.03, 0.03, 0.75, '#263238', 0.25, 0.03, 0, 0, Math.PI / 2, 8, METAL), cyl(0.025, 0.025, 0.6, '#37474f', 0.2, -0.03, 0, 0, Math.PI / 2, 8, METAL), box(0.25, 0.1, 0.06, '#6d4c41', -0.05, 0, 0), box(0.35, 0.09, 0.06, '#8d6e45', -0.33, -0.06, 0, undefined), box(0.14, 0.06, 0.08, '#8d6e45', 0.2, -0.04, 0)),
  rifle: () => G(cyl(0.022, 0.022, 0.75, '#263238', 0.32, 0.04, 0, 0, Math.PI / 2, 8, METAL), box(0.5, 0.09, 0.06, '#6d4c41', 0.05, 0, 0), box(0.32, 0.12, 0.06, '#8d6e45', -0.33, -0.05, 0), cyl(0.04, 0.04, 0.3, '#212121', 0.1, 0.12, 0, 0, Math.PI / 2, 10, METAL), box(0.03, 0.08, 0.03, '#212121', 0.02, -0.06, 0)),
  smg: () => G(box(0.45, 0.1, 0.07, '#37474f', 0.05, 0.03, 0, METAL), cyl(0.02, 0.02, 0.2, '#263238', 0.36, 0.04, 0, 0, Math.PI / 2, 8, METAL), box(0.06, 0.22, 0.05, '#263238', 0.08, -0.12, 0), box(0.07, 0.14, 0.05, '#212121', -0.06, -0.08, 0), box(0.18, 0.06, 0.05, '#455a64', -0.25, 0, 0)),
  bow: () => { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 20, Math.PI * 0.75), mat('#6d4c41')); t.rotation.z = Math.PI / 2 + Math.PI * 0.125 - Math.PI / 2; g.add(t); g.add(box(0.005, 1.0, 0.005, '#eeeeee', -0.06, 0, 0)); g.add(box(0.06, 0.16, 0.06, '#3e2723', 0.52, 0, 0)); g.rotation.z = 0; return g; },
  ammo_box: () => G(box(0.45, 0.25, 0.3, '#5d4037'), box(0.46, 0.06, 0.31, '#fbc02d', 0, 0.06, 0)),
  ammo_box_green: () => G(box(0.45, 0.25, 0.3, '#33691e'), box(0.46, 0.06, 0.31, '#fbc02d', 0, 0.06, 0)),
  shells: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { g.add(cyl(0.05, 0.05, 0.28, '#c62828', -0.12 + i * 0.08, 0, 0)); g.add(cyl(0.052, 0.052, 0.07, '#fbc02d', -0.12 + i * 0.08, -0.12, 0, 0, 0, 10, METAL)); } return g; },
  vest: () => G(box(0.55, 0.6, 0.18, '#37474f'), box(0.2, 0.12, 0.06, '#263238', -0.13, -0.1, 0.11), box(0.2, 0.12, 0.06, '#263238', 0.13, -0.1, 0.11), box(0.16, 0.2, 0.19, '#263238', 0, 0.3, 0)),
  helmet: () => G(sph(0.3, '#4b5320', 0, 0, 0, 1, 0.75, 1.1), box(0.62, 0.03, 0.7, '#3e4419', 0, -0.05, 0)),
  jacket: () => G(box(0.6, 0.65, 0.2, '#6d4c41'), box(0.18, 0.55, 0.18, '#5d4037', -0.38, -0.02, 0), box(0.18, 0.55, 0.18, '#5d4037', 0.38, -0.02, 0), box(0.03, 0.6, 0.21, '#3e2723', 0, 0, 0.01)),
  raincoat: () => G(box(0.6, 0.7, 0.2, '#fdd835'), box(0.18, 0.55, 0.18, '#fbc02d', -0.38, -0.02, 0), box(0.18, 0.55, 0.18, '#fbc02d', 0.38, -0.02, 0)),
  gloves: () => G(box(0.22, 0.32, 0.1, '#a1887f', -0.14, 0, 0), box(0.22, 0.32, 0.1, '#a1887f', 0.14, 0, 0), box(0.07, 0.12, 0.09, '#8d6e63', -0.28, 0.06, 0), box(0.07, 0.12, 0.09, '#8d6e63', 0.28, 0.06, 0)),
  keycard: () => G(box(0.5, 0.32, 0.02, '#7e57c2'), box(0.15, 0.15, 0.022, '#ffeb3b', -0.13, 0.03, 0), box(0.3, 0.04, 0.022, '#ede7f6', 0.08, -0.08, 0)),
  note: () => G(box(0.42, 0.01, 0.55, '#fff8e1'), box(0.3, 0.012, 0.02, '#8d6e63', 0, 0, -0.1), box(0.3, 0.012, 0.02, '#8d6e63', 0, 0, 0), box(0.2, 0.012, 0.02, '#8d6e63', -0.05, 0, 0.1)),
  map: () => G(box(0.6, 0.02, 0.45, '#d7ccc8'), box(0.3, 0.025, 0.2, '#81c784', -0.08, 0, 0.03), box(0.15, 0.025, 0.1, '#4fc3f7', 0.15, 0, -0.1)),
  vial: () => G(cyl(0.08, 0.08, 0.4, '#76ff03', 0, 0, 0, 0, 0, 10, { emissive: '#64dd17', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }), cyl(0.09, 0.09, 0.08, '#eceff1', 0, 0.23, 0)),
  money: () => G(box(0.5, 0.06, 0.25, '#66bb6a'), box(0.1, 0.07, 0.26, '#2e7d32', 0, 0, 0)),
  tag: () => G(box(0.3, 0.18, 0.02, '#b0bec5', 0, 0, 0, METAL), cyl(0.008, 0.008, 0.5, '#9e9e9e', 0, 0.2, 0, 0, Math.PI / 2, 4)),
};

/** Eşyanın hedef boyutu (en büyük boyut, metre) */
function sizeFor(id) {
  const def = ITEMS[id] || {};
  const S = {
    plank: 1.0, log: 0.9, sheet: 0.8, scrap: 0.6, tire: 0.7, engine: 0.55, car_battery: 0.45, jerrycan: 0.5, concrete: 0.55, cement: 0.55,
    bat: 0.9, spiked_bat: 0.9, axe: 0.75, shovel: 1.15, crowbar: 0.8, pipe: 0.9, machete: 0.65, knife: 0.32, hammer: 0.38, wrench: 0.35, screwdriver: 0.25,
    pistol: 0.26, shotgun: 1.0, rifle: 1.1, smg: 0.65, bow: 1.05, crossbow: 0.8, fishing_rod: 1.4, flashlight: 0.25, radio: 0.22, binoculars: 0.2,
    backpack_small: 0.5, backpack_large: 0.7, vest: 0.55, helmet: 0.32, warm_jacket: 0.7, raincoat: 0.7, sleeping_bag: 0.65, repair_kit: 0.45, first_aid: 0.35,
    stew: 0.35, mre: 0.3, water_bottle: 0.3, dirty_water: 0.3, empty_bottle: 0.2, arrow: 0.7, bolt: 0.45, rope: 0.35, armor_kit: 0.8,
  };
  if (S[id]) return S[id];
  return def.cat === 'food' || def.cat === 'drink' || def.cat === 'med' ? 0.2 : 0.25;
}

export class ItemModels {
  constructor(assets) { this.assets = assets; this.proto = new Map(); }

  /** Normalize edilmiş, bağımsız bir kopya döndürür (paylaşılan geometri/malzeme) */
  make(id) {
    if (!this.proto.has(id)) this.proto.set(id, this.build(id));
    const p = this.proto.get(id);
    const c = p.clone(true);
    return c;
  }

  build(id) {
    const def = ITEMS[id];
    let raw;
    const m = def && def.model;
    if (Array.isArray(m) && this.assets.has(m[0], m[1])) raw = this.assets.model(m[0], m[1]);
    else if (typeof m === 'string' && BUILD[m]) raw = BUILD[m]();
    else raw = G(box(0.4, 0.4, 0.4, '#9e9e9e'));
    // kit modelleri: uzun eksen +X'e gelsin
    const bb = new THREE.Box3().setFromObject(raw);
    const size = bb.getSize(new THREE.Vector3());
    const inner = new THREE.Group();
    inner.add(raw);
    if (Array.isArray(m) && size.z > size.x * 1.4 && size.z >= size.y) inner.rotation.y = -Math.PI / 2;
    if (Array.isArray(m) && size.y > size.x * 1.8 && ['axe', 'knife', 'shovel', 'arrow', 'bolt'].includes(id)) inner.rotation.z = -Math.PI / 2;
    const outer = new THREE.Group();
    outer.add(inner);
    outer.updateMatrixWorld(true);
    const bb2 = new THREE.Box3().setFromObject(outer);
    const s2 = bb2.getSize(new THREE.Vector3());
    const c2 = bb2.getCenter(new THREE.Vector3());
    inner.position.sub(c2);
    const k = sizeFor(id) / Math.max(s2.x, s2.y, s2.z, 1e-3);
    outer.scale.setScalar(k);
    outer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const fin = new THREE.Group();
    fin.add(outer);
    fin.userData.itemId = id;
    fin.userData.size = sizeFor(id);
    return fin;
  }
}

/** Envanter ikonları: her eşya modelini küçük bir dokuya çizer (önbellekli dataURL) */
export class IconRenderer {
  constructor(renderer, itemModels) {
    this.renderer = renderer;
    this.models = itemModels;
    this.cache = new Map();
    this.size = 128;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 3, 4); this.scene.add(d);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { colorSpace: THREE.SRGBColorSpace });
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
  }

  icon(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const obj = this.models.make(id);
    obj.rotation.set(0.45, -0.7, 0.12);
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()).length();
    this.cam.position.set(c.x, c.y + s * 0.15, c.z + s * 1.9);
    this.cam.lookAt(c);
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevTM = r.toneMapping;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    r.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    r.setRenderTarget(prevRT);
    r.toneMapping = prevTM;
    this.scene.remove(obj);
    const g = this.canvas.getContext('2d');
    const img = g.createImageData(this.size, this.size);
    for (let y = 0; y < this.size; y++) img.data.set(px.subarray((this.size - 1 - y) * this.size * 4, (this.size - y) * this.size * 4), y * this.size * 4);
    g.putImageData(img, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(id, url);
    return url;
  }
}
