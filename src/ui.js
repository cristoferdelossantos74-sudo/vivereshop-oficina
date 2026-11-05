// Utilidades de interfaz: panel, diálogos, toasts, enlaces
import { Capacitor } from '@capacitor/core';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const money = (n, cur = 'RD$') => `${cur}${Math.round(n || 0).toLocaleString('es-DO')}`;
export const isNative = () => Capacitor.isNativePlatform();

export function toast(msg, type = 'ok', ms = 2600) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h(`<div class="toast ${type === 'bad' ? 'bad' : ''}">${esc(msg)}</div>`);
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

// ---------- Panel principal (bottom sheet en móvil / lateral en PC) ----------
let current = null;
export function closeSheet() { if (current) { current.onClose?.(); current.scrim.remove(); current.el.remove(); current = null; } }
export function openSheet({ title, sub = '', icon = '⚙️', color = '#16a34a', tabs = null, tab = null, render, onClose, live = true }) {
  closeSheet();
  const scrim = h('<div class="scrim"></div>');
  const el = h(`<div class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="grab"></div>
    <div class="sh-head"><div class="sh-ic" style="background:${esc(color)}">${icon}</div>
      <div style="min-width:0"><div class="sh-title">${esc(title)}</div><div class="sh-sub">${esc(sub)}</div></div>
      <button class="sh-x" aria-label="Cerrar">✕</button></div>
    ${tabs ? `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="sh-body"></div></div>`);
  document.body.append(scrim, el);
  const body = el.querySelector('.sh-body');
  const state = { el, scrim, body, tab: tab || (tabs && tabs[0][0]), onClose };
  const draw = () => {
    el.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
    const y = body.scrollTop; body.innerHTML = ''; render(body, state.tab, api); body.scrollTop = y;
  };
  const api = {
    rerender: draw, close: closeSheet, get tab() { return state.tab; },
    setTab(t) { state.tab = t; body.scrollTop = 0; draw(); },
    setHeader(t, s) { el.querySelector('.sh-title').textContent = t; if (s != null) el.querySelector('.sh-sub').textContent = s; }
  };
  el.querySelectorAll('.tab').forEach((b) => b.onclick = () => api.setTab(b.dataset.tab));
  el.querySelector('.sh-x').onclick = closeSheet; scrim.onclick = closeSheet;
  // Arrastrar hacia abajo para cerrar (móvil)
  let sy = null; const grab = el.querySelector('.grab');
  el.querySelector('.sh-head').addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  grab.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (sy == null) return; const d = e.touches[0].clientY - sy; if (d > 0) el.style.transform = `translateY(${d}px)`; }, { passive: true });
  el.addEventListener('touchend', (e) => { if (sy == null) return; const d = e.changedTouches[0].clientY - sy; sy = null; if (d > 110) closeSheet(); else el.style.transform = ''; });
  current = { ...state, api, live }; draw();
  return api;
}
export const sheetIsOpen = () => !!current;
export const refreshSheet = () => current?.api.rerender();
// Refresco automático cuando cambian los datos (sin borrar lo que estás escribiendo)
export function autoRefreshSheet() {
  if (!current || current.live === false || current.api.tab === 'config') return;
  const ae = document.activeElement;
  if (ae && current.el.contains(ae) && ae.matches('input,textarea,select')) return;
  if (current.el.querySelector('.sh-body input:not([type=hidden]), .sh-body textarea')?.value) return;
  current.api.rerender();
}

// ---------- Diálogos ----------
export function dialog({ title, html = '', ok = 'Guardar', cancel = 'Cancelar', danger = false, onOk, extra }) {
  return new Promise((resolve) => {
    const w = h(`<div class="dlg-wrap"><div class="dlg"><h3>${esc(title)}</h3><div class="dlg-b">${html}</div>
      <div class="err"></div><div class="acts">${extra ? `<button class="btn bad sm" data-x>${esc(extra)}</button><span style="flex:1"></span>` : ''}
      ${cancel ? `<button class="btn ghost" data-c>${esc(cancel)}</button>` : ''}<button class="btn ${danger ? 'bad' : ''}" data-ok>${esc(ok)}</button></div></div></div>`);
    document.body.appendChild(w);
    const err = w.querySelector('.err');
    const done = (v) => { w.remove(); resolve(v); };
    w.querySelector('[data-c]')?.addEventListener('click', () => done(null));
    w.querySelector('[data-x]')?.addEventListener('click', () => done('extra'));
    w.addEventListener('click', (e) => { if (e.target === w) done(null); });
    w.querySelector('[data-ok]').onclick = async () => {
      const b = w.querySelector('[data-ok]'); b.disabled = true; err.textContent = '';
      try { const v = onOk ? await onOk(w) : true; if (v !== false) done(v ?? true); }
      catch (e) { err.textContent = e.message || String(e); }
      b.disabled = false;
    };
    setTimeout(() => w.querySelector('input,textarea')?.focus(), 50);
  });
}
export const confirmDlg = (title, text, ok = 'Sí', danger = false) => dialog({ title, html: `<p class="muted" style="font-size:15px">${esc(text)}</p>`, ok, danger });

// ---------- Enlaces ----------
export async function openUrl(url) {
  if (!url) return toast('No hay enlace configurado', 'bad');
  if (isNative()) {
    try { const { AppLauncher } = await import('@capacitor/app-launcher'); await AppLauncher.openUrl({ url }); return; } catch {}
  }
  window.open(url, '_blank', 'noopener');
}
export async function openAndroidApp(pkg, fallbackUrl) {
  if (pkg && isNative()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const { value } = await AppLauncher.canOpenUrl({ url: pkg });
      if (value) { await AppLauncher.openUrl({ url: pkg }); return; }
    } catch {}
  }
  openUrl(fallbackUrl);
}
export const wa = (text, phone = '') => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = h('<textarea style="position:fixed;opacity:0"></textarea>'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast('📋 Copiado');
}

export function confetti(n = 60) {
  const em = ['🎉', '🎊', '💚', '✨', '🥳', '💸', '⭐'];
  for (let i = 0; i < n; i++) {
    const c = h(`<div class="confetti">${em[i % em.length]}</div>`);
    c.style.left = Math.random() * 100 + 'vw'; c.style.animationDuration = 2 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * 0.8 + 's';
    document.body.appendChild(c); setTimeout(() => c.remove(), 5500);
  }
}

export function vibrate(p = [120, 60, 120]) { try { navigator.vibrate?.(p); } catch {} }
export function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.18); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.18); o.stop(ac.currentTime + i * 0.18 + 0.2);
    });
  } catch {}
}
