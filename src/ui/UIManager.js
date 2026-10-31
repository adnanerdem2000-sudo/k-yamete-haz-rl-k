// Arayüz yöneticisi (UIManager): katmanlar, paneller, bildirimler, istemler, katman ekranları.
// Ekran içerikleri: MenuScreens (menü), HUD (oyun içi), Journal (envanter/üretim/karakter/görev/harita),
// GameScreens (depo, takas, diyalog, olay, inşa, araç, takım, duraklatma, sonuç).
import { h, clear, itemIcon, button, banner } from './dom.js';
import { HUD } from './HUD.js';
import { Menus } from './MenuScreens.js';
import { Journal } from './Journal.js';
import { GamePanels } from './GameScreens.js';
import { MapView } from './MapView.js';
import { ITEMS } from '../data/items.js';
import { Settings } from '../core/Settings.js';

const PHASE_TEXT = { Sabah: ['SABAH', 'Yeni bir gün. Keşfe çık, kaynak topla.'], Öğle: ['ÖĞLE', 'Uzak bölgelere gitmek için en iyi zaman.'], Akşam: ['AKŞAM', 'Hava kararıyor. Üsse dönmeyi düşün.'], Gece: ['GECE', 'Zombiler daha tehlikeli. Kapıları kapat.'] };

export class UIManager {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.menuLayer = h('div.layer.menu-layer.hidden');
    this.hudLayer = h('div.layer.hud-layer.hidden');
    this.panelLayer = h('div.layer.panel-layer');
    this.overlay = h('div.layer.overlay-layer');
    this.toastLayer = h('div.toasts');
    this.bannerEl = h('div.big-banner.hidden');
    this.fps = h('div.fps.hidden');
    root.append(this.hudLayer, this.menuLayer, this.panelLayer, this.overlay, this.bannerEl, this.toastLayer, this.fps);
    this.mapView = new MapView(game);
    this.hud = new HUD(this);
    this.hud.mount(this.hudLayer);
    this.menus = new Menus(this);
    this.journal = new Journal(this);
    this.panels = new GamePanels(this);
    this.panel = null;
    this.modal = null;
    this.prog = null;
    this.drag = null;
    this.bannerQ = [];
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    document.addEventListener('pointerlockchange', () => this.onLockChange());
  }

  get S() { return this.game.session; }

  icon(id, cls) { return itemIcon(this.game, id, cls); }

  // ======================================================================= durum
  isBlocking() { return !!this.panel || !!this.modal || !!this.hud.chatOpen || this.game.state !== 'playing'; }
  isTyping() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'range' && a.type !== 'checkbox'; }

  onKey(e) {
    if (this.modal) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); (e.key === 'Enter' ? this.modal.ok : this.modal.cancel)(); }
      return;
    }
    if (this.isTyping()) return;
    if (this.panel) {
      if (this.panel.keys && this.panel.keys(e)) { e.preventDefault(); e.stopPropagation(); return; }
      const B = Settings.get('controls.bindings');
      const toggles = { [B.inventory]: 'inventory', [B.crafting]: 'crafting', [B.quests]: 'quests', [B.character]: 'character', [B.map]: 'map' };
      if (e.code === 'Escape' && !this.panel.noEsc) { e.preventDefault(); e.stopPropagation(); this.closePanel(); return; }
      if (this.panel.name === 'journal' && toggles[e.code]) { e.preventDefault(); e.stopPropagation(); this.journal.open(toggles[e.code]); return; }
      if (this.panel.name === 'build' && e.code === B.build) { e.preventDefault(); e.stopPropagation(); this.closePanel(); return; }
      if (this.panel.name === 'team' && e.code === B.team) { e.preventDefault(); e.stopPropagation(); this.closePanel(); return; }
      if (this.panel.name === 'emotes' && e.code === B.emote) { e.preventDefault(); e.stopPropagation(); this.closePanel(); return; }
      if (e.code === 'Tab') e.preventDefault();
      return;
    }
    if (this.game.state === 'menu' && e.code === 'Escape' && this.menus.screen && this.menus.screen !== 'main' && this.menus.screen !== 'lobby') { e.preventDefault(); this.menus.back(); }
  }

  onLockChange() {
    const S = this.S;
    const locked = document.pointerLockElement === this.game.canvas;
    if (locked || !S || this.game.state !== 'playing') return;
    // Esc ile kilit bırakıldı (tarayıcı Esc'yi yutar): yerleştirme iptali ya da duraklatma
    if (this.isBlocking() || S.endings.finished) return;
    if (S.build.placing) { S.build.cancelPlacing(); return; }
    if (S.local.mode === 'sleep' || S.localStats.downed) return;
    setTimeout(() => { if (!this.isBlocking() && !document.pointerLockElement && this.S) this.openPause(); }, 60);
  }

  // ======================================================================= panel
  openPanel(name, el, opts = {}) {
    this.closePanel(true);
    this.panel = { name, el, ...opts };
    this.panelLayer.appendChild(el);
    this.panelLayer.classList.add('open');
    if (opts.modal) this.panelLayer.classList.add('modal');
    this.game.input.releaseLock();
    this.cancelProgressOnPanel = false;
  }

  closePanel(silent = false) {
    if (!this.panel) return;
    const p = this.panel;
    this.panel = null;
    p.el.remove();
    this.panelLayer.classList.remove('open', 'modal');
    if (p.onClose) p.onClose();
    if (!silent) this.game.audio.play('close', { vol: 0.3 });
  }

  // ======================================================================= sürükle-bırak (envanter/depo)
  dnd(el, data, onDrop) {
    if (el.classList.contains('filled')) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => { this.drag = data; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', JSON.stringify(data)); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); setTimeout(() => { this.drag = null; }, 0); });
    }
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); const d = this.drag; this.drag = null; if (d) onDrop(d); });
  }

  dropZone(el, onDrop) {
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => { e.preventDefault(); const d = this.drag; this.drag = null; if (d) onDrop(d); });
  }

  // ======================================================================= modal
  alert(msg, title = 'Bilgi') {
    return new Promise((res) => {
      const close = () => { this.closeModal(); res(); };
      const el = h('div.modal-box', h('h3', title), h('p', msg), h('div.modal-btns', button('Tamam', close, 'orange')));
      this.showModal(el, close, close);
    });
  }

  confirm(msg, onYes, onNo) {
    const yes = () => { this.closeModal(); onYes && onYes(); };
    const no = () => { this.closeModal(); onNo && onNo(); };
    const el = h('div.modal-box', h('h3', 'Emin misin?'), h('p', msg), h('div.modal-btns', button('Evet', yes, 'orange'), button('Vazgeç', no)));
    this.showModal(el, yes, no);
  }

  showModal(el, ok, cancel) {
    this.closeModal();
    const wrap = h('div.modal-wrap', el);
    this.modal = { el: wrap, ok, cancel };
    this.root.appendChild(wrap);
    this.game.input.releaseLock();
  }

  closeModal() { if (this.modal) { this.modal.el.remove(); this.modal = null; } }

  // ======================================================================= ekran geçişleri
  showMainMenu() {
    this.closePanel(true);
    this.hudLayer.classList.add('hidden');
    clear(this.overlay);
    this.hud.closeChat();
    this.menus.showMain();
  }

  openJoin(code) { this.menus.openJoin(code); }

  showHUD() {
    this.menus.hide();
    this.hudLayer.classList.remove('hidden');
    this.hud.teamCache = '';
    this.hud.questKey = null;
    if (Settings.get('gameplay.tutorialHints') && this.S && this.S.time.day === 1 && !this.S.cfg.save && this.S.cfg.mode !== 'client') {
      setTimeout(() => this.toast(`İpucu: ${this.game.input.label('interact')} basılı tut: ara/aç · ${this.game.input.label('inventory')}: envanter · ${this.game.input.label('build')}: inşa · ${this.game.input.label('quests')}: görevler`, 'info', 8), 2500);
    }
  }

  showLoadingOverlay(text) {
    this.hideLoadingOverlay();
    this.loadingEl = h('div.loading-overlay', h('div.lo-box', h('div.spinner'), h('div', text)));
    this.overlay.appendChild(this.loadingEl);
  }
  hideLoadingOverlay() { if (this.loadingEl) { this.loadingEl.remove(); this.loadingEl = null; } }

  showReconnect() {
    this.hideReconnect();
    this.reconEl = h('div.loading-overlay', h('div.lo-box', h('div.spinner'), h('div', 'Bağlantı koptu. Odaya yeniden bağlanılıyor…'), button('Ana menüye dön', () => { this.game.net.reconnecting = false; this.game.endSession(true); }, 'small')));
    this.overlay.appendChild(this.reconEl);
  }
  hideReconnect() { if (this.reconEl) { this.reconEl.remove(); this.reconEl = null; } }

  fadeFlash() {
    const f = h('div.fade-flash');
    this.overlay.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  // ---- yere düşme / uyku / izleme
  showDowned() {
    this.hideDowned();
    this.downEl = h('div.downed', h('h2', 'YERE DÜŞTÜN'), h('p.down-text', 'Bir takım arkadaşın seni kaldırabilir.'), h('div.down-timer'),
      button('Hemen üsse dön', () => this.S && this.S.respawnLocal(), 'small'));
    this.overlay.appendChild(this.downEl);
  }
  hideDowned() { if (this.downEl) { this.downEl.remove(); this.downEl = null; } }

  showSleep() {
    this.hideSleep();
    this.sleepEl = h('div.sleep', h('h2', 'Zzz…'), h('p.sleep-info', 'Uyuyorsun.'), button('Uyan', () => this.S && this.S.wake(), 'orange'));
    this.overlay.appendChild(this.sleepEl);
  }
  hideSleep() { if (this.sleepEl) { this.sleepEl.remove(); this.sleepEl = null; } }

  showSpectate(text) {
    if (this.specEl) this.specEl.remove();
    this.specEl = h('div.spectate', h('h2', text || 'Kurtuldun!'), h('p', 'Takımının geri kalanını bekliyorsun…'));
    this.overlay.appendChild(this.specEl);
  }

  showResults(e) { this.closePanel(true); this.hideDowned(); this.hideSleep(); if (this.specEl) { this.specEl.remove(); this.specEl = null; } this.panels.showResults(e); }

  // ======================================================================= bildirimler
  toast(text, kind = 'info', dur = 3.5) {
    const now = performance.now();
    if (this._lastToast === text && now - this._lastToastT < 1500) return;
    this._lastToast = text; this._lastToastT = now;
    const el = h('div.toast.' + kind, text);
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 5) this.toastLayer.firstChild.remove();
    setTimeout(() => el.classList.add('out'), dur * 1000);
    setTimeout(() => el.remove(), dur * 1000 + 500);
  }

  itemToast(id, qty) { if (this.game.state === 'playing') this.hud.itemToast(id, qty); }

  showBanner(title, sub, kind = '', dur = 3.2) {
    this.bannerQ.push({ title, sub, kind, dur });
    if (!this.bannerBusy) this.nextBanner();
  }

  nextBanner() {
    const b = this.bannerQ.shift();
    if (!b) { this.bannerBusy = false; this.bannerEl.classList.add('hidden'); return; }
    this.bannerBusy = true;
    this.bannerEl.className = 'big-banner ' + b.kind;
    clear(this.bannerEl);
    this.bannerEl.append(h('div.bb-title', b.title), b.sub ? h('div.bb-sub', b.sub) : null);
    setTimeout(() => this.nextBanner(), b.dur * 1000);
  }

  questBanner(title, sub, kind = '') { this.showBanner(title, sub, 'quest ' + kind, 3); }
  phaseBanner(phase) { const t = PHASE_TEXT[phase]; if (t && this.S) this.showBanner(`${this.S.time.day}. GÜN — ${t[0]}`, t[1], 'phase', 3); }
  regionBanner(name, desc, danger) { this.showBanner(name.toLocaleUpperCase('tr'), `${desc}  ${'☠'.repeat(Math.max(1, danger || 1))}`, 'region', 3.4); }
  broadcast(title, text) { if (this.game.state === 'playing') this.hud.broadcast(title, text); }
  chatMessage(name, text) { this.hud.chatMessage(name, text); }
  damageFlash() { this.hud.damageFlash(); }
  setPrompt(p) { this.hud.setPrompt(p); }
  setCrosshair(kind, spread) { this.hud.setCrosshair(kind, spread); }
  hitMarker(head) { this.hud.hitMarker(head); }
  setBuildHint(def, why) { const S = this.S; if (S) this.hud.setBuildHint(def, why, S.inventory, S.build.costMul()); }
  updateHotbar() { this.hud.hotVer = -1; }
  refreshInventory() { if (this.panel && this.panel.name === 'journal') this.journal.refresh(); if (this.panel && this.panel.name === 'storage') this.panels.renderStorage(); }
  refreshQuests() { this.hud.questKey = null; if (this.panel && this.panel.name === 'journal' && this.journal.tab === 'quests') this.journal.render(); }
  refreshStorage(id) { this.panels.refreshStorage(id); }

  // ======================================================================= ilerleme çubuğu (yeme, tedavi, üretim)
  progress(label, dur, onDone, onCancel) {
    if (this.prog && this.prog.onCancel) this.prog.onCancel();
    const S = this.S;
    this.prog = { label, dur, t: 0, onDone, onCancel, x: S ? S.local.pos.x : 0, z: S ? S.local.pos.z : 0 };
  }

  cancelProgress() { if (this.prog) { const p = this.prog; this.prog = null; this.hud.hideProgress(); p.onCancel && p.onCancel(); } }

  // ======================================================================= paneller (yönlendirme)
  openJournal(tab) { this.journal.open(tab); }
  openTeam() { this.panels.openTeam(); }
  openPause() { if (this.panel && this.panel.name === 'pause') { this.closePanel(); return; } this.panels.openPause(); }
  openChat() { if (this.game.net.active || this.S.bots.count()) this.hud.openChat(); else this.toast('Sohbet çok oyunculu oyunda kullanılır.', 'info', 2); }
  openEmotes() { this.panels.openEmotes(); }
  openBuildMenu() { this.panels.openBuildMenu(); }
  openDialog(d) { this.panels.openDialog(d); }
  closeDialog() { this.panels.closeDialog(); }
  openTrade(n) { this.panels.openTrade(n); }
  openStorage(o) { this.panels.openStorage(o); }
  openVehicle(v) { this.panels.openVehicle(v); }
  openEvent(e) { this.panels.openEvent(e); }
  closeEvent() { this.panels.closeEvent(); }
  openNote(n, html) { this.panels.openNote(n, html); }

  // ======================================================================= kare güncellemesi
  update(dt) {
    const S = this.S;
    if (Settings.get('graphics.fpsCounter')) { this.fps.classList.remove('hidden'); this._fpsT = (this._fpsT || 0) - dt; if (this._fpsT <= 0) { this._fpsT = 0.5; this.fps.textContent = `${this.game.gfx.fps} FPS · ${this.game.gfx.renderer.info.render.calls} çizim`; } } else this.fps.classList.add('hidden');
    if (!S || this.game.state !== 'playing') return;
    this.hud.update(dt);
    this.panels.update(dt);
    // ilerleme
    if (this.prog) {
      const p = this.prog;
      p.t += dt;
      const moved = Math.hypot(S.local.pos.x - p.x, S.local.pos.z - p.z) > 1.6;
      if (moved || S.localStats.downed) { this.cancelProgress(); }
      else if (p.t >= p.dur) { this.prog = null; this.hud.hideProgress(); p.onDone && p.onDone(); }
      else this.hud.showProgress(p.label, p.t / p.dur);
    }
    // yere düşme sayacı
    if (this.downEl) {
      const left = Math.max(0, 75 - S.localStats.downTime);
      this.downEl.querySelector('.down-timer').textContent = `${Math.ceil(left)} sn sonra üste döneceksin`;
    }
    if (this.sleepEl && S.sleepState) {
      const st = S.sleepState;
      this.sleepEl.querySelector('.sleep-info').textContent = st.ff > 1 ? `Takım uyuyor… zaman hızlandı (x${st.ff}). Saat ${String(S.time.hour).padStart(2, '0')}:${String(S.time.minute).padStart(2, '0')}` : `Uyumak için takımın yarısı gerekli (${st.votes}/${st.need}).`;
    }
  }
}

export { banner };
