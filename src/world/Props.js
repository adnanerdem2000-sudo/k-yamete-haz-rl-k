// Prosedürel dünya donanımları (Geo ile dünya koordinatında çizilir).
// Her fonksiyon (geo, ...) alır ve gerekirse çarpışma kutularını döndürür.

const PI = Math.PI;

/** Dönüşlü yerel kutu: merkez (cx, cy, cz), açı a (radyan, Y ekseni), yerel kutu sınırları */
export function rbox(geo, mat, cx, cy, cz, a, x0, y0, z0, x1, y1, z1, color) {
  const c = Math.cos(a), s = Math.sin(a);
  const T = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const p = [T(x0, y0, z0), T(x1, y0, z0), T(x1, y0, z1), T(x0, y0, z1), T(x0, y1, z0), T(x1, y1, z0), T(x1, y1, z1), T(x0, y1, z1)];
  // yüzler (dışa bakan, saat yönünün tersi)
  geo.quad(mat, p[3], p[2], p[6], p[7], color); // +z
  geo.quad(mat, p[1], p[0], p[4], p[5], color); // -z
  geo.quad(mat, p[2], p[1], p[5], p[6], color); // +x
  geo.quad(mat, p[0], p[3], p[7], p[4], color); // -x
  geo.quad(mat, p[7], p[6], p[5], p[4], color); // +y
  geo.quad(mat, p[0], p[1], p[2], p[3], color); // -y
}

export function gasCanopy(geo, x, y, z, a, w = 18, d = 10) {
  const h = 5.2;
  for (const [px, pz] of [[-w / 2 + 1, -d / 2 + 1], [w / 2 - 1, -d / 2 + 1], [-w / 2 + 1, d / 2 - 1], [w / 2 - 1, d / 2 - 1]]) rbox(geo, 'metal', x, y, z, a, px - 0.25, 0, pz - 0.25, px + 0.25, h, pz + 0.25, '#e8e8e8');
  rbox(geo, 'plain', x, y, z, a, -w / 2, h, -d / 2, w / 2, h + 0.8, d / 2, '#f5f5f5');
  rbox(geo, 'plain', x, y, z, a, -w / 2 - 0.05, h + 0.25, -d / 2 - 0.05, w / 2 + 0.05, h + 0.6, d / 2 + 0.05, '#e67e22');
  rbox(geo, 'emissive', x, y, z, a, -w / 2 + 1.5, h - 0.05, -0.4, w / 2 - 1.5, h, 0.4, '#fffbe6');
}

export function fuelPump(geo, x, y, z, a) {
  rbox(geo, 'concrete', x, y, z, a, -0.9, 0, -0.5, 0.9, 0.18, 0.5, '#bdbdbd');
  rbox(geo, 'plain', x, y, z, a, -0.45, 0.18, -0.3, 0.45, 1.9, 0.3, '#ecf0f1');
  rbox(geo, 'plain', x, y, z, a, -0.45, 1.5, -0.31, 0.45, 1.9, 0.31, '#e67e22');
  rbox(geo, 'emissive', x, y, z, a, -0.3, 1.1, 0.3, 0.3, 1.4, 0.32, '#2ecc71');
  rbox(geo, 'emissive', x, y, z, a, -0.3, 1.1, -0.32, 0.3, 1.4, -0.3, '#2ecc71');
  rbox(geo, 'plain', x, y, z, a, 0.45, 0.6, -0.05, 0.55, 1.3, 0.05, '#212121');
}

export function shippingContainer(geo, x, y, z, a, color, len = 6.1) {
  const w = 2.44, h = 2.6;
  rbox(geo, 'metal', x, y, z, a, -len / 2, 0, -w / 2, len / 2, h, w / 2, color);
  for (let i = -len / 2 + 0.3; i < len / 2; i += 0.6) {
    rbox(geo, 'metal', x, y, z, a, i, 0.1, w / 2, i + 0.25, h - 0.1, w / 2 + 0.05, color);
    rbox(geo, 'metal', x, y, z, a, i, 0.1, -w / 2 - 0.05, i + 0.25, h - 0.1, -w / 2, color);
  }
  rbox(geo, 'metal', x, y, z, a, len / 2, 0.05, -w / 2 + 0.05, len / 2 + 0.06, h - 0.05, w / 2 - 0.05, '#555');
  return { len, w, h };
}

export function fuelTank(geo, x, y, z, r = 3.2, h = 7, color = '#ecf0f1') {
  geo.cylinder('metal', x, y, z, r, h, color, 18);
  geo.cylinder('metal', x, y + h, z, r * 0.7, 0.4, '#bdc3c7', 18);
  for (let k = 0; k < 4; k++) geo.cylinder('metal', x, y + 1 + k * 1.6, z, r + 0.05, 0.12, '#95a5a6', 18, false);
  // merdiven
  for (let i = 0; i < h; i += 0.5) geo.box('metal', x + r, y + i, z - 0.3, x + r + 0.08, y + i + 0.05, z + 0.3, '#7f8c8d');
}

export function crane(geo, x, y, z, a, height = 22, arm = 18, color = '#f1c40f') {
  const s = 0.9;
  for (let i = 0; i < height; i += 2) {
    rbox(geo, 'metal', x, y, z, a, -s, i, -s, -s + 0.15, i + 2, -s + 0.15, color);
    rbox(geo, 'metal', x, y, z, a, s - 0.15, i, -s, s, i + 2, -s + 0.15, color);
    rbox(geo, 'metal', x, y, z, a, -s, i, s - 0.15, -s + 0.15, i + 2, s, color);
    rbox(geo, 'metal', x, y, z, a, s - 0.15, i, s - 0.15, s, i + 2, s, color);
    rbox(geo, 'metal', x, y, z, a, -s, i + 1.9, -s, s, i + 2, s, color);
  }
  rbox(geo, 'metal', x, y, z, a, -4, height, -0.6, arm, height + 1.2, 0.6, color);
  rbox(geo, 'metal', x, y, z, a, -1.2, height + 1.2, -1.0, 1.2, height + 3.0, 1.0, '#2c3e50');
  rbox(geo, 'metal', x, y, z, a, -4.5, height - 1.5, -1.2, -2.5, height, 1.2, '#7f8c8d');
  rbox(geo, 'plain', x, y, z, a, arm - 3, height - 6, -0.05, arm - 2.9, height, 0.05, '#212121');
}

export function concreteWall(geo, x0, z0, x1, z1, y, h = 3.2, t = 0.5, color = '#a8a491') {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const a = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  rbox(geo, 'concrete', cx, y, cz, a, -len / 2, 0, -t / 2, len / 2, h, t / 2, color);
  rbox(geo, 'concrete', cx, y, cz, a, -len / 2, h, -t / 2 - 0.05, len / 2, h + 0.15, t / 2 + 0.05, '#8d8a7a');
  // dikenli tel
  for (let i = -len / 2; i < len / 2; i += 1.2) rbox(geo, 'metal', cx, y, cz, a, i, h + 0.15, -0.03, i + 0.6, h + 0.55, 0.03, '#7f8c8d');
}

export function watchTower(geo, x, y, z, h = 6) {
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) geo.box('wood', x + dx - 0.12, y, z + dz - 0.12, x + dx + 0.12, y + h, z + dz + 0.12, '#6e4b2a');
  geo.box('wood', x - 1.7, y + h, z - 1.7, x + 1.7, y + h + 0.15, z + 1.7, '#8b6239');
  for (const [a, b, c, d] of [[-1.7, -1.7, 1.7, -1.6], [-1.7, 1.6, 1.7, 1.7], [-1.7, -1.7, -1.6, 1.7], [1.6, -1.7, 1.7, 1.7]]) geo.box('wood', x + a, y + h + 0.15, z + b, x + c, y + h + 1.1, z + d, '#7a5530');
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) geo.box('wood', x + dx - 0.07, y + h, z + dz - 0.07, x + dx + 0.07, y + h + 2.4, z + dz + 0.07, '#6e4b2a');
  geo.quad('wood', [x - 2.1, y + h + 2.4, z + 2.1], [x + 2.1, y + h + 2.4, z + 2.1], [x + 2.1, y + h + 2.4, z - 2.1], [x - 2.1, y + h + 2.4, z - 2.1], '#5b3f22');
  // merdiven
  for (let i = 0; i < h; i += 0.45) geo.box('wood', x + 1.45, y + i, z - 0.35, x + 1.55, y + i + 0.06, z + 0.35, '#8b6239');
}

export function sandbags(geo, x0, z0, x1, z1, y, h = 1.0) {
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rows = Math.round(h / 0.25);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0.3 : 0;
    for (let i = -len / 2 + off; i < len / 2 - 0.3; i += 0.6) rbox(geo, 'plain', cx, y, cz, a, i, r * 0.25, -0.3, i + 0.58, r * 0.25 + 0.24, 0.3, r % 2 ? '#c8b78e' : '#bba97c');
  }
}

export function helipad(geo, x, y, z) {
  geo.cylinder('concrete', x, y, z, 9, 0.12, '#6f7073', 32);
  geo.cylinder('plain', x, y + 0.121, z, 7.6, 0.01, '#f4d03f', 32, true);
  geo.cylinder('concrete', x, y + 0.122, z, 7.2, 0.01, '#6f7073', 32, true);
  geo.box('plain', x - 2.2, y + 0.13, z - 3, x - 1.4, y + 0.14, z + 3, '#ffffff');
  geo.box('plain', x + 1.4, y + 0.13, z - 3, x + 2.2, y + 0.14, z + 3, '#ffffff');
  geo.box('plain', x - 1.4, y + 0.13, z - 0.4, x + 1.4, y + 0.14, z + 0.4, '#ffffff');
}

export function dock(geo, x, z, y, len, w, a) {
  rbox(geo, 'wood', x, y, z, a, -w / 2, -0.2, 0, w / 2, 0, len, '#9c7650');
  for (let i = 0; i <= len; i += 3) for (const s of [-w / 2 + 0.2, w / 2 - 0.2]) {
    rbox(geo, 'wood', x, y, z, a, s - 0.15, -6, i - 0.15, s + 0.15, 0.6, i + 0.15, '#6d4c33');
  }
  for (let i = 0.5; i < len; i += 0.5) rbox(geo, 'wood', x, y, z, a, -w / 2, 0, i, w / 2, 0.01, i + 0.04, '#7d5a3a');
}

export function playground(geo, x, y, z) {
  // kaydırak
  geo.box('metal', x - 0.6, y, z - 2, x - 0.5, y + 2.2, z - 1.9, '#2980b9');
  geo.box('metal', x + 0.5, y, z - 2, x + 0.6, y + 2.2, z - 1.9, '#2980b9');
  geo.box('plain', x - 0.6, y + 2.0, z - 2.2, x + 0.6, y + 2.15, z - 1.4, '#e74c3c');
  geo.quad('shiny', [x - 0.45, y + 0.1, z + 1.8], [x + 0.45, y + 0.1, z + 1.8], [x + 0.45, y + 2.05, z - 1.4], [x - 0.45, y + 2.05, z - 1.4], '#f1c40f');
  for (let i = 0; i < 6; i++) geo.box('metal', x - 0.5, y + i * 0.35, z - 2.2 - 0.05, x + 0.5, y + i * 0.35 + 0.05, z - 2.2 + 0.05, '#2980b9');
  // salıncak
  const sx = x + 5;
  geo.box('metal', sx - 2, y, z - 0.1, sx - 1.9, y + 2.5, z + 0.1, '#c0392b');
  geo.box('metal', sx + 1.9, y, z - 0.1, sx + 2, y + 2.5, z + 0.1, '#c0392b');
  geo.box('metal', sx - 2, y + 2.4, z - 0.1, sx + 2, y + 2.55, z + 0.1, '#c0392b');
  for (const o of [-0.9, 0.9]) {
    geo.box('plain', sx + o - 0.02, y + 0.6, z - 0.02, sx + o + 0.02, y + 2.4, z + 0.02, '#7f8c8d');
    geo.box('plain', sx + o + 0.4 - 0.02, y + 0.6, z - 0.02, sx + o + 0.42, y + 2.4, z + 0.02, '#7f8c8d');
    geo.box('plain', sx + o - 0.05, y + 0.55, z - 0.2, sx + o + 0.45, y + 0.62, z + 0.2, '#16a085');
  }
  // kum havuzu
  geo.box('wood', x - 6, y, z - 1.5, x - 3, y + 0.25, z + 1.5, '#a0522d');
  geo.box('plain', x - 5.8, y + 0.05, z - 1.3, x - 3.2, y + 0.2, z + 1.3, '#f4e3b2');
}

export function generatorModel(geo, x, y, z, a, broken = true) {
  rbox(geo, 'metal', x, y, z, a, -0.75, 0, -0.5, 0.75, 0.15, 0.5, '#2c3e50');
  rbox(geo, 'metal', x, y, z, a, -0.7, 0.15, -0.45, 0.7, 0.95, 0.45, broken ? '#b03a2e' : '#d35400');
  rbox(geo, 'metal', x, y, z, a, -0.5, 0.95, -0.35, 0.3, 1.15, 0.35, '#7f8c8d');
  rbox(geo, 'metal', x, y, z, a, 0.35, 0.3, 0.45, 0.65, 0.8, 0.5, '#1c2833');
  for (let i = 0; i < 4; i++) rbox(geo, 'metal', x, y, z, a, -0.6 + i * 0.12, 0.3, 0.45, -0.55 + i * 0.12, 0.85, 0.48, '#212f3d');
  rbox(geo, 'metal', x, y, z, a, -0.75, 0.15, -0.5, -0.7, 1.15, 0.5, '#1b2631');
  rbox(geo, 'metal', x, y, z, a, 0.7, 0.15, -0.5, 0.75, 1.15, 0.5, '#1b2631');
}

export function bunkerHatch(geo, x, y, z) {
  geo.box('concrete', x - 1.3, y - 0.2, z - 1.3, x + 1.3, y + 0.25, z + 1.3, '#9e9a90');
  geo.box('metal', x - 0.85, y + 0.25, z - 0.85, x + 0.85, y + 0.35, z + 0.85, '#556b2f');
  geo.cylinder('metal', x, y + 0.35, z, 0.35, 0.08, '#7f8c8d', 12);
  geo.box('metal', x - 0.04, y + 0.43, z - 0.3, x + 0.04, y + 0.48, z + 0.3, '#5d6d7e');
}

export function campfirePit(geo, x, y, z) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2;
    geo.box('concrete', x + Math.cos(a) * 0.75 - 0.15, y, z + Math.sin(a) * 0.75 - 0.15, x + Math.cos(a) * 0.75 + 0.15, y + 0.22, z + Math.sin(a) * 0.75 + 0.15, '#7f7f7f');
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI;
    rbox(geo, 'wood', x, y + 0.08, z, a, -0.55, 0, -0.07, 0.55, 0.14, 0.07, '#5d4037');
  }
}

export function woodpile(geo, x, y, z, a) {
  for (let r = 0; r < 4; r++) for (let i = 0; i < 5 - r; i++) {
    const zz = -0.9 + i * 0.36 + r * 0.18;
    rbox(geo, 'wood', x, y + 0.17 + r * 0.32, z, a, -0.8, -0.16, zz - 0.16, 0.8, 0.16, zz + 0.16, i % 2 ? '#8d6e63' : '#795548');
  }
}

export function mailbox(geo, x, y, z, a, color = '#2c3e50') {
  rbox(geo, 'wood', x, y, z, a, -0.05, 0, -0.05, 0.05, 1.0, 0.05, '#6d4c41');
  rbox(geo, 'metal', x, y, z, a, -0.2, 1.0, -0.14, 0.2, 1.28, 0.14, color);
  rbox(geo, 'plain', x, y, z, a, 0.2, 1.15, 0.0, 0.22, 1.35, 0.05, '#c0392b');
}

export function powerPole(geo, x, y, z, a) {
  geo.cylinder('wood', x, y, z, 0.13, 8.2, '#6d4c41', 6);
  rbox(geo, 'wood', x, y, z, a, -1.0, 7.4, -0.07, 1.0, 7.55, 0.07, '#5d4037');
  for (const o of [-0.85, 0, 0.85]) rbox(geo, 'plain', x, y, z, a, o - 0.05, 7.55, -0.05, o + 0.05, 7.75, 0.05, '#ecf0f1');
}

export function busStop(geo, x, y, z, a) {
  rbox(geo, 'metal', x, y, z, a, -1.6, 0, -0.6, -1.5, 2.4, -0.5, '#7f8c8d');
  rbox(geo, 'metal', x, y, z, a, 1.5, 0, -0.6, 1.6, 2.4, -0.5, '#7f8c8d');
  rbox(geo, 'glass', x, y, z, a, -1.5, 0.3, -0.6, 1.5, 2.3, -0.56, '#d6eaf8');
  rbox(geo, 'plain', x, y, z, a, -1.8, 2.4, -0.9, 1.8, 2.55, 0.6, '#2471a3');
  rbox(geo, 'wood', x, y, z, a, -1.2, 0.45, -0.5, 1.2, 0.55, -0.1, '#a04000');
}

export function barrierArm(geo, x, y, z, a) {
  rbox(geo, 'metal', x, y, z, a, -0.25, 0, -0.25, 0.25, 1.1, 0.25, '#c0392b');
  for (let i = 0; i < 6; i++) rbox(geo, 'plain', x, y, z, a, 0.25 + i * 1.0, 0.95, -0.06, 1.25 + i * 1.0, 1.08, 0.06, i % 2 ? '#c0392b' : '#ffffff');
}

export function chainFence(geo, x0, z0, x1, z1, y, h = 2.6) {
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = -len / 2; i <= len / 2 + 0.01; i += 2.5) rbox(geo, 'metal', cx, y, cz, a, i - 0.05, 0, -0.05, i + 0.05, h, 0.05, '#7f8c8d');
  rbox(geo, 'glass', cx, y, cz, a, -len / 2, 0.05, -0.01, len / 2, h - 0.1, 0.01, '#95a5a6');
  rbox(geo, 'metal', cx, y, cz, a, -len / 2, h - 0.08, -0.04, len / 2, h, 0.04, '#7f8c8d');
}

export function antennaTower(geo, x, y, z, h = 18) {
  for (let i = 0; i < h; i += 1.5) {
    const s = 0.9 * (1 - i / h * 0.6);
    for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) geo.box('metal', x + dx - 0.05, y + i, z + dz - 0.05, x + dx + 0.05, y + i + 1.5, z + dz + 0.05, i % 3 ? '#e74c3c' : '#ecf0f1');
    geo.box('metal', x - s, y + i + 1.4, z - s, x + s, y + i + 1.5, z + s, '#bdc3c7');
  }
  geo.cylinder('metal', x, y + h, z, 0.05, 3, '#bdc3c7', 6);
  geo.box('emissive', x - 0.12, y + h + 3, z - 0.12, x + 0.12, y + h + 3.2, z + 0.12, '#ff3b30');
}

export function satelliteDish(geo, x, y, z) {
  geo.cylinder('metal', x, y, z, 0.15, 2.2, '#bdc3c7', 8);
  geo.cylinder('shiny', x, y + 2.2, z, 1.4, 0.15, '#ecf0f1', 16);
}

export function lookout(geo, x, y, z) { watchTower(geo, x, y, z, 7); }

export function caveRocks(geo, x, y, z) {
  // ağız açıklığı güneye bakan yarım halka kaya + karanlık iç
  for (let i = 0; i < 11; i++) {
    const a = PI * 0.1 + (i / 10) * PI * 1.8;
    const r = 6;
    const px = x + Math.cos(a) * r, pz = z - Math.sin(a) * r;
    geo.box('concrete', px - 1.8, y - 0.5, pz - 1.8, px + 1.8, y + 3.5 + (i % 3), pz + 1.8, i % 2 ? '#6e6a63' : '#7b766e');
  }
  geo.box('concrete', x - 7, y + 4, z - 7, x + 7, y + 5.5, z + 5, '#6b675f');
  geo.box('plain', x - 4.5, y - 0.1, z - 4.5, x + 4.5, y + 0.05, z + 3, '#3b3631');
}

export function signpost(geo, x, y, z) {
  geo.box('wood', x - 0.1, y, z - 0.1, x + 0.1, y + 3.2, z + 0.1, '#6d4c41');
}

export function logBench(geo, x, y, z, a) {
  rbox(geo, 'wood', x, y, z, a, -1.2, 0.0, -0.22, 1.2, 0.42, 0.22, '#795548');
}

export function tentGeo(geo, x, y, z, a, color = '#e67e22') {
  const c = Math.cos(a), s = Math.sin(a);
  const T = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  geo.quad('plain', T(-1.2, 0, 1.4), T(1.2, 0, 1.4), T(1.2, 1.5, 0), T(-1.2, 1.5, 0), color);
  geo.quad('plain', T(1.2, 0, -1.4), T(-1.2, 0, -1.4), T(-1.2, 1.5, 0), T(1.2, 1.5, 0), color);
  geo.tri('plain', T(-1.2, 0, -1.4), T(-1.2, 0, 1.4), T(-1.2, 1.5, 0), '#ca6f1e');
  geo.tri('plain', T(1.2, 0, 1.4), T(1.2, 0, -1.4), T(1.2, 1.5, 0), '#ca6f1e');
}
