// İç mekân dokusu: perdeler, tavan lambaları, halılar, duvar resimleri, raf üstü/zemin dağınıklığı ve bina
// durumu (yaşanır / yağmalanmış / barikatlı). Geometri 'decor' kovasına yazılır (iç yüzeylerle birlikte 64 m
// hücrelerde birleşir, 45 m ötede gizlenir). Zemin dağınıklığı Dressing'in iz atlasına (clutter) bırakılır,
// pencere başlangıç durumları (kırık / tahtalı) Session'ın pencere sıfırlamasında uygulanır.
import { RNG } from '../core/util.js';

const CURTAIN_COLORS = ['#b8574a', '#4a6b8a', '#7a8a5a', '#c9b07a', '#8a5a7a', '#e2d8c8', '#5a7a7a'];
const RUG_COLORS = ['#8a3a2a', '#2f4a6a', '#6a5a3a', '#4a6a4a', '#7a4a6a'];
const PICTURE_COLORS = ['#7aa0c8', '#c8a07a', '#8ac07a', '#c87a7a', '#e0d8b0', '#607080'];
const HOME_ROOMS = new Set(['living', 'bedroom', 'kitchen', 'office', 'lobby', 'cabin_main', 'ward', 'barracks_room', 'cafe_hall', 'restaurant_hall']);

/** Bina durumu: id'den deterministik. home her zaman 'lived'. */
export function buildingState(spec, rng) {
  if (spec.id === 'home') return 'lived';
  const r = rng.next();
  if (['sehir', 'hastane', 'sanayi', 'liman', 'askeri', 'havaalani', 'cezaevi'].includes(spec.region)) return r < 0.55 ? 'looted' : r < 0.8 ? 'barricaded' : 'lived';
  return r < 0.35 ? 'looted' : r < 0.6 ? 'barricaded' : 'lived';
}

/**
 * B: Building (frame, rooms [dünya kutuları], windows, floorY), tpl, st, geo: Geo (şablon uzayında; fr.matrix ile
 * dönüştürülür), rng. Dönüş: { clutter: [{x,z,kind}], state }
 */
export function dressInterior(B, tpl, st, geo, rng) {
  const state = buildingState(B.spec, rng);
  B.state = state;
  const F = B.floorY - B.frame.baseY, H = tpl.H;
  const clutter = [];
  const fr = B.frame;
  // dünya → şablon dönüşümü (pencere merkezleri dünya uzayında): fr.pt tersini kullan
  const toT = (x, z) => {
    const lx = x - fr.cx, lz = z - fr.cz;
    // pt: x = cx + lx*c + lz*s ; z = cz - lx*s + lz*c  → ters döndürme
    const c = fr.c, s = fr.s;
    return { tx: lx * c - lz * s + tpl.w / 2, tz: lx * s + lz * c + tpl.d / 2 };
  };
  const homey = tpl.rooms.some((r) => HOME_ROOMS.has(r.type));
  B.lamps = []; // tavan lambaları (dünya konumu): Environment gece, oyuncu içerideyken ışık havuzuna ekler
  // ---- perdeler: ev/otel/ofis pencerelerinin iç yüzünde iki kanat (bir kısmı kapalı, bir kısmı yarı açık)
  if (homey) {
    const cc = rng.pick(CURTAIN_COLORS);
    for (const w of B.windows) {
      if (rng.chance(0.25)) continue;
      const p = toT(w.center.x, w.center.z);
      const inw = { x: w.inward.x * fr.c - w.inward.z * fr.s, z: w.inward.x * fr.s + w.inward.z * fr.c }; // dünya yönü → şablon
      const alx = Math.abs(inw.x) < 0.5; // pencere x boyunca uzanıyor
      const half = w.width / 2 + 0.15, h0 = F + w.sill - 0.08, h1 = F + w.sill + w.height + 0.22;
      const open = rng.chance(0.5) ? 0.45 : 1; // kapalı (1) ya da yana toplanmış
      const depth = 0.16, z0 = alx ? p.tz + inw.z * depth : p.tx + inw.x * depth;
      const rod = (a, b) => (alx ? geo.box('decor', a, h1, z0 - 0.02, b, h1 + 0.03, z0 + 0.02, '#5a4a3a') : geo.box('decor', z0 - 0.02, h1, a, z0 + 0.02, h1 + 0.03, b, '#5a4a3a'));
      const panel = (a, b) => (alx ? geo.box('decor', a, h0, z0 - 0.035, b, h1, z0 + 0.035, cc) : geo.box('decor', z0 - 0.035, h0, a, z0 + 0.035, h1, b, cc));
      const m = alx ? p.tx : p.tz;
      rod(m - half, m + half);
      const pw = half * (open === 1 ? 0.5 : 0.22);
      panel(m - half, m - half + pw); panel(m + half - pw, m + half);
    }
  }
  // ---- odalar: tavan lambası, halı, duvar resmi, dağınıklık
  for (const r of tpl.rooms) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, rw = r.x1 - r.x0, rd = r.z1 - r.z0;
    if (rw < 1.6 || rd < 1.6) continue;
    const yC = F + H - 0.02;
    // lamba: kablo + sarkıt abajur (emissive kovası geceleri elektrik varsa yanar)
    geo.box('decor', cx - 0.012, yC - 0.38, cz - 0.012, cx + 0.012, yC, cz + 0.012, '#2a2a2a');
    geo.cylinder('decor', cx, yC - 0.52, cz, 0.22, 0.16, rng.pick(['#e8e0c8', '#c9d4d8', '#d8c0a0']), 10, false);
    geo.cylinder('emissive', cx, yC - 0.51, cz, 0.12, 0.03, '#fff1c8', 8, true);
    { const lp = fr.pt(cx, cz); B.lamps.push({ x: lp.x, y: fr.baseY + yC - 0.6, z: lp.z }); }
    // halı (oturma/yatak/ofis/lobi)
    if (['living', 'bedroom', 'office', 'lobby', 'cabin_main'].includes(r.type) && rng.chance(0.8)) {
      const sx = Math.min(rw * 0.45, 2.2), sz = Math.min(rd * 0.45, 1.6);
      const rc = rng.pick(RUG_COLORS);
      geo.box('decor', cx - sx, F + 0.005, cz - sz, cx + sx, F + 0.02, cz + sz, rc, 4);
      geo.box('decor', cx - sx + 0.25, F + 0.021, cz - sz + 0.25, cx + sx - 0.25, F + 0.025, cz + sz - 0.25, '#' + rng.pick(RUG_COLORS).slice(1), 4);
    }
    // duvar resmi: odanın bir duvarında çerçeve + tuval (kapı/pencere açıklığından bağımsız, oda içi duvar)
    if (HOME_ROOMS.has(r.type) && rng.chance(0.7)) {
      const onX = rng.chance(0.5), yP = F + 1.45;
      const pw = 0.6 + rng.next() * 0.5, ph = 0.45 + rng.next() * 0.3;
      const col = rng.pick(PICTURE_COLORS);
      if (onX) { const z = rng.chance(0.5) ? r.z0 + 0.09 : r.z1 - 0.09, x = cx + (rng.next() - 0.5) * (rw - pw - 1); geo.box('decor', x - pw / 2, yP - ph / 2, z - 0.025, x + pw / 2, yP + ph / 2, z + 0.025, '#3a2a1a'); geo.box('decor', x - pw / 2 + 0.05, yP - ph / 2 + 0.05, z - 0.03, x + pw / 2 - 0.05, yP + ph / 2 - 0.05, z + 0.03, col); }
      else { const x = rng.chance(0.5) ? r.x0 + 0.09 : r.x1 - 0.09, z = cz + (rng.next() - 0.5) * (rd - pw - 1); geo.box('decor', x - 0.025, yP - ph / 2, z - pw / 2, x + 0.025, yP + ph / 2, z + pw / 2, '#3a2a1a'); geo.box('decor', x - 0.03, yP - ph / 2 + 0.05, z - pw / 2 + 0.05, x + 0.03, yP + ph / 2 - 0.05, z + pw / 2 - 0.05, col); }
    }
    // dağınıklık: yağmalanmış binada çok, barikatlıda orta, yaşanırda az (zemin izleri)
    const n = state === 'looted' ? 4 + rng.int(0, 4) : state === 'barricaded' ? 2 + rng.int(0, 2) : rng.int(0, 1);
    for (let k = 0; k < n; k++) {
      const p = fr.pt(r.x0 + 0.6 + rng.next() * (rw - 1.2), r.z0 + 0.6 + rng.next() * (rd - 1.2));
      clutter.push({ x: p.x, z: p.z, kind: rng.pick(state === 'looted' ? ['papers', 'litter', 'glass', 'stain', 'papers'] : ['papers', 'litter', 'dirt']) });
    }
    // yağmalanmış: devrilmiş sandalye/kutu yerine yerde dağınık kutu kalıntıları (ince kutular) ve kırık cam
    if (state === 'looted' && rng.chance(0.6)) {
      const x = r.x0 + 0.8 + rng.next() * (rw - 1.6), z = r.z0 + 0.8 + rng.next() * (rd - 1.6);
      geo.box('decor', x - 0.3, F + 0.01, z - 0.2, x + 0.3, F + 0.14, z + 0.2, '#8a6a45'); // devrilmiş kutu
      geo.box('decor', x + 0.1, F + 0.14, z - 0.1, x + 0.45, F + 0.19, z + 0.25, '#7a5a3a');
    }
  }
  // ---- barikatlı: pencerelerin bir kısmı önceden tahtalı; yağmalanmış: bir kısmı kırık
  for (const w of B.windows) {
    if (state === 'barricaded' && rng.chance(0.55)) w.initBarricade = 1 + rng.int(0, 1);
    else if (state === 'looted' && rng.chance(0.4)) w.initBroken = true;
  }
  return { clutter, state };
}
