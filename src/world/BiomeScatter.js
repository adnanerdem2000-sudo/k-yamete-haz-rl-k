// Biyoma göre bitki örtüsü: orman dışındaki bölgeler aynı dağılımı kullanmasın. Vegetation.scatter ormanı
// doldurur; burası bölge temasına göre ek dağılım yapar (deterministik, tohumlu):
//  • dağ / dağ köyü: yükseklikle sıklaşan çam, kayalar, kuru ağaçlar; köy evleri çevresinde meyve (sonbahar) ağacı
//  • kıyı (fener, tatil, liman): kumsal çalıları, kayalar, sürüklenmiş kuru odun, seyrek otlar
//  • çiftlik: tarla kenarı çit çalıları (çalı sıraları), tek tük meşe; mahalle: bahçe çalıları ve çiçekler
//  • havaalanı / cezaevi: seyrek, kuru ot ve çakıl; baraj / köprü: su kenarında kaya ve çalı
import { REGIONS, LAKES } from './WorldLayout.js';
import { onRoad } from './Roads.js';

export function scatterBiomes(V, W, rng) {
  const T = W.terrain;
  const blocked = (x, z, r) => W.blocked(x, z, r);
  const inWater = (x, z) => T.waterLevelAt(x, z) > T.heightAt(x, z) - 0.2 || LAKES.some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 3);
  let n = 0;
  const put = (type, x, z, s) => { V.add(type, x, z, rng.next() * 6.28, s); n++; };
  for (const reg of REGIONS) {
    if (!reg.plateau || reg.id === 'orman') continue;
    const [x0, z0, x1, z1] = reg.plateau;
    const area = (x1 - x0) * (z1 - z0);
    const theme = reg.theme;
    const count = Math.round(area / (theme === 'mountain' ? 55 : theme === 'coast' || theme === 'resort' ? 70 : theme === 'farm' ? 90 : theme === 'safe' ? 80 : theme === 'village' ? 60 : 160));
    for (let i = 0; i < count; i++) {
      const x = x0 + rng.next() * (x1 - x0), z = z0 + rng.next() * (z1 - z0);
      const h = T.heightAt(x, z);
      if (inWater(x, z) || onRoad(x, z, 2.5)) continue;
      const slope = T.slopeAt ? T.slopeAt(x, z) : 0;
      const r = rng.next();
      switch (theme) {
        case 'mountain': case 'village': {
          if (slope > 0.6) { if (!blocked(x, z, 1.5)) put(rng.chance(0.4) ? 'boulder' : 'rock', x, z, 0.7 + rng.next() * 1.2); break; }
          if (theme === 'village' && r < 0.25 && !blocked(x, z, 2.2)) { put(rng.chance(0.5) ? 'autumn' : 'autumn2', x, z, 0.8 + rng.next() * 0.3); break; }
          if (r < 0.55 && !blocked(x, z, 2.2)) put(h > 40 ? (rng.chance(0.7) ? 'pineTall' : 'pine') : rng.chance(0.6) ? 'pine' : 'oak2', x, z, 0.8 + rng.next() * 0.5);
          else if (r < 0.75 && !blocked(x, z, 1.2)) put(rng.chance(0.5) ? 'boulder' : 'rock', x, z, 0.6 + rng.next() * 0.9);
          else if (r < 0.85 && !blocked(x, z, 2)) put('dead', x, z, 0.8 + rng.next() * 0.4);
          else if (!blocked(x, z, 0.6)) put(rng.chance(0.5) ? 'fern' : 'bush', x, z, 0.7 + rng.next() * 0.5);
          break;
        }
        case 'coast': case 'resort': case 'port': {
          const nearWater = T.waterLevelAt(x, z) > h - 2.5;
          if (nearWater && r < 0.4 && !blocked(x, z, 1)) put('rock', x, z, 0.5 + rng.next() * 0.8);
          else if (nearWater && r < 0.55 && !blocked(x, z, 1.5)) put('dead', x, z, 0.55 + rng.next() * 0.3); // sürüklenmiş odun
          else if (r < 0.8 && !blocked(x, z, 1)) put(rng.chance(0.6) ? 'bush' : 'grass', x, z, 0.6 + rng.next() * 0.6);
          else if (theme !== 'port' && !blocked(x, z, 2)) put(rng.chance(0.5) ? 'oak2' : 'birch', x, z, 0.75 + rng.next() * 0.3);
          break;
        }
        case 'farm': {
          // tarla kenarı çit çalıları: plato kenarına yakın noktalarda sıra
          const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
          if (edge < 14 && r < 0.7 && !blocked(x, z, 0.8)) put(rng.chance(0.8) ? 'bush' : 'flowerBush', x, z, 0.8 + rng.next() * 0.5);
          else if (r < 0.8 && !blocked(x, z, 2.5)) put('oak', x, z, 0.9 + rng.next() * 0.4);
          else if (!blocked(x, z, 0.5)) put(rng.chance(0.5) ? 'wheat' : 'grass', x, z, 0.8 + rng.next() * 0.4);
          break;
        }
        case 'safe': {
          // mahalle bahçeleri: ev çevresinde çalı, çiçek, tek tük kiraz/meyve ağacı
          const nearHouse = W.buildings.some((b) => x > b.box.minX - 6 && x < b.box.maxX + 6 && z > b.box.minZ - 6 && z < b.box.maxZ + 6);
          if (!nearHouse) { if (r < 0.3 && !blocked(x, z, 0.5)) put('grass', x, z, 0.8 + rng.next() * 0.4); break; }
          if (r < 0.45 && !blocked(x, z, 0.8)) put(rng.chance(0.5) ? 'flowerBush' : 'bush', x, z, 0.6 + rng.next() * 0.5);
          else if (r < 0.65 && !blocked(x, z, 0.5)) put('flowers', x, z, 0.8 + rng.next() * 0.4);
          else if (r < 0.75 && !blocked(x, z, 2.2)) put(rng.chance(0.5) ? 'cherry' : 'autumn', x, z, 0.7 + rng.next() * 0.3);
          break;
        }
        case 'airfield': case 'prison': case 'military': {
          if (r < 0.6 && !blocked(x, z, 0.4)) put('grass', x, z, 0.6 + rng.next() * 0.4);
          else if (r < 0.75 && !blocked(x, z, 0.5)) put('pebble', x, z, 0.8 + rng.next() * 0.5);
          else if (r < 0.85 && !blocked(x, z, 2)) put('dead', x, z, 0.7 + rng.next() * 0.4);
          break;
        }
        case 'dam': case 'industrial': {
          const nearWater = T.waterLevelAt(x, z) > h - 3;
          if (nearWater && r < 0.5 && !blocked(x, z, 1)) put(rng.chance(0.5) ? 'boulder' : 'rock', x, z, 0.6 + rng.next() * 1.0);
          else if (r < 0.7 && !blocked(x, z, 0.8)) put('bush', x, z, 0.6 + rng.next() * 0.5);
          else if (theme === 'industrial' && r < 0.8 && !blocked(x, z, 0.5)) put('grass', x, z, 0.7 + rng.next() * 0.4);
          break;
        }
        default: {
          if (r < 0.3 && !blocked(x, z, 0.5)) put('grass', x, z, 0.8 + rng.next() * 0.4);
        }
      }
    }
  }
  return n;
}
