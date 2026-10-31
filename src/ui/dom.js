// Küçük DOM yardımcıları (çerçevesiz arayüz).
import { ITEMS, RARITY } from '../data/items.js';
import { escapeHtml } from '../core/util.js';

/** h('div.cls#id', {attrs, on:{click}}, ...children) */
export function h(sel, props, ...kids) {
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  sel = sel.trim().replace(/\s+/g, '.').replace(/\.{2,}/g, '.').replace(/\.$/, '');
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const e = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) { if (part[0] === '.') e.classList.add(part.slice(1)); else e.id = part.slice(1); }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  append(e, kids);
  return e;
}

function append(e, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(e, k);
    else if (k instanceof Node) e.appendChild(k);
    else e.appendChild(document.createTextNode(String(k)));
  }
}

export function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
export const esc = escapeHtml;

/** Eşya simgesi (3B modelden işlenmiş PNG) */
export function itemIcon(game, id, cls = 'item-icon') {
  const img = h('img.' + cls, { alt: ITEMS[id] ? ITEMS[id].name : id, draggable: false });
  try { img.src = game.icons.icon(id); } catch { img.alt = '?'; }
  return img;
}

/** Envanter yuvası görünümü */
export function slotView(game, stack, opts = {}) {
  const el = h('div.slot');
  if (opts.cls) for (const c of opts.cls.split(/\s+/)) if (c) el.classList.add(c);
  if (opts.index !== undefined) el.dataset.index = opts.index;
  if (opts.hotkey) el.appendChild(h('span.slot-key', String(opts.hotkey)));
  if (stack) {
    const def = ITEMS[stack.id];
    el.classList.add('filled');
    if (def && def.rarity && def.rarity !== 'common') el.style.setProperty('--rar', RARITY[def.rarity].color);
    el.appendChild(itemIcon(game, stack.id));
    if (stack.qty > 1) el.appendChild(h('span.slot-qty', String(stack.qty)));
    if (stack.dur !== undefined && def && def.durability) el.appendChild(h('div.slot-dur', h('i', { style: { width: Math.round(Math.max(0, stack.dur) / def.durability * 100) + '%' } })));
    if (stack.ammo !== undefined && def && def.gun) el.appendChild(h('span.slot-ammo', String(stack.ammo)));
    if (stack.fuel !== undefined && def && def.fuelCap) el.appendChild(h('span.slot-ammo', Math.round(stack.fuel) + 'L'));
    el.title = def ? def.name : stack.id;
  }
  return el;
}

export function bar(value, max = 100, cls = '') {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return h('div.bar' + (cls ? '.' + cls : ''), h('i', { style: { width: pct + '%' } }));
}

export function setBar(el, value, max = 100) {
  const i = el.firstChild;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  i.style.width = pct + '%';
}

export function button(label, onClick, cls = '') {
  return h('button.btn' + (cls ? '.' + cls.split(/\s+/).filter(Boolean).join('.') : ''), { type: 'button', on: { click: (e) => { e.stopPropagation(); onClick(e); } } }, label);
}

export function portrait(charId, kind = 'head') {
  return h('img.portrait', { src: `assets/img/portraits/${charId}_${kind}.jpg`, alt: charId, draggable: false });
}

/** Bölüm başlığı (konsept sanattaki parşömen etiket) */
export function banner(text) { return h('div.banner', text); }

export function fmtTime(min) { const m = ((Math.floor(min) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
