import './style.css';
import { createStore, DEMO } from './store.js';
import { COMPANY, CONFIG_ERROR } from './config.js';
import { createOffice } from './office3d.js';
import { seedData, stateOf, workloadOf, todayKey, STATE_INFO, ROLES, moodOf } from './agents.js';
import * as api from './api.js';
import { h, esc, toast, dialog, money, isNative, closeSheet, autoRefreshSheet, confetti, $ } from './ui.js';
import * as P from './panels.js';
import { initNotifications, nagTick, resyncAll } from './notify.js';

const app = document.getElementById('app');
let store;

// ------------------------------------------------------------ LOGIN
function showLogin(msg = '') {
  app.innerHTML = '';
  const floats = ['💻', '☕', '🤖', '💬', '📺', '⏰', '💚', '🎉'].map((e, i) =>
    `<span class="floaty" style="left:${8 + (i * 12) % 86}%;top:${10 + ((i * 37) % 78)}%;animation-delay:${i * 0.6}s">${e}</span>`).join('');
  const el = h(`<div class="login">${floats}<form class="login-card" autocomplete="on">
    <div class="brand"><div class="brand-logo">🏢</div><div><h1>${esc(COMPANY)}</h1><small>Oficina virtual</small></div></div>
    <p class="lead">Entra para ver a tu equipo de agentes trabajando.</p>
    ${DEMO ? '<span class="demo-badge">MODO DEMO · escribe cualquier correo y clave</span>' : ''}
    <label class="f">Correo</label><input class="in" name="email" type="email" autocomplete="username" required placeholder="tucorreo@gmail.com">
    <label class="f">Contraseña</label><input class="in" name="pass" type="password" autocomplete="current-password" required placeholder="••••••••">
    <div class="err">${esc(msg)}</div>
    <button class="btn block" type="submit" style="margin-top:6px;padding:14px">🔐 Entrar a la oficina</button>
    <div style="text-align:center;margin-top:8px"><button type="button" class="link" data-forgot>¿Olvidaste tu contraseña?</button></div>
  </form></div>`);
  app.appendChild(el);
  const f = el.querySelector('form'); const err = el.querySelector('.err');
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Entrando...';
    try { await store.login(f.email.value, f.pass.value); }
    catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = '🔐 Entrar a la oficina'; }
  };
  el.querySelector('[data-forgot]').onclick = async () => {
    if (!f.email.value) { err.textContent = 'Escribe tu correo primero.'; return; }
    try { await store.resetPassword(f.email.value); err.style.color = 'var(--g)'; err.textContent = '📧 Te enviamos un correo para cambiar la contraseña.'; }
    catch (x) { err.textContent = x.message; }
  };
}
const loading = (t = 'Abriendo la oficina...') => { app.innerHTML = `<div class="loading"><div><div class="spin"></div>${esc(t)}</div></div>`; };

// ------------------------------------------------------------ ARRANQUE
async function ensureMember(user) {
  let me = await store.get('members', user.uid).catch(() => null);
  if (me) return me;
  // Primera entrada: solo el correo de CEO escrito en firestore.rules puede crearse como CEO
  const guess = user.email.split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] || 'CEO';
  let name = DEMO ? 'Javi' : guess.charAt(0).toUpperCase() + guess.slice(1);
  me = { name, role: 'ceo', email: user.email, color: '#16a34a', gender: 'm', hairStyle: 'corto', hairColor: '#1a0f0a', createdAt: Date.now() };
  try { await store.set('members', user.uid, me, false); }
  catch { return null; } // las reglas lo rechazaron: no es el CEO ni fue invitado
  if (!DEMO) {
    const r = await dialog({ title: '👑 Bienvenido, CEO', html: '<p class="muted">Es tu primera vez. ¿Cómo quieres que te llame tu equipo?</p><input class="in" name="n" value="' + esc(name) + '">', cancel: null, ok: 'Abrir mi oficina', onOk: (w) => w.querySelector('[name=n]').value.trim() || name });
    if (typeof r === 'string' && r !== name) { name = r; me.name = r; await store.set('members', user.uid, { name }); }
  }
  const office = await store.get('office', 'main').catch(() => null);
  if (!office) {
    const seed = seedData(name); const items = [];
    for (const c of Object.keys(seed)) for (const [id, d] of Object.entries(seed[c])) items.push([c, id, d]);
    await store.batchSet(items);
    if (DEMO) {
      await store.createMember('ada@vivereshop.com', 'demo', { name: 'Ada', role: 'socia', color: '#ec4899', gender: 'f', hairStyle: 'cola', hairColor: '#1a0f0a', skin: '#c68642', lastSeen: Date.now() });
      await store.createMember('yessy@vivereshop.com', 'demo', { name: 'Yessy', role: 'socia', color: '#8b5cf6', gender: 'f', hairStyle: 'largo', hairColor: '#a0522d', skin: '#e0ac69', lastSeen: 0 });
    }
  }
  return { id: user.uid, ...me };
}

let teardown = [];
async function start() {
  loading('Cargando...');
  if (CONFIG_ERROR) return showFatal(CONFIG_ERROR);
  try { store = await createStore(); }
  catch (e) { console.error(e); return showFatal('No pude conectar con Firebase: ' + (e.message || e) + '. Revisa el secreto FIREBASE_CONFIG y vuelve a correr "Run workflow".'); }
  store.onAuth(async (user) => {
    teardown.forEach((f) => { try { f(); } catch {} }); teardown = [];
    closeSheet(); document.querySelectorAll('.monitor,.bubble,.banner').forEach((x) => x.remove());
    if (!user) return showLogin();
    loading();
    try {
      const me = await ensureMember(user);
      if (!me) { await store.logout(); return showLogin('Esta cuenta no tiene acceso a la oficina. Pídele al CEO que te cree un usuario.'); }
      openOffice(user, me);
    } catch (e) { console.error(e); await store.logout().catch(() => {}); showLogin(e.message || 'Error al entrar'); }
  });
}

// ------------------------------------------------------------ OFICINA
function openOffice(user, meDoc) {
  app.innerHTML = `<div id="scene"></div>
    <div class="hud">
      <div class="pill company"><div class="dot">🏢</div><div><div>${esc(COMPANY)}</div><div class="meta hide-sm" data-clock></div></div></div>
      <button class="pill wallet" data-wallet style="border:0">💰 <span data-money></span></button>
      <div class="spacer"></div>
      <div class="tools">
        <button class="ibtn g" data-dash title="Dashboard">🖥️</button>
        <button class="ibtn" data-party title="Celebrar">🎉</button>
        <button class="ibtn" data-team title="Equipo">👑</button>
        <button class="ibtn" data-cam title="Centrar vista">🎯</button>
        <button class="ibtn" data-set title="Ajustes">⚙️</button>
      </div>
    </div>
    ${DEMO ? '<div class="demo-ribbon">MODO DEMO<span class="hide-sm"> · conecta Firebase para usarlo de verdad</span></div>' : ''}
    <div class="dock"></div>`;

  const S = {
    user, me: meDoc, members: [], agents: [], areas: [], allTasks: [], tasks: [], groups: [], ledger: [],
    office: {}, settings: {}, secDocs: {}, streaming: null, streamingError: '', pending: null, monitorData: {}
  };
  const C = {
    S, store, running: new Set(), openAgentId: null, dashRender: null,
    isCEO: () => S.me?.role === 'ceo',
    cur: () => S.settings.currency || 'RD$',
    ctx: () => ({
      pending: S.pending && !S.pending.error ? S.pending.count : null,
      streaming: S.streaming, tasks: S.tasks, secretaria: S.secDocs[todayKey()],
      monitors: Object.fromEntries(Object.entries(S.monitorData).filter(([, v]) => !v.error).map(([k, v]) => [k, v.count])),
      running: C.running
    })
  };
  const office = createOffice($('#scene'), { onPick: (p) => {
    if (p.type === 'agent') { office.focus(p.id); P.agentPanel(C, p.id); }
    else if (p.type === 'screen') openDash();
    else if (p.type === 'hire' || p.type === 'desk') P.hirePanel(C);
    else if (p.type === 'member') P.teamPanel(C);
  } });
  C.office = office;
  teardown.push(() => office.dispose());

  // ---------- Burbujas de diálogo ----------
  const bubbles = new Map();
  C.say = (id, text) => {
    bubbles.get(id)?.el.remove();
    const el = h(`<div class="bubble">${esc(text)}</div>`);
    const a = S.agents.find((x) => x.id === id); if (a) el.style.borderColor = a.color;
    el.onclick = () => { el.remove(); bubbles.delete(id); if (a) P.agentPanel(C, id); };
    document.body.appendChild(el);
    bubbles.set(id, { el, until: Date.now() + 6000 });
  };
  let raf = true;
  (function moveBubbles() {
    if (!raf) return; requestAnimationFrame(moveBubbles);
    for (const [id, b] of bubbles) {
      if (Date.now() > b.until) { b.el.remove(); bubbles.delete(id); continue; }
      const p = office.screenPos(id);
      if (!p || !p.visible) { b.el.style.display = 'none'; continue; }
      b.el.style.display = ''; const half = Math.min(125, innerWidth / 2 - 8); b.el.style.left = Math.max(half + 8, Math.min(innerWidth - half - 8, p.x)) + 'px'; b.el.style.top = Math.max(70, p.y) + 'px';
    }
  })();
  teardown.push(() => { raf = false; bubbles.forEach((b) => b.el.remove()); });

  // ---------- Suscripciones en tiempo real ----------
  const onData = () => { tick(); autoRefreshSheet(); C.dashRender?.(); };
  const sub = (c, fn) => teardown.push(store.watch(c, (rows) => { fn(rows); onData(); }));
  sub('members', (r) => { S.members = r; S.me = { ...S.me, ...(r.find((m) => m.id === user.uid) || {}) }; if (!r.find((m) => m.id === user.uid) && r.length) store.logout(); });
  sub('agents', (r) => { S.agents = r.sort((a, b) => (a.desk ?? 0) - (b.desk ?? 0)); });
  sub('areas', (r) => { S.areas = r; });
  sub('groups', (r) => { S.groups = r; });
  sub('ledger', (r) => { S.ledger = r; });
  sub('secretaria', (r) => { S.secDocs = Object.fromEntries(r.map((d) => [d.id, d])); });
  let resyncT;
  sub('tasks', (r) => {
    S.allTasks = r; S.tasks = r.filter((t) => !t.uid || t.uid === user.uid);
    clearTimeout(resyncT); resyncT = setTimeout(() => resyncAll(S.tasks, S.me?.name, coach()?.name || 'Coach'), 2500);
  });
  let lastParty = 0;
  teardown.push(store.watchDoc('office', 'main', (d) => {
    S.office = d || {};
    if ((S.office.celebrateUntil || 0) > Date.now() && S.office.celebrateUntil !== lastParty) { lastParty = S.office.celebrateUntil; confetti(60); }
    onData();
  }));
  teardown.push(store.watchDoc('settings', 'main', (d) => {
    const before = S.settings.backendUrl;
    S.settings = d || {}; api.setSettings(S.settings);
    if (S.settings.backendUrl && S.settings.backendUrl !== before) { C.pollStreaming(true); C.loadSecretaria(); }
    onData();
  }));

  const coach = () => S.agents.find((a) => a.role === 'tareas');

  // ---------- Trabajo real de los agentes ----------
  C.refreshNow = () => onData();
  C.pollPending = async (force) => {
    const z = S.agents.find((a) => a.role === 'zapia'); if (!z) return;
    try {
      let r;
      if (z.monitorUrl) r = await api.readMonitor(z.monitorUrl, z.monitorKey);
      else if (DEMO) r = api.demoPending();
      else { S.pending = null; return; }
      const prev = S.pending?.count;
      S.pending = { ...r, at: Date.now() };
      if (prev != null && r.count > prev) C.say(z.id, `🔔 ${r.count - prev} usuario(s) nuevo(s) esperando aprobación`);
      if (force) toast(`${z.name}: ${r.count} pendiente(s)`);
    } catch (e) { S.pending = { count: 0, items: [], at: Date.now(), error: 'No pude leer los pendientes: ' + e.message }; if (force) toast(S.pending.error, 'bad'); }
    onData();
  };
  C.pollStreaming = async (force) => {
    if (!S.settings.backendUrl && !DEMO) { S.streaming = null; S.streamingError = 'Conecta el backend (⚙️ Ajustes) para leer tu Google Sheet.'; onData(); return; }
    const n = S.agents.find((a) => a.role === 'streaming');
    try {
      const r = await api.getStreaming(); const prev = S.streaming;
      S.streaming = r; S.streamingError = '';
      const alerts = r.clientsExpiring.length + r.clientsExpired.length + r.accountsExpiring.length + r.accountsExpired.length;
      if (n && (force || !prev) && alerts) C.say(n.id, `📺 ${r.clientsExpiring.length} por vencer · ${r.clientsExpired.length} vencidos · ${r.profilesAvailable.length} perfiles libres`);
    } catch (e) { S.streamingError = e.message; if (force) toast(e.message, 'bad', 5000); }
    onData();
  };
  C.pollMonitors = async (force) => {
    for (const a of S.agents.filter((x) => x.role === 'monitor' && x.monitorUrl)) {
      try { S.monitorData[a.id] = { ...(await api.readMonitor(a.monitorUrl, a.monitorKey)), at: Date.now() }; }
      catch (e) { S.monitorData[a.id] = { count: 0, error: e.message, at: Date.now() }; if (force) toast(e.message, 'bad'); }
    }
    onData();
  };
  C.loadSecretaria = async () => {
    if (!S.settings.backendUrl || S.secDocs[todayKey()]) return;
    try {
      const r = await api.getSecretaria(todayKey());
      if (r?.today) await store.set('secretaria', todayKey(), { ...r.today, at: Date.now() }, false);
      if (r?.dinamicas && r.week && !S.secDocs['din-' + r.week]) await store.set('secretaria', 'din-' + r.week, { ...r.dinamicas, at: Date.now() }, false);
      const sec = S.agents.find((a) => a.role === 'secretaria');
      if (r?.today && sec) C.say(sec.id, '☀️ Ya te dejé los mensajes de hoy listos para enviar');
    } catch (e) { console.warn(e); }
  };
  C.runCustom = async (a) => {
    C.running.add(a.id); onData(); C.say(a.id, 'Manos a la obra 🛠️');
    try {
      await store.set('agents', a.id, { lastRunDay: todayKey() });
      const out = await api.runAgent(a);
      await store.set('agents', a.id, { lastOutput: out, lastRunAt: Date.now(), lastRunDay: todayKey() });
      C.say(a.id, '✅ ¡Terminé! Toca aquí para ver el resultado');
    } catch (e) { toast(`${a.name}: ${e.message}`, 'bad', 5000); }
    C.running.delete(a.id); onData();
  };
  const autoRuns = () => {
    if (!C.isCEO()) return;
    S.agents.filter((a) => a.role === 'custom' && a.frequency === 'daily' && a.lastRunDay !== todayKey() && !C.running.has(a.id)).forEach((a) => C.runCustom(a));
  };

  // ---------- Ciclo principal ----------
  const dock = $('.dock'); let dockKey = '';
  function subLabel(a, ctx) {
    const load = workloadOf(a, ctx);
    switch (a.role) {
      case 'zapia': return load == null ? 'sin contador' : load ? `${load} por aprobar` : 'todo aprobado';
      case 'streaming': return load == null ? 'sin Sheet' : load ? `${load} alertas` : 'todo al día';
      case 'tareas': return load ? `${load} pendiente(s)` : 'agenda limpia';
      case 'secretaria': return ctx.secretaria ? 'mensajes listos' : 'por escribir';
      case 'monitor': return load == null ? 'sin datos' : `${load} pendientes`;
      case 'custom': return C.running.has(a.id) ? 'trabajando' : a.lastOutput ? 'resultado listo' : 'esperando órdenes';
      default: return '';
    }
  }
  function tick() {
    const ctx = C.ctx(); const party = (S.office.celebrateUntil || 0) > Date.now();
    const list = S.agents.map((a, i) => ({ ...a, desk: a.desk ?? i, state: stateOf(a, ctx, S.office), sub: subLabel(a, ctx) }));
    office.setAgents(list);
    const now = Date.now();
    office.setMembers([...S.members].sort((a, b) => (a.role === 'ceo' ? -1 : 1) - (b.role === 'ceo' ? -1 : 1))
      .map((m) => ({ ...m, online: m.id === user.uid || now - (m.lastSeen || 0) < 150000 })));
    office.setCelebrate(party);
    // Banner de fiesta
    let ban = $('.banner');
    if (party) { if (!ban) { ban = h('<div class="banner"></div>'); document.body.appendChild(ban); } ban.textContent = `🎉 ${S.office.celebrateMsg || '¡Celebrando!'} 🎉`; }
    else ban?.remove();
    $('[data-party]').textContent = party ? '⏹️' : '🎉';
    // HUD
    $('[data-money]').textContent = money(S.office.wallet, C.cur());
    // Dock
    const key = JSON.stringify(list.map((a) => [a.id, a.name, a.color, a.state, a.sub, moodOf(a) < 25]));
    if (key !== dockKey) {
      dockKey = key;
      dock.innerHTML = list.map((a) => {
        const load = workloadOf(a, ctx);
        return `<button class="chip" data-ag="${a.id}"><span class="av" style="background:${esc(a.color)}">${ROLES[a.role]?.icon || '🤖'}${load ? `<span class="alert">${load}</span>` : ''}</span>
          <span><span class="nm">${esc(a.name)}</span><span class="st">${STATE_INFO[a.state].emoji} ${esc(a.sub || STATE_INFO[a.state].text)}</span></span></button>`;
      }).join('') + '<button class="chip hire" data-hire><span class="av" style="background:rgba(255,255,255,.2)">＋</span><span><span class="nm">Contratar</span><span class="st">nuevo agente</span></span></button>';
      dock.querySelectorAll('[data-ag]').forEach((b) => b.onclick = () => { office.focus(b.dataset.ag); P.agentPanel(C, b.dataset.ag); });
      dock.querySelector('[data-hire]').onclick = () => P.hirePanel(C);
    }
  }
  const clock = () => { const el = $('[data-clock]'); if (el) el.textContent = new Date().toLocaleString('es-DO', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' · ' + (S.me?.role === 'ceo' ? '👑 ' : '💎 ') + (S.me?.name || ''); };

  const every = (ms, fn) => { const t = setInterval(fn, ms); teardown.push(() => clearInterval(t)); };
  every(3000, tick);
  every(20000, clock);
  every(30000, () => { const c = coach(); if (c) nagTick(S.tasks, S.me?.name || 'jefe', c.name, (txt) => C.say(c.id, txt)); });
  every(60000, () => store.set('members', user.uid, { lastSeen: Date.now() }).catch(() => {}));
  every(120000, () => C.pollPending());
  every(180000, () => C.pollMonitors());
  every(600000, () => C.pollStreaming());
  every(1800000, () => { C.loadSecretaria(); autoRuns(); });

  // ---------- Botones ----------
  const openDash = () => { closeSheet(); office.focusCEO(); setTimeout(() => P.dashboard(C), 450); };
  $('[data-dash]').onclick = openDash;
  $('[data-party]').onclick = () => ((S.office.celebrateUntil || 0) > Date.now() ? P.stopCelebrate(C) : P.celebrate(C));
  $('[data-team]').onclick = () => P.teamPanel(C);
  $('[data-cam]').onclick = () => office.resetCamera();
  $('[data-set]').onclick = () => P.settingsPanel(C);
  $('[data-wallet]').onclick = () => P.walletPanel(C);

  // ---------- Primeras cargas ----------
  clock();
  store.set('members', user.uid, { lastSeen: Date.now() }).catch(() => {});
  setTimeout(() => {
    C.pollPending(); C.pollStreaming(); C.pollMonitors(); C.loadSecretaria(); autoRuns();
    initNotifications();
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
    const first = S.agents[0]; if (first) C.say(first.id, `¡${greet}, ${S.me?.name || 'jefe'}! 👋`);
    const c = coach(); const late = S.tasks.filter((t) => !t.done && t.due && new Date(t.due) <= Date.now()).length;
    if (c && late) setTimeout(() => C.say(c.id, `Tienes ${late} tarea(s) atrasada(s). ¿Arrancamos? 💪`), 2500);
  }, 1200);
}

// PWA (PC y navegador del teléfono)
if ('serviceWorker' in navigator && !isNative() && location.protocol === 'https:' && !DEMO) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

function showFatal(msg) {
  app.innerHTML = `<div class="login"><div class="login-card"><div class="brand"><div class="brand-logo">⚠️</div><div><h1>${esc(COMPANY)}</h1><small>No se pudo abrir la oficina</small></div></div><p class="lead">${esc(msg)}</p><button class="btn block" onclick="location.reload()">🔄 Reintentar</button></div></div>`;
}
window.addEventListener('error', (e) => { if (!app.children.length) showFatal('Error al cargar: ' + (e.message || 'desconocido')); });
window.addEventListener('unhandledrejection', (e) => { if (!app.children.length) showFatal('Error al cargar: ' + (e.reason?.message || e.reason || 'desconocido')); });

start();
