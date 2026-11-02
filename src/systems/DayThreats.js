// Gündüz tehditleri (host). Zombiler artık yalnız gece ortaya çıkar (Zombies.populate); gündüz yağma zamanıdır ama
// güvenli değildir:
//  • Yağmacı devriyeleri: şehir, liman, benzinlik, sanayi, cezaevi, havaalanı ve askerî bölgede 2–3 kişilik silahlı
//    ekipler (zombi listesinde yaşayan insan 'raider' türü: aynı algı/saldırı/ağ/ganimet hattı). Akşam çekilirler.
//  • Başıboş köpek sürüleri: kasaba ve şehirde, sürü yapay zekâlı (kurtla aynı) aç köpekler.
//  • Duyurular: alacakaranlık ve şafak (zombilerin çıkışı/toprağa dönüşü) herkese bildirilir.
// Güneş çarpması (öğle sıcağında açıkta kalmak) her oyuncunun kendi istemcisinde PlayerStats'ta işlenir.
import { dist, RNG } from '../core/util.js';
import { DUSK, DAWN } from './TimeSystem.js';

// bölge kimliği → devriye olasılığı (yarım dakikalık denetim başına) ve köpek sürüsü olasılığı
const RAIDER_ZONES = { sehir: 0.32, liman: 0.3, benzin: 0.25, sanayi: 0.3, cezaevi: 0.35, havaalani: 0.3, askeri: 0.3, hastane: 0.2, kopru: 0.25 };
const DOG_ZONES = { sehir: 0.22, mahalle: 0.16, hastane: 0.18, benzin: 0.18, ciftlik: 0.2, tatil: 0.16, dagkoy: 0.14, liman: 0.14 };
const MAX_RAIDERS = 6;

export class DayThreats {
  constructor(session) {
    this.s = session;
    this.rng = new RNG(session.seed + ':day');
    this.t = 12; // ilk denetim oyunun ilk dakikasında değil
    this.lastAnnounce = -1;
  }

  /** Gündüz mü (zombisiz saatler): şafaktan alacakaranlığa */
  isDay() { const m = this.s.time.minuteOfDay; return m >= DAWN && m < DUSK; }

  update(dt) {
    const S = this.s;
    if (!S.isHost) return;
    this.announce();
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 30;
    const m = S.time.minuteOfDay;
    // akşam: yağmacılar çekilir (oyuncuya 45 m'den uzak, kavgada olmayanlar kaldırılır)
    if (m >= DUSK - 30 || m < DAWN) { this.withdraw(); return; }
    if (S.endings && S.endings.active) return;
    const players = S.zombies.targets().filter((t) => t.kind === 'player');
    if (!players.length) return;
    const day = S.time.day;
    for (const p of players) {
      // üs gündüz dinlenme/inşa yeridir, sığınaktaki oyuncu yüzeyde değildir: tehditler dışarıda yağmalarken başlar
      if (S.isInBase({ x: p.x, z: p.z })) continue;
      if (S.world.under && S.world.under.zoneAt(p.x, p.y + 0.5, p.z)) continue;
      const reg = S.world.regionAt(p.x, p.z), rid = reg ? reg.id : null;
      // yağmacı devriyesi: oyuncunun 160 m çevresinde etkin devriye yoksa
      const raiders = [...S.zombies.list.values()].filter((z) => z.def.human && !z.dead);
      const nearR = raiders.filter((z) => dist(z.x, z.z, p.x, p.z) < 160).length;
      const pr = RAIDER_ZONES[rid] || 0;
      if (pr && !nearR && raiders.length < MAX_RAIDERS && this.rng.next() < pr * (day <= 1 ? 0.4 : 1)) this.spawnPatrol(p, day);
      // başıboş köpek sürüsü
      const pd = DOG_ZONES[rid] || 0;
      const dogs = S.npcs.animals.filter((a) => !a.dead && a.def.stray).length;
      if (pd && dogs < 4 && this.rng.next() < pd) {
        const type = this.rng.chance(0.5) ? 'husky' : 'shiba';
        S.npcs.spawnPack(type, p, 2 + (day > 8 ? 1 : 0) + (this.rng.chance(0.3) ? 1 : 0), null, 55 + this.rng.next() * 25);
        S.emit({ k: 'toast', to: p.id, text: '🐕 Uzaktan havlamalar… aç köpek sürüsü yakında dolaşıyor.', kind: 'warn', dur: 4 });
      }
    }
  }

  /** 2–3 kişilik yağmacı ekibi: oyuncudan 85–130 m uzakta, bina/su dışında; oyuncunun bölgesine doğru devriye */
  spawnPatrol(p, day) {
    const S = this.s;
    const n = 2 + (day >= 6 && this.rng.chance(0.5) ? 1 : 0);
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng.next() * Math.PI * 2, r = 85 + this.rng.next() * 45;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (S.world.terrain.isWater(x, z) || S.world.buildingAt(x, z) || S.isInBase({ x, z })) continue;
      const tx = p.x + (this.rng.next() - 0.5) * 40, tz = p.z + (this.rng.next() - 0.5) * 40;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const zb = S.zombies.spawn('raider', x + (i % 2) * 1.8, z + Math.floor(i / 2) * 1.8);
        if (!zb) continue;
        k++;
        zb.patrol = true; zb.day = true;
        // devriye: oyuncunun bulunduğu bölgeye doğru yürür (görünce saldırır: zombi algısıyla aynı)
        zb.target = { kind: 'pos', x: tx, z: tz }; zb.state = 'investigate'; zb.alert = 0.4;
      }
      if (k) S.emit({ k: 'toast', to: p.id, text: '🔫 Yağmacı devriyesi bölgede! Görünmeden yağma, gerekirse çatış.', kind: 'warn', dur: 4 });
      return k;
    }
    return 0;
  }

  /** Akşam: kavgada olmayan, oyuncudan uzak devriyeler bölgeden çekilir */
  withdraw() {
    const S = this.s;
    const players = S.zombies.targets().filter((t) => t.kind === 'player');
    for (const zb of [...S.zombies.list.values()]) {
      if (!zb.patrol || zb.dead) continue;
      const nd = Math.min(...players.map((p) => dist(p.x, p.z, zb.x, zb.z)), Infinity);
      if (nd > 45 && zb.state !== 'chase' && zb.state !== 'attack') S.zombies.removeZombie(zb.id);
    }
  }

  /** Saat duyuruları (herkese): alacakaranlıktan önce, alacakaranlıkta, şafaktan önce ve şafakta */
  announce() {
    const S = this.s;
    // geçilen dakika aralığına bakılır: uyku hızlandırmasında bir kare bir dakikadan uzun sürse de duyuru kaçmaz
    const tot = S.time.total, prev = this._prevTot ?? tot;
    this._prevTot = tot;
    if (tot - prev > 240 || tot < prev) return; // büyük atlama (yükleme/zaman ayarı): eski duyurular basılmaz
    const slots = [
      [DUSK - 30, '🌇 Güneş batıyor. Yarım saat sonra ölüler topraktan çıkacak — üsse ya da bir sığınağa dön.', 'warn'],
      [DUSK, '🌑 Gece başladı: zombiler yerden çıkıyor!', 'danger'],
      [DAWN - 30, '🌄 Şafak yaklaşıyor. Dayan!', 'info'],
      [DAWN, '☀️ Gün doğdu: zombiler toprağa dönüyor. Yağma zamanı — ama yağmacılara, köpeklere ve öğle sıcağına dikkat.', 'good'],
    ];
    for (const [at, text, kind] of slots) {
      // bu günün (ya da az önce geçilen gece yarısından önceki günün) o dakikası, önceki kare ile bu kare arasında mı
      const dayStart = Math.floor(tot / 1440) * 1440;
      for (const t of [dayStart + at, dayStart - 1440 + at]) {
        if (prev < t && t <= tot && this.lastAnnounce !== t) { this.lastAnnounce = t; S.emit({ k: 'toast', text, kind, dur: 5 }); }
      }
    }
  }
}
