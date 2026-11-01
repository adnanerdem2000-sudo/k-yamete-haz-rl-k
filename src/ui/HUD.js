// Oyun içi HUD: takım listesi, gün/saat + geri sayım, mini harita, görev takibi, ihtiyaç göstergeleri,
// hızlı erişim çubuğu, mühimmat, etkileşim istemi, nişangâh, araç göstergesi, sohbet akışı.
import { h, clear, slotView, portrait, bar, setBar, fmtTime } from './dom.js';
import { ITEMS } from '../data/items.js';
import { CHARACTERS } from '../entities/CharacterFactory.js';
import { HOTBAR } from '../systems/Inventory.js';
import { formatKg } from '../core/util.js';

const PHASE_ICON = { Sabah: '🌅', Öğle: '☀️', Akşam: '🌇', Gece: '🌙' };

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.t = 0;
    this.root = h('div.hud');
    // ---- sol üst: takım
    this.team = h('div.hud-team');
    // ---- sağ üst: zaman + mini harita
    this.dayEl = h('div.hud-day');
    this.clockEl = h('div.hud-clock');
    this.countEl = h('div.hud-countdown');
    this.weatherEl = h('div.hud-weather');
    this.netEl = h('div.hud-net');
    this.miniCanvas = h('canvas.minimap', { width: 190, height: 190 });
    this.miniWrap = h('div.minimap-wrap', this.miniCanvas, h('span.mm-n', 'K'));
    this.timeBox = h('div.hud-time', h('div.hud-time-row', this.dayEl, this.clockEl), this.countEl, this.weatherEl);
    this.topRight = h('div.hud-topright', this.timeBox, this.miniWrap, this.netEl);
    // ---- görev takibi
    this.quest = h('div.hud-quest');
    // ---- sol alt: ihtiyaçlar + durumlar
    this.needs = {};
    const need = (k, icon, cls) => { const b = bar(100, 100, cls); const el = h('div.need', { title: k }, h('span.need-ic', icon), b); this.needs[k] = b; return el; };
    this.condEl = h('div.hud-cond');
    this.needsEl = h('div.hud-needs',
      need('health', '❤️', 'hp'), need('stamina', '⚡', 'st'), need('hunger', '🍖', 'hu'), need('thirst', '💧', 'th'), need('energy', '😴', 'en'), need('morale', '🙂', 'mo'),
      this.condEl);
    this.tempEl = h('div.hud-temp');
    // ---- alt orta: hotbar + istem + ilerleme
    this.hotbar = h('div.hotbar');
    this.slots = [];
    for (let i = 0; i < HOTBAR; i++) { const s = h('div.slot'); this.slots.push(s); this.hotbar.appendChild(s); }
    this.prompt = h('div.prompt.hidden');
    this.progress = h('div.progress.hidden', h('span.progress-label'), bar(0, 1, 'pr'));
    this.buildHint = h('div.build-hint.hidden');
    this.bottom = h('div.hud-bottom', this.buildHint, this.progress, this.prompt, this.hotbar);
    // ---- sağ alt: mühimmat / ağırlık / araç
    this.ammo = h('div.hud-ammo');
    this.weight = h('div.hud-weight');
    this.vehicle = h('div.hud-vehicle.hidden');
    this.bottomRight = h('div.hud-bottomright', this.vehicle, this.ammo, this.weight);
    // ---- orta: nişangâh, hasar
    this.cross = h('div.crosshair', h('i'), h('i'), h('i'), h('i'));
    this.hitmark = h('div.hitmark');
    this.dmg = h('div.damage-vignette');
    this.lockHint = h('div.lock-hint.hidden', 'Oynamak için tıkla');
    // ---- sol: eşya akışı + sohbet
    this.feed = h('div.item-feed');
    this.chat = h('div.chat-log');
    this.chatInput = h('input.chat-input.hidden', { maxlength: 160, placeholder: 'Mesaj yaz, Enter ile gönder (Esc: kapat)' });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.chatInput.value.trim(); if (t && this.ui.S) this.ui.S.act('chat', { text: t }); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
    this.voice = h('div.voice-ind.hidden', '🎙️ Konuşuyorsun');
    this.radio = h('div.radio-box.hidden');
    this.threat = h('div.threat.hidden', '⚠ TEHLİKE');
    this.root.append(this.team, this.topRight, this.quest, this.needsEl, this.tempEl, this.bottom, this.bottomRight, this.cross, this.hitmark, this.dmg, this.lockHint, this.feed, this.chat, this.chatInput, this.voice, this.radio, this.threat);
    this.teamCache = '';
    this.hotVer = -1;
    this.miniT = 0;
  }

  mount(layer) { layer.appendChild(this.root); }

  // ======================================================================= güncelleme
  update(dt) {
    const S = this.ui.S;
    if (!S) return;
    this.t += dt;
    this.updateSlow = (this.updateSlow || 0) - dt;
    const slow = this.updateSlow <= 0;
    if (slow) this.updateSlow = 0.12;
    const st = S.localStats;
    // ihtiyaçlar (her kare ucuz)
    setBar(this.needs.health, st.health, st.maxHealth);
    setBar(this.needs.stamina, st.stamina, st.maxStamina);
    setBar(this.needs.hunger, st.hunger);
    setBar(this.needs.thirst, st.thirst);
    setBar(this.needs.energy, st.energy);
    setBar(this.needs.morale, st.morale);
    this.needs.health.classList.toggle('low', st.health < st.maxHealth * 0.3);
    this.needs.hunger.classList.toggle('low', st.hunger < 20);
    this.needs.thirst.classList.toggle('low', st.thirst < 20);
    this.needs.energy.classList.toggle('low', st.energy < 15);
    if (slow) {
      this.updateTime(S);
      this.updateTeam(S);
      this.updateQuest(S);
      this.updateConditions(S);
      this.updateAmmo(S);
      this.updateVehicle(S);
      this.lockHint.classList.toggle('hidden', this.game.input.locked || this.ui.isBlocking() || S.local.mode === 'sleep' || st.downed || !!S.endings.finished);
      this.voice.classList.toggle('hidden', !this.game.net.voice.talking);
      const thr = S.zombies.threatLevel || 0;
      this.threat.classList.toggle('hidden', thr < 0.55);
    }
    if (S.inventory.version !== this.hotVer || slow) this.updateHotbar(S);
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 1 / 15;
      const g = this.miniCanvas.getContext('2d');
      this.ui.mapView.drawMini(g, this.miniCanvas.width, S, S.local.vehicle ? 170 : 110);
    }
    // eşya akışı ömrü
    for (const el of [...this.feed.children]) { el._t = (el._t || 0) + dt; if (el._t > 3.2) el.classList.add('out'); if (el._t > 3.8) el.remove(); }
    for (const el of [...this.chat.children]) { el._t = (el._t || 0) + dt; el.classList.toggle('faded', el._t > 12 && !this.chatOpen); }
    this.dmg.style.opacity = Math.max(0, (parseFloat(this.dmg.style.opacity) || 0) - dt * 1.6);
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) this.radio.classList.add('hidden'); }
  }

  updateTime(S) {
    const T = S.time;
    this.dayEl.textContent = `Gün ${T.day}`;
    this.clockEl.textContent = `${PHASE_ICON[T.phase] || ''} ${fmtTime(T.minuteOfDay)}`;
    const left = T.countdown;
    const d = Math.floor(left / 1440), hh = Math.floor((left % 1440) / 60);
    this.countEl.textContent = left <= 0 ? 'SON IŞIK!' : d > 0 ? `Son Işık'a ${d} gün ${hh} saat` : `Son Işık'a ${hh} sa ${Math.floor(left % 60)} dk`;
    this.countEl.classList.toggle('urgent', d < 3);
    this.weatherEl.textContent = S.weather.label() + (T.ff > 1 ? ' · ⏩ Uyku' : '');
    const net = this.game.net;
    if (net.active) {
      const n = net.netStats ? net.netStats() : { rtt: Math.round(net.rtt || 0), loss: 0, stale: 0 };
      const q = net.netQuality ? net.netQuality() : 'good';
      const lossTxt = n.loss > 0.02 ? ` · kayıp %${Math.round(n.loss * 100)}` : '';
      this.netEl.textContent = `${q === 'bad' ? '📵' : q === 'warn' ? '📶' : '🛰️'} Oda ${net.room ? net.room.code : ''} · ${net.isHost ? 'Host' : ''}${net.isHost && n.peers && n.peers.length ? ` · en kötü ${n.rtt} ms` : net.isHost ? '' : `${n.rtt} ms`}${lossTxt}${n.stale > 1.5 ? ' · bağlantı zayıf' : ''}`;
      this.netEl.className = 'hud-net net-' + q;
    } else { this.netEl.textContent = ''; this.netEl.className = 'hud-net'; }
  }

  updateTeam(S) {
    const list = S.teamList();
    const key = list.map((m) => m.id + m.downed + m.name).join('|');
    if (key !== this.teamCache) {
      this.teamCache = key;
      clear(this.team);
      this.teamRows = new Map();
      for (const m of list) {
        const hp = bar(100, 100, 'hp'), food = bar(100, 100, 'hu');
        const row = h('div.team-row' + (m.isLocal ? '.me' : '') + (m.isBot ? '.bot' : ''), { style: { '--c': CHARACTERS[m.charId]?.color || '#fff' } },
          h('div.team-pic', portrait(m.charId)), h('div.team-info', h('div.team-name', m.name + (m.isBot ? ' 🤖' : '')), hp, food), h('span.team-state'));
        this.team.appendChild(row);
        this.teamRows.set(m.id, { row, hp, food, state: row.lastChild });
      }
    }
    for (const m of list) {
      const r = this.teamRows.get(m.id);
      if (!r) continue;
      setBar(r.hp, m.health, 1);
      setBar(r.food, Math.min(m.hunger, m.thirst), 1);
      r.row.classList.toggle('downed', !!m.downed);
      r.row.classList.toggle('speaking', !!m.voice);
      r.state.textContent = m.downed ? '✚' : m.voice ? '🔊' : '';
    }
  }

  updateQuest(S) {
    const tr = S.quests.trackedInfo();
    const key = tr ? tr.id + tr.objs.map((o) => o.cur).join(',') : '';
    if (key === this.questKey) return;
    this.questKey = key;
    clear(this.quest);
    if (!tr) return;
    this.quest.append(h('div.q-title', (tr.kind === 'main' ? '★ ' : '') + 'Görev: ' + tr.title));
    for (const o of tr.objs) {
      const done = o.cur >= o.max;
      this.quest.append(h('div.q-obj' + (done ? '.done' : ''), h('span.q-check', done ? '✔' : ''), `${o.label}${o.max > 1 ? ` (${Math.min(o.cur, o.max)}/${o.max})` : ''}`));
    }
    this.quest.append(h('div.q-hint', `${this.game.input.label('quests')}: Görevler · ${this.game.input.label('map')}: Harita`));
  }

  updateConditions(S) {
    const st = S.localStats;
    const c = st.cond;
    const tags = [];
    if (c.bleeding > 0) tags.push(['🩸', 'Kanama', 'bad']);
    if (c.infection > 0) tags.push(['🦠', `Enfeksiyon %${Math.round(c.infection)}`, 'bad']);
    if (c.poisoned > 0) tags.push(['🤢', 'Zehirlenme', 'bad']);
    if (c.injury > 0) tags.push(['🦴', 'Yaralı', 'bad']);
    if (c.sick) tags.push(['🤒', 'Hasta', 'bad']);
    if (st.cold) tags.push(['🥶', 'Üşüyor', 'bad']);
    if (st.hot) tags.push(['🥵', 'Aşırı sıcak', 'bad']);
    if (c.wet > 0.3) tags.push(['💦', 'Islak', 'warn']);
    if (st.sleepDeprived) tags.push(['😵', 'Uykusuz', 'warn']);
    if (S.overweight > 0) tags.push(['🎒', 'Aşırı yük', 'warn']);
    for (const b of Object.keys(st.buffs)) tags.push(['✨', { painkiller: 'Ağrı kesici', vitamins: 'Vitamin', energy: 'Enerji' }[b] || b, 'good']);
    if (S.isInBase(S.local.pos)) tags.push(['🏠', 'Üste', 'good']);
    const key = tags.map((t) => t[1]).join('|');
    if (key !== this.condKey) {
      this.condKey = key;
      clear(this.condEl);
      for (const [ic, label, k] of tags) this.condEl.append(h('span.cond.' + k, { title: label }, ic, h('em', label)));
    }
    this.tempEl.textContent = `🌡️ Vücut ${st.temp.toFixed(1)}°C · Hava ${Math.round(S.weather.temperature)}°C`;
    this.tempEl.classList.toggle('bad', st.cold || st.hot);
  }

  updateHotbar(S) {
    this.hotVer = S.inventory.version;
    for (let i = 0; i < HOTBAR; i++) {
      const s = S.inventory.slots[i];
      const el = this.slots[i];
      const sig = s ? `${s.id}:${s.qty}:${s.ammo ?? ''}:${Math.round(s.dur ?? 0)}:${Math.round(s.fuel ?? 0)}` : '';
      if (el._sig !== sig || el._sel !== (i === S.hotbarIndex)) {
        const n = slotView(this.game, s, { hotkey: i + 1, cls: i === S.hotbarIndex ? 'sel' : '' });
        n._sig = sig; n._sel = i === S.hotbarIndex;
        n.addEventListener('click', () => S.selectHotbar(i));
        this.hotbar.replaceChild(n, el);
        this.slots[i] = n;
      }
    }
  }

  updateAmmo(S) {
    const s = S.heldStack;
    const def = s ? ITEMS[s.id] : null;
    if (def && def.gun) {
      const reserve = S.inventory.count(def.gun.ammo);
      this.ammo.innerHTML = `<b>${s.ammo || 0}</b><span>| ${reserve}</span><small>${ITEMS[def.gun.ammo].name}</small>`;
      this.ammo.classList.remove('hidden');
    } else if (def && def.melee && s.dur !== undefined) {
      this.ammo.innerHTML = `<small>${def.name}</small><span>Dayanıklılık %${Math.round(s.dur / def.durability * 100)}</span>`;
      this.ammo.classList.remove('hidden');
    } else if (def) {
      this.ammo.innerHTML = `<small>${def.name}</small>`;
      this.ammo.classList.remove('hidden');
    } else this.ammo.classList.add('hidden');
    const w = S.inventory.weight(), mw = S.inventory.maxWeight;
    this.weight.textContent = `🎒 ${formatKg(w)} / ${formatKg(mw)} kg`;
    this.weight.classList.toggle('over', w > mw);
  }

  updateVehicle(S) {
    const v = S.local.vehicle;
    this.root.classList.toggle('driving', !!v);
    if (!v) { this.vehicle.classList.add('hidden'); return; }
    this.vehicle.classList.remove('hidden');
    this.vehicle.innerHTML = `<div class="veh-name">${v.def.name}</div><div class="veh-speed"><b>${Math.round(Math.abs(v.speed) * 3.6)}</b> km/s</div>
      <div class="veh-bars"><span>⛽</span><div class="bar fu"><i style="width:${Math.round(v.fuel / v.maxFuel * 100)}%"></i></div><span>🔧</span><div class="bar hp"><i style="width:${Math.round(v.health / v.maxHealth * 100)}%"></i></div></div>`;
  }

  // ======================================================================= istem / nişangâh / ilerleme
  setPrompt(p) {
    if (!p) { if (!this.prompt.classList.contains('hidden')) this.prompt.classList.add('hidden'); this.promptKey = null; return; }
    const key = p.label + '|' + (p.sub || '') + '|' + p.key + '|' + (p.progress !== undefined ? Math.round(p.progress * 40) : '');
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.prompt.classList.remove('hidden');
    const ring = p.progress !== undefined ? `<span class="ring" style="--p:${Math.round(p.progress * 100)}"></span>` : '';
    this.prompt.innerHTML = `<span class="key">${p.key}${ring}</span><span class="plabel">${p.label}${p.holdHint ? ' <em>(basılı tut)</em>' : ''}${p.sub ? `<small>${p.sub}</small>` : ''}</span>`;
  }

  setCrosshair(kind, spread = 0) {
    this.cross.className = 'crosshair' + (kind ? ' ' + kind : ' none');
    this.cross.style.setProperty('--sp', Math.round(6 + spread * 260) + 'px');
  }

  hitMarker(head) { this.hitmark.className = 'hitmark show' + (head ? ' head' : ''); clearTimeout(this._hm); this._hm = setTimeout(() => { this.hitmark.className = 'hitmark'; }, 160); }

  showProgress(label, k) {
    this.progress.classList.remove('hidden');
    this.progress.firstChild.textContent = label;
    setBar(this.progress.lastChild, k, 1);
  }
  hideProgress() { this.progress.classList.add('hidden'); }

  setBuildHint(def, why, inv, mul = 1) {
    if (!def) { this.buildHint.classList.add('hidden'); return; }
    this.buildHint.classList.remove('hidden');
    const cost = def.cost.map(([id, n]) => { const need = Math.max(1, Math.ceil(n * mul)); const have = inv.count(id); return `<span class="${have >= need ? 'ok' : 'miss'}">${ITEMS[id].name} ${have}/${need}</span>`; }).join(' ');
    const I = this.game.input;
    this.buildHint.innerHTML = `<b>${def.name}</b> ${cost}${why ? `<div class="why">⛔ ${why}</div>` : ''}<div class="keys">Sol tık: yerleştir · ${I.label('rotate')}: döndür · Sağ tık / ${I.label('build')}: iptal</div>`;
  }

  // ======================================================================= akışlar
  itemToast(id, qty) {
    const def = ITEMS[id];
    if (!def) return;
    const last = this.feed.lastChild;
    if (last && last._id === id && last._t < 2) { last._qty += qty; last.querySelector('b').textContent = `+${last._qty}`; last._t = 0; return; }
    const el = h('div.feed-row', this.ui.icon(id), h('b', `+${qty}`), h('span', def.name));
    el._id = id; el._qty = qty;
    this.feed.appendChild(el);
    while (this.feed.children.length > 6) this.feed.firstChild.remove();
  }

  chatMessage(name, text) {
    const el = h('div.chat-row', h('b', name + ': '), text);
    this.chat.appendChild(el);
    while (this.chat.children.length > 8) this.chat.firstChild.remove();
  }

  openChat() {
    this.chatOpen = true;
    this.chatInput.classList.remove('hidden');
    this.chatInput.value = '';
    for (const el of this.chat.children) el._t = 0;
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat() {
    this.chatOpen = false;
    this.chatInput.blur();
    this.chatInput.classList.add('hidden');
  }

  damageFlash() { this.dmg.style.opacity = '1'; }

  broadcast(title, text) {
    this.radio.classList.remove('hidden');
    this.radio.innerHTML = `<div class="radio-title">📻 ${title}</div><div class="radio-text"></div>`;
    const tEl = this.radio.lastChild;
    let i = 0;
    clearInterval(this._typer);
    this._typer = setInterval(() => { i += 2; tEl.textContent = text.slice(0, i); if (i >= text.length) clearInterval(this._typer); }, 30);
    this.radioT = Math.max(9, text.length * 0.06 + 5);
  }
}
