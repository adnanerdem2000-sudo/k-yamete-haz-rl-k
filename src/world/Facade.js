// Cephe ayrıntıları: binalar "kutu" görünmesin. Şablon koordinatlarında (x: 0..w, z: 0..d, ön cephe z = d)
// mevcut Geo kovalarına kutu/dörtgen ekler; kabuk birleştirme (WorldBuilder.mergeShells) ek çizim çağrısı
// doğurmaz. Bölge/stil ve bina kimliğine göre deterministik seçimler (tohumlu RNG).
//  • subasman bandı (zemin kuşağı), köşe taşları (tuğla/beton), korniş (düz çatı), kat silmesi (yüksek bina)
//  • pencere panjurları (ev stilleri), kilit taşı/lento (tuğla), denizlik gölgesi
//  • yağmur oluğu + iniş boruları (eğimli çatılar), düz çatıda havalandırma boruları/çatı kapağı/su deposu
//  • yangın merdiveni (şehir, düz çatı, boş yan duvar), uydu anteni, şehir dükkânlarında tente
//  • çatı çeşidi: kırma (hip) çatı — kalkan duvarlı beşik çatıya alternatif
const AWNING_COLORS = ['#8e3b32', '#2f5d62', '#7a6a2f', '#3b4f7a', '#6b2f4f', '#4a6b35'];
const URBAN = new Set(['sehir', 'hastane', 'benzin', 'liman', 'sanayi', 'havaalani', 'cezaevi']);
const HOUSE_EXT = new Set(['siding', 'wood', 'plaster']);

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Dış cephe ayrıntıları. o: { w, d, H, F, t (dış duvar kalınlığı), st (stil), spec, openings {F,B,L,R}, rng, roofType }
 */
export function facadeDetails(geo, roofGeo, o) {
  const { w, d, H, F, t, st, spec, openings, rng } = o;
  const ext = st.ext || 'siding';
  const urban = URBAN.has(spec.region);
  const trim = st.trimColor || '#f4f1ea';
  const extCol = spec.paint || st.extColor || '#e8dcc0';
  const out = t / 2; // dış yüz ofseti (duvar merkezinden)
  const ring = (y0, y1, proud, key, col, faces = 63) => {
    geo.box(key, -out - proud, y0, -out - proud, w + out + proud, y1, -out + 0.02, col, faces);
    geo.box(key, -out - proud, y0, d + out - 0.02, w + out + proud, y1, d + out + proud, col, faces);
    geo.box(key, -out - proud, y0, -out, -out + 0.02, y1, d + out, col, faces);
    geo.box(key, w + out - 0.02, y0, -out, w + out + proud, y1, d + out, col, faces);
  };
  // ---- subasman (zemin kuşağı): koyu, hafif çıkıntılı
  const plinthKey = ext === 'brick' ? 'concrete' : ext === 'metal' ? 'metal' : 'concrete';
  ring(F - 0.02, F + 0.42, 0.045, plinthKey, shade(extCol, -0.32), 63 & ~8);
  // ---- köşe taşları (tuğla/beton/sıva binalarda dönüşümlü bloklar)
  if (ext === 'brick' || ext === 'concrete' || (ext === 'plaster' && urban)) {
    const qc = shade(extCol, ext === 'brick' ? 0.18 : -0.12);
    for (const [cx, cz] of [[-out, -out], [w + out, -out], [-out, d + out], [w + out, d + out]]) {
      for (let y = F + 0.5; y < F + H - 0.35; y += 0.72) {
        const h = 0.34, pr = 0.035, sx = cx < 0 ? -1 : 1, sz = cz < 0 ? -1 : 1;
        geo.box(ext, Math.min(cx, cx + sx * pr), y, Math.min(cz - 0.38 * sz, cz + sz * pr), Math.max(cx, cx + sx * pr), y + h, Math.max(cz - 0.38 * sz, cz + sz * pr), qc);
        geo.box(ext, Math.min(cx - 0.38 * sx, cx + sx * pr), y + 0.36, Math.min(cz, cz + sz * pr), Math.max(cx - 0.38 * sx, cx + sx * pr), y + 0.36 + h, Math.max(cz, cz + sz * pr), qc);
      }
    }
  }
  // ---- korniş ve kat silmesi (düz çatı); eğimli çatıda saçak altı bandı
  if (o.roofType === 'flat') {
    ring(F + H - 0.3, F + H - 0.12, 0.12, 'trim', shade(extCol, -0.18));
    ring(F + H - 0.12, F + H + 0.02, 0.18, 'trim', trim);
    if (H > 3.9) ring(F + H * 0.5 - 0.06, F + H * 0.5 + 0.06, 0.07, 'trim', shade(extCol, -0.15));
  } else ring(F + H - 0.16, F + H - 0.02, 0.06, 'trim', shade(trim, -0.08));
  // ---- pencere panjurları (ev stilleri) ve lento/kilit taşı (tuğla), denizlik gölgesi
  const sides = { F: { axis: 'x', c: d + out }, B: { axis: 'x', c: -out }, L: { axis: 'z', c: -out }, R: { axis: 'z', c: w + out } };
  const shutterCol = shade(trim, -0.45), shutters = HOUSE_EXT.has(ext) && !urban && rng.chance(0.75);
  const shutterOpen = rng.chance(0.6);
  for (const [side, S] of Object.entries(sides)) {
    const outward = side === 'F' ? 1 : side === 'B' ? -1 : side === 'R' ? 1 : -1;
    for (const op of openings[side] || []) {
      if (!op.win) continue;
      const y0 = F + op.y0, y1 = F + op.y1, sw = Math.min(0.42, (op.e - op.s) * 0.45);
      if (shutters) {
        // açık panjur: pencerenin iki yanında duvara yapışık kanatlar; kapalı: pencereyi örten çıtalı kapak
        const panels = shutterOpen ? [[op.s - sw - 0.02, op.s - 0.02], [op.e + 0.02, op.e + sw + 0.02]] : [[op.s, (op.s + op.e) / 2 - 0.01], [(op.s + op.e) / 2 + 0.01, op.e]];
        for (const [a, b] of panels) {
          const depth = shutterOpen ? 0.05 : 0.06;
          if (S.axis === 'x') geo.box('wood', a, y0 + 0.02, Math.min(S.c, S.c + outward * depth), b, y1 - 0.02, Math.max(S.c, S.c + outward * depth), shutterCol);
          else geo.box('wood', Math.min(S.c, S.c + outward * depth), y0 + 0.02, a, Math.max(S.c, S.c + outward * depth), y1 - 0.02, b, shutterCol);
        }
      }
      if (ext === 'brick') {
        // lento + kilit taşı
        const lk = shade(extCol, 0.3), mid = (op.s + op.e) / 2;
        if (S.axis === 'x') { geo.box('trim', op.s - 0.1, y1 + 0.08, Math.min(S.c, S.c + outward * 0.04), op.e + 0.1, y1 + 0.2, Math.max(S.c, S.c + outward * 0.04), lk); geo.box('trim', mid - 0.08, y1 + 0.06, Math.min(S.c, S.c + outward * 0.06), mid + 0.08, y1 + 0.3, Math.max(S.c, S.c + outward * 0.06), lk); }
        else { geo.box('trim', Math.min(S.c, S.c + outward * 0.04), y1 + 0.08, op.s - 0.1, Math.max(S.c, S.c + outward * 0.04), y1 + 0.2, op.e + 0.1, lk); geo.box('trim', Math.min(S.c, S.c + outward * 0.06), y1 + 0.06, mid - 0.08, Math.max(S.c, S.c + outward * 0.06), y1 + 0.3, mid + 0.08, lk); }
      }
      // denizlik altı gölge bandı (derinlik hissi)
      const sc = shade(extCol, -0.4);
      if (S.axis === 'x') geo.box('trim', op.s - 0.08, y0 - 0.1, Math.min(S.c, S.c + outward * 0.01), op.e + 0.08, y0 - 0.06, Math.max(S.c, S.c + outward * 0.01), sc);
      else geo.box('trim', Math.min(S.c, S.c + outward * 0.01), y0 - 0.1, op.s - 0.08, Math.max(S.c, S.c + outward * 0.01), y0 - 0.06, op.e + 0.08, sc);
    }
  }
  // ---- yağmur oluğu + iniş boruları (eğimli çatılar)
  if (o.roofType !== 'flat') {
    const gut = '#6f757a', eave = F + H - 0.08, oo = 0.55;
    const alongX = w >= d;
    if (alongX) { geo.box('metal', -oo, eave - 0.12, d + oo - 0.02, w + oo, eave, d + oo + 0.1, gut); geo.box('metal', -oo, eave - 0.12, -oo - 0.1, w + oo, eave, -oo + 0.02, gut); }
    else { geo.box('metal', -oo - 0.1, eave - 0.12, -oo, -oo + 0.02, eave, d + oo, gut); geo.box('metal', w + oo - 0.02, eave - 0.12, -oo, w + oo + 0.1, eave, d + oo, gut); }
    const pipes = alongX ? [[-out - 0.09, d + out + 0.04], [w + out + 0.02, -out - 0.1]] : [[-out - 0.1, -out - 0.09], [w + out + 0.04, d + out + 0.02]];
    for (const [px, pz] of pipes) geo.box('metal', px, F + 0.05, pz, px + 0.07, eave - 0.1, pz + 0.07, gut);
  } else {
    // düz çatı: havalandırma boruları, çatı kapağı, büyük binada su deposu
    const top = F + H + 0.22;
    for (let i = 0; i < 2 + Math.floor(w * d / 90); i++) { const x = 0.8 + rng.next() * (w - 1.6), z = 0.8 + rng.next() * (d - 1.6); roofGeo.cylinder('metal', x, top, z, 0.08 + rng.next() * 0.05, 0.5 + rng.next() * 0.5, '#8f969a', 8, true); }
    roofGeo.box('metal', w - 1.5, top, 0.6, w - 0.6, top + 0.5, 1.4, '#7c8388');
    if (w * d > 150 && rng.chance(0.6)) {
      const x = w * 0.25, z = d * 0.65;
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) roofGeo.box('metal', x + dx - 0.05, top, z + dz - 0.05, x + dx + 0.05, top + 1.0, z + dz + 0.05, '#555b60');
      roofGeo.cylinder('metal', x, top + 1.0, z, 1.0, 1.4, '#9aa0a4', 12, true);
    }
  }
  // ---- yangın merdiveni (şehir, düz çatı, açıklığı olmayan yan duvar)
  if (urban && o.roofType === 'flat' && H >= 3.2) {
    const free = (side) => (openings[side] || []).every((op) => op.e < 0.6 || op.s > 2.4);
    const side = free('L') ? 'L' : free('R') ? 'R' : null;
    if (side) {
      const x = side === 'L' ? -out : w + out, sx = side === 'L' ? -1 : 1, z0 = 0.9, z1 = 2.1, rail = '#3b4044';
      const yb = F + 1.9, yt = F + H + 0.45;
      for (const z of [z0, z1]) geo.box('metal', Math.min(x + sx * 0.12, x + sx * 0.18), yb, z - 0.03, Math.max(x + sx * 0.12, x + sx * 0.18), yt, z + 0.03, rail);
      for (let y = yb + 0.1; y < yt; y += 0.3) geo.box('metal', Math.min(x + sx * 0.12, x + sx * 0.18), y, z0, Math.max(x + sx * 0.12, x + sx * 0.18), y + 0.04, z1, rail);
      // alt platform ve küçük korkuluk
      geo.box('metal', Math.min(x, x + sx * 0.9), yb - 0.06, z0 - 0.3, Math.max(x, x + sx * 0.9), yb, z1 + 0.3, '#4a5054');
      geo.box('metal', Math.min(x + sx * 0.86, x + sx * 0.9), yb, z0 - 0.3, Math.max(x + sx * 0.86, x + sx * 0.9), yb + 0.9, z1 + 0.3, rail);
    }
  }
  // ---- uydu anteni (evler)
  if (!urban && o.roofType !== 'flat' && rng.chance(0.35)) {
    const x = w * 0.2, z = d * 0.15, y = F + H + 0.25;
    roofGeo.box('metal', x - 0.03, y, z - 0.03, x + 0.03, y + 0.6, z + 0.03, '#7d8488');
    roofGeo.cylinder('metal', x, y + 0.6, z + 0.2, 0.32, 0.03, '#c9ced1', 12, true);
  }
}

/**
 * Şehir dükkânlarının ön kapıları üstünde soluk çizgili tente (bir kısmı yırtık/sarkık). Ön cephe şablon
 * düzlemi z = zw, dışa +z. s..e kapı aralığı (şablon x), y tente üst kenarı.
 */
export function awning(geo, s, e, zw, y, yMax, rng) {
  if (y > yMax - 0.1) y = yMax - 0.1;
  const depth = 1.25, drop = 0.42, val = 0.24;
  const col = rng.pick(AWNING_COLORS), white = '#d6d0c2';
  const n = Math.max(2, Math.round((e - s) / 0.5));
  const torn = rng.chance(0.45);
  for (let i = 0; i < n; i++) {
    const a = s + ((e - s) * i) / n, b = s + ((e - s) * (i + 1)) / n;
    const c = i % 2 ? white : col;
    const rip = torn && rng.chance(0.3);
    if (rip && rng.chance(0.35)) continue;
    const dd = rip ? depth * rng.range(0.35, 0.7) : depth, sag = rip ? rng.range(0.1, 0.35) : 0;
    const yo = y - drop * (dd / depth) - sag, zo = zw + dd;
    geo.quad('plain', [a, y, zw], [a, yo, zo], [b, yo, zo], [b, y, zw], c);
    geo.quad('plain', [b, y - 0.02, zw], [b, yo - 0.02, zo], [a, yo - 0.02, zo], [a, y - 0.02, zw], c);
    if (!rip) {
      geo.quad('plain', [a, yo - val, zo], [b, yo - val, zo], [b, yo, zo], [a, yo, zo], c);
      geo.quad('plain', [b, yo - val, zo - 0.01], [a, yo - val, zo - 0.01], [a, yo, zo - 0.01], [b, yo, zo - 0.01], c);
    }
  }
  for (const x of [s + 0.05, e - 0.05]) {
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const z0 = zw + depth * t0, z1 = zw + depth * t1, y0 = y - drop * t0 - 0.03, y1 = y - drop * t1 - 0.03;
      geo.box('metal', x - 0.025, Math.min(y0, y1) - 0.025, z0, x + 0.025, Math.max(y0, y1) + 0.005, z1, '#3d3f42');
    }
  }
}

/** Kırma (hip) çatı: dört eğim, kısa mahya; saçak kenarı ve mahya çıtası. Dönüş: çatı yükselmesi (rise) */
export function buildHipRoof(geo, tpl, st, H, F) {
  const { w, d } = tpl;
  const top = F + H, o = 0.55, pitch = 0.5;
  const alongX = w >= d;
  const span = alongX ? d : w, L = alongX ? w : d;
  const rise = (span / 2 + o) * pitch;
  const yE = top - o * pitch, yR = top + (span / 2) * pitch + 0.02;
  const key = st.roofMat || 'shingles', col = st.roofColor || '#8a3a2a';
  // mahya: uzun eksende, uçlardan span/2 içeride
  const r0 = span / 2, r1 = L - span / 2;
  if (alongX) {
    const zc = d / 2;
    geo.quad(key, [-o, yE, d + o], [w + o, yE, d + o], [r1, yR, zc], [r0, yR, zc], col, 'edge');
    geo.quad(key, [w + o, yE, -o], [-o, yE, -o], [r0, yR, zc], [r1, yR, zc], col, 'edge');
    geo.tri(key, [-o, yE, -o], [-o, yE, d + o], [r0, yR, zc], col);
    geo.tri(key, [w + o, yE, d + o], [w + o, yE, -o], [r1, yR, zc], col);
    geo.box('trim', r0 - 0.1, yR - 0.06, zc - 0.12, r1 + 0.1, yR + 0.1, zc + 0.12, '#6d6258');
  } else {
    const xc = w / 2;
    geo.quad(key, [-o, yE, -o], [-o, yE, d + o], [xc, yR, r1], [xc, yR, r0], col, 'edge');
    geo.quad(key, [w + o, yE, d + o], [w + o, yE, -o], [xc, yR, r0], [xc, yR, r1], col, 'edge');
    geo.tri(key, [w + o, yE, -o], [-o, yE, -o], [xc, yR, r0], col);
    geo.tri(key, [-o, yE, d + o], [w + o, yE, d + o], [xc, yR, r1], col);
    geo.box('trim', xc - 0.12, yR - 0.06, r0 - 0.1, xc + 0.12, yR + 0.1, r1 + 0.1, '#6d6258');
  }
  // saçak kenarı (dört yan) ve saçak altı
  const tc = st.trimColor || '#f4f1ea';
  geo.box('trim', -o, yE - 0.14, d + o - 0.05, w + o, yE + 0.02, d + o + 0.04, tc);
  geo.box('trim', -o, yE - 0.14, -o - 0.04, w + o, yE + 0.02, -o + 0.05, tc);
  geo.box('trim', -o - 0.04, yE - 0.14, -o, -o + 0.05, yE + 0.02, d + o, tc);
  geo.box('trim', w + o - 0.05, yE - 0.14, -o, w + o + 0.04, yE + 0.02, d + o, tc);
  geo.box('trim', -o, yE - 0.14, -o, w + o, yE - 0.12, d + o, '#d8d2c8', 8);
  if (tpl.chimney) geo.box('brick', w * 0.72, top, d * 0.3, w * 0.72 + 0.7, yR + 0.8, d * 0.3 + 0.7, '#a0523d');
  return rise;
}
