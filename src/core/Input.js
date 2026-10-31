// Klavye/fare girişi, işaretçi kilidi ve tuş eşlemeleri.
import { Settings } from './Settings.js';

const KEY_LABELS = { Space: 'Boşluk', ShiftLeft: 'Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Geri', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps' };
export function keyLabel(code) {
  if (!code) return '?';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, leftReleased: false, wheel: 0 };
    this.locked = false;
    this.wantLock = false; // oyun içi ve arayüz kapalıyken true
    this.textFocus = false;
    this.enabled = true;
    this.listeners = [];

    const on = (t, e, f, o) => { t.addEventListener(e, f, o); this.listeners.push([t, e, f, o]); };
    on(window, 'keydown', (e) => {
      if (this._isTyping(e)) return;
      if (e.code === 'Tab' || e.code === 'Space' || (e.code.startsWith('Arrow'))) e.preventDefault();
      if (e.ctrlKey && (e.code === 'KeyS' || e.code === 'KeyD')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    on(window, 'keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    on(window, 'blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    on(canvas, 'mousedown', (e) => {
      if (this.wantLock && !this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 0) { if (this.mouse.left) this.mouse.leftReleased = true; this.mouse.left = false; }
      if (e.button === 2) this.mouse.right = false;
    });
    on(window, 'mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
    });
    on(canvas, 'wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = false; this.mouse.right = false; }
    });
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  requestLock() {
    if (this.locked) return;
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: false }); if (p && p.catch) p.catch(() => {}); } catch { /* yoksay */ }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  binding(action) { return Settings.get('controls.bindings')[action]; }
  isDown(action) { return this.enabled && this.down.has(this.binding(action)); }
  wasPressed(action) { return this.enabled && this.pressed.has(this.binding(action)); }
  keyPressed(code) { return this.enabled && this.pressed.has(code); }
  keyDown(code) { return this.enabled && this.down.has(code); }
  label(action) { return keyLabel(this.binding(action)); }

  /** Kare sonunda çağrılır */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftPressed = false; this.mouse.rightPressed = false; this.mouse.leftReleased = false;
  }

  dispose() { for (const [t, e, f, o] of this.listeners) t.removeEventListener(e, f, o); }
}
