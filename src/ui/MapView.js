// Harita çizimi: tam ekran harita (kaydır/yakınlaştır/işaret koy) ve HUD mini haritası.
import { mapBase, FOG_N, MAP_PX } from '../systems/MapSystem.js';
import { WORLD } from '../world/WorldLayout.js';
import { CHARACTERS } from '../entities/CharacterFactory.js';

export const ICONS = {
  base: '🏠', shop: '🛒', park: '🌳', med: '➕', police: '🚓', fuel: '⛽', fish: '🎣', camp: '⛺', cabin: '🛖', cave: '🕳️', mountain: '⛰️',
  factory: '🏭', wrench: '🔧', military: '🪖', heli: '🚁', radio: '📡', anchor: '⚓', boat: '⛵', lab: '🧪', quest: '❗', danger: '⚠️', bag: '🎒', pin: '📍',
};
const REGION_ICON = { mahalle: '🏘️', sehir: '🏙️', hastane: '🏥', benzin: '⛽', orman: '🌲', dag: '⛰️', sanayi: '🏭', askeri: '🪖', liman: '⚓', lab: '☣️' };
const VEH_ICON = { sedan: '🚗', pickup: '🛻', police: '🚓', ambulance: '🚑', van: '🚐', rv: '🚌', offroad: '🚙', motorcycle: '🏍️', military: '🚚', armored: '🚛', boat: '🚤' };

export class MapView {
  constructor(game) {
    this.game = game;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = FOG_N;
    this.fogVersion = -1;
  }

  base() { return mapBase(this.game.world); }

  refreshFog(map) {
    if (map.version === this.fogVersion) return;
    this.fogVersion = map.version;
    const g = this.fogCanvas.getContext('2d');
    const img = g.createImageData(FOG_N, FOG_N);
    for (let i = 0; i < map.fog.length; i++) {
      const v = map.fog[i];
      img.data[i * 4] = 18; img.data[i * 4 + 1] = 26; img.data[i * 4 + 2] = 38; img.data[i * 4 + 3] = v ? 0 : 196;
    }
    g.putImageData(img, 0, 0);
  }

  /** Dünya → ekran dönüşümü için görünüm: {cx, cz, scale(px/m), w, h} */
  toScreen(v, x, z) { return { x: (x - v.cx) * v.scale + v.w / 2, y: (z - v.cz) * v.scale + v.h / 2 }; }
  toWorld(v, sx, sy) { return { x: (sx - v.w / 2) / v.scale + v.cx, z: (sy - v.h / 2) / v.scale + v.cz }; }

  drawTerrain(g, v, map) {
    const base = this.base();
    this.refreshFog(map);
    const k = v.scale * WORLD.size / MAP_PX;
    g.save();
    g.fillStyle = '#0e2a4a';
    g.fillRect(0, 0, v.w, v.h);
    g.translate(v.w / 2 - (v.cx + WORLD.half) * v.scale, v.h / 2 - (v.cz + WORLD.half) * v.scale);
    g.scale(k, k);
    g.imageSmoothingEnabled = true;
    g.drawImage(base, 0, 0);
    g.drawImage(this.fogCanvas, 0, 0, MAP_PX, MAP_PX);
    g.restore();
  }

  /** Tam harita */
  drawFull(g, v, S, opts = {}) {
    const map = S.map;
    this.drawTerrain(g, v, map);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // bölge etiketleri
    for (const r of map.regions()) {
      if (!r.known) continue;
      const p = this.toScreen(v, r.x, r.z);
      this.chip(g, p.x, p.y - 26, `${REGION_ICON[r.id] || ''} ${r.name.toLocaleUpperCase('tr')}`, r.danger >= 4 ? '#c0392b' : '#1b1f27', 15);
    }
    // POI
    for (const p of map.pois()) {
      const s = this.toScreen(v, p.x, p.z);
      this.dotIcon(g, s.x, s.y, ICONS[p.icon] || '•', 13, '#f3d9a4');
      if (v.scale > 1.2 || opts.hover === p.id) this.label(g, s.x, s.y + 17, p.name, 11);
    }
    // hızlı seyahat noktaları
    for (const t of map.travelPoints()) {
      if (!t.known) continue;
      const s = this.toScreen(v, t.x, t.z);
      g.strokeStyle = '#7cf0a1'; g.lineWidth = 2; g.setLineDash([3, 3]);
      g.beginPath(); g.arc(s.x, s.y, 16, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    // işaretler
    for (const m of map.markers) {
      const s = this.toScreen(v, m.x, m.z);
      this.pin(g, s.x, s.y, ICONS[m.icon] || '📍', m.user ? '#e8742a' : m.icon === 'danger' ? '#c0392b' : '#f1c40f');
      this.label(g, s.x, s.y + 14, m.label, 11);
    }
    // görev hedefi
    const tr = S.quests.trackedInfo();
    if (tr && tr.waypoint) {
      const s = this.toScreen(v, tr.waypoint.x, tr.waypoint.z);
      const t = performance.now() / 600;
      g.strokeStyle = '#f1c40f'; g.lineWidth = 3;
      g.beginPath(); g.arc(s.x, s.y, 20 + Math.sin(t) * 4, 0, Math.PI * 2); g.stroke();
      this.label(g, s.x, s.y - 30, '★ ' + tr.title, 12, '#f1c40f');
    }
    // araçlar
    for (const veh of S.vehicles.list) {
      if (veh.wrecked || !map.explored(veh.pos.x, veh.pos.z)) continue;
      const s = this.toScreen(v, veh.pos.x, veh.pos.z);
      g.font = '15px sans-serif'; g.fillText(VEH_ICON[veh.type] || '🚗', s.x, s.y);
    }
    // pingler
    for (const p of map.pings) {
      const s = this.toScreen(v, p.x, p.z);
      const a = (p.t % 1);
      g.strokeStyle = `rgba(255,214,64,${a})`; g.lineWidth = 3;
      g.beginPath(); g.arc(s.x, s.y, 10 + (1 - a) * 18, 0, Math.PI * 2); g.stroke();
      this.label(g, s.x, s.y - 20, p.name, 11, '#ffd640');
    }
    // takım (yapay zekâ dahil)
    for (const tm of S.teamList()) {
      if (tm.isLocal) continue;
      const s = this.toScreen(v, tm.pos.x, tm.pos.z);
      this.member(g, s.x, s.y, tm.charId, tm.downed, tm.name);
    }
    // yerel oyuncu oku
    const pl = S.local;
    const s = this.toScreen(v, pl.pos.x, pl.pos.z);
    this.arrow(g, s.x, s.y, pl.vehicle ? pl.vehicle.yaw : pl.yaw, 13);
    g.restore();
    // pusula gülü
    this.compass(g, v.w - 70, v.h - 80, 48);
  }

  /** HUD mini harita (kuzey yukarı, oyuncu ortada) */
  drawMini(g, size, S, radius = 110) {
    const pl = S.local;
    const v = { cx: pl.pos.x, cz: pl.pos.z, scale: size / (radius * 2), w: size, h: size };
    g.save();
    g.clearRect(0, 0, size, size);
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.clip();
    this.drawTerrain(g, v, S.map);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of S.map.pois()) {
      const s = this.toScreen(v, p.x, p.z);
      if (s.x < 0 || s.y < 0 || s.x > size || s.y > size) continue;
      g.font = '12px sans-serif'; g.fillText(ICONS[p.icon] || '•', s.x, s.y);
    }
    for (const m of S.map.markers) {
      const s = this.edge(v, m.x, m.z, size);
      this.pin(g, s.x, s.y, ICONS[m.icon] || '📍', m.icon === 'danger' ? '#c0392b' : '#f1c40f', 0.75);
    }
    const tr = S.quests.trackedInfo();
    if (tr && tr.waypoint) {
      const s = this.edge(v, tr.waypoint.x, tr.waypoint.z, size);
      g.fillStyle = '#f1c40f'; g.font = 'bold 15px sans-serif'; g.fillText('★', s.x, s.y);
    }
    // zombiler (yakın)
    g.fillStyle = 'rgba(231,76,60,0.9)';
    for (const [, zv] of S.zombies.views) {
      if (zv.state.dead) continue;
      const s = this.toScreen(v, zv.pos.x, zv.pos.z);
      if (s.x < 0 || s.y < 0 || s.x > size || s.y > size) continue;
      g.beginPath(); g.arc(s.x, s.y, 2.2, 0, Math.PI * 2); g.fill();
    }
    for (const tm of S.teamList()) {
      if (tm.isLocal) continue;
      const s = this.edge(v, tm.pos.x, tm.pos.z, size);
      g.fillStyle = tm.downed ? '#e74c3c' : CHARACTERS[tm.charId]?.color || '#fff';
      g.strokeStyle = '#111'; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, s.y, 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    for (const p of S.map.pings) { const s = this.edge(v, p.x, p.z, size); g.strokeStyle = '#ffd640'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 7, 0, Math.PI * 2); g.stroke(); }
    this.arrow(g, size / 2, size / 2, pl.vehicle ? pl.vehicle.yaw : pl.yaw, 9);
    g.restore();
  }

  /** Mini harita sınırına yapıştır */
  edge(v, x, z, size) {
    const s = this.toScreen(v, x, z);
    const dx = s.x - size / 2, dy = s.y - size / 2;
    const r = Math.hypot(dx, dy), max = size / 2 - 9;
    if (r > max) { s.x = size / 2 + dx / r * max; s.y = size / 2 + dy / r * max; }
    return s;
  }

  chip(g, x, y, text, bg = '#1b1f27', size = 14) {
    g.font = `${size}px "Luckiest Guy", sans-serif`;
    const w = g.measureText(text).width + 16;
    g.fillStyle = 'rgba(0,0,0,0.35)'; this.round(g, x - w / 2 + 2, y - size * 0.8 + 3, w, size * 1.6, 5); g.fill();
    g.fillStyle = bg; this.round(g, x - w / 2, y - size * 0.8, w, size * 1.6, 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#fff'; g.fillText(text, x, y + 1);
  }

  label(g, x, y, text, size = 11, color = '#fff') {
    g.font = `600 ${size}px Rubik, sans-serif`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }

  dotIcon(g, x, y, icon, r, ring) {
    g.fillStyle = 'rgba(20,24,32,0.85)'; g.strokeStyle = ring; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `${r + 1}px sans-serif`; g.fillStyle = '#fff'; g.fillText(icon, x, y + 1);
  }

  pin(g, x, y, icon, color, k = 1) {
    g.save(); g.translate(x, y); g.scale(k, k);
    g.fillStyle = color; g.strokeStyle = '#111'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-10, -12, -10, -24, 0, -24); g.bezierCurveTo(10, -24, 10, -12, 0, 0); g.fill(); g.stroke();
    g.font = '11px sans-serif'; g.fillStyle = '#111'; g.fillText(icon, 0, -15);
    g.restore();
  }

  member(g, x, y, charId, downed, name) {
    const col = CHARACTERS[charId]?.color || '#fff';
    g.fillStyle = downed ? '#e74c3c' : col; g.strokeStyle = '#111'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    this.label(g, x, y - 14, (downed ? '✚ ' : '') + name, 11, downed ? '#ff8a80' : '#fff');
  }

  arrow(g, x, y, yaw, s) {
    g.save(); g.translate(x, y); g.rotate(Math.PI - yaw);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#e8742a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, s * 0.75); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.7, s * 0.75); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  compass(g, x, y, r) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(15,20,30,0.55)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r - 6, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = i === 3 ? '#e74c3c' : '#ecf0f1';
      g.beginPath(); g.moveTo(0, -r + 8); g.lineTo(6, 0); g.lineTo(-6, 0); g.closePath(); g.fill();
    }
    g.fillStyle = '#fff'; g.font = '13px "Luckiest Guy", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('K', 0, -r - 9); g.fillText('G', 0, r + 9); g.fillText('D', r + 9, 0); g.fillText('B', -r - 9, 0);
    g.restore();
  }

  round(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
}
