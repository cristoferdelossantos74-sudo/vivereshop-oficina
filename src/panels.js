// Todos los paneles de la oficina
import { esc, h, openSheet, dialog, confirmDlg, toast, money, openUrl, openAndroidApp, wa, copy, confetti, closeSheet, refreshSheet } from './ui.js';
import { ROLES, STATE_INFO, PALETTE, moodOf, moodEmoji, stateOf, todayKey, PRAISE, AVATAR, avatarOf } from './agents.js';
import * as api from './api.js';
import { scheduleTask, cancelTask, clearNag, askWebPermission, webPermission } from './notify.js';

const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
const fmtDay = (s) => { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s); return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }); };
const weekKey = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return todayKey(d); };
const swatches = (name, list, v) => `<div class="color-row" data-colors="${name}">${list.map((c) => `<button type="button" style="background:${c}" data-c="${c}" class="${c === v ? 'on' : ''}"></button>`).join('')}<input type="hidden" name="${name}" value="${esc(v)}"></div>`;
function avatarFields(e, kind) {
  const av = avatarOf(e, kind);
  const opts = (g, cur) => AVATAR.styles[g].map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="sep">🧍 Apariencia</div>
    <div class="row"><div><label class="f">Avatar</label><select class="in" name="gender" data-gender>
      <option value="f" ${av.gender === 'f' ? 'selected' : ''}>👩 Mujer</option><option value="m" ${av.gender === 'm' ? 'selected' : ''}>👨 Hombre</option></select></div>
      <div><label class="f">Peinado</label><select class="in" name="hairStyle" data-style>${opts(av.gender, av.hairStyle)}</select></div></div>
    <label class="f">Color de cabello</label>${swatches('hairColor', AVATAR.hairs, av.hairColor)}
    <label class="f">Tono de piel</label>${swatches('skin', AVATAR.skins, av.skin)}`;
}
function wireAvatar(root) {
  const g = root.querySelector('[data-gender]'), st = root.querySelector('[data-style]');
  if (g && st) g.onchange = () => { st.innerHTML = AVATAR.styles[g.value].map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); };
}
const colorPicker = (name, val) => `<div class="color-row" data-colors="${name}">${PALETTE.map((c) => `<button type="button" style="background:${c}" data-c="${c}" class="${c === val ? 'on' : ''}"></button>`).join('')}<input type="hidden" name="${name}" value="${esc(val)}"></div>`;
function wireColors(root) {
  root.querySelectorAll('[data-colors]').forEach((row) => row.querySelectorAll('button').forEach((b) => b.onclick = () => {
    row.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); row.querySelector('input').value = b.dataset.c;
  }));
}
const val = (root, n) => root.querySelector(`[name="${n}"]`)?.value?.trim() ?? '';

// ============================ Billetera ============================
export async function spend(C, amount, note, agentId = null) {
  const w = C.S.office?.wallet ?? 0;
  if (amount > w) throw new Error(`No alcanza: tienes ${money(w)} (ficticio). Inyecta capital en la Billetera.`);
  await C.store.set('office', 'main', { wallet: w - amount });
  await C.store.add('ledger', { type: 'gasto', amount, note, agentId, at: Date.now(), by: C.S.me?.name || '' });
}

// ============================ AGENTE ============================
export function agentPanel(C, id, tab) {
  const a0 = C.S.agents.find((x) => x.id === id); if (!a0) return;
  const role = ROLES[a0.role] || ROLES.custom;
  const mainTabs = {
    zapia: [['trabajo', '✅ Usuarios']],
    secretaria: [['hoy', '💬 Hoy'], ['dinamicas', '🎲 Dinámicas'], ['grupos', '👥 Grupos']],
    streaming: [['trabajo', '📺 Alertas'], ['perfiles', '🎟️ Perfiles']],
    tareas: [['trabajo', '⏰ Tareas']],
    custom: [['trabajo', '🤖 Trabajo']], monitor: [['trabajo', '📡 Monitor']], atajo: [['trabajo', '🔗 App']]
  }[a0.role] || [['trabajo', 'Trabajo']];
  C.openAgentId = id;
  openSheet({
    title: a0.name, sub: role.label, icon: role.icon, color: a0.color,
    tabs: [...mainTabs, ['acciones', '⚡ Acciones'], ['config', '⚙️ Configurar']], tab,
    onClose: () => { C.openAgentId = null; },
    render(body, t, sh) {
      const a = C.S.agents.find((x) => x.id === id);
      if (!a) { sh.close(); return; }
      if (t === 'acciones') return renderActions(C, a, body);
      if (t === 'config') return renderConfig(C, a, body);
      const fn = { zapia: renderZapia, secretaria: renderSecretaria, streaming: renderStreaming, tareas: renderTasks, custom: renderCustom, monitor: renderMonitor, atajo: renderAtajo }[a.role] || renderCustom;
      fn(C, a, body, t);
    }
  });
}

function stateCard(C, a) {
  const st = stateOf(a, C.ctx(), C.S.office); const m = moodOf(a);
  return `<div class="card"><div class="row" style="align-items:center">
    <div><div class="muted">Estado</div><b style="font-size:18px">${STATE_INFO[st].emoji} ${STATE_INFO[st].text}</b></div>
    <div><div class="muted">Ánimo ${moodEmoji(m)} ${m}%</div><div class="mood"><i style="width:${m}%"></i></div></div></div></div>`;
}

function renderActions(C, a, body) {
  const ceo = C.isCEO();
  const forced = a.forcedState && a.forcedUntil > Date.now();
  body.innerHTML = `${stateCard(C, a)}
    <div class="sep">Descanso</div>
    <div class="grid2">
      <button class="btn soft" data-brk="15">☕ 15 min</button><button class="btn soft" data-brk="30">☕ 30 min</button>
      <button class="btn soft" data-brk="60">🛋️ 1 hora</button><button class="btn soft" data-dance>💃 Que baile</button>
    </div>
    ${forced ? '<button class="btn block" data-back style="margin-top:8px">▶️ Volver a trabajar</button>' : ''}
    <div class="sep">Nómina (dinero ficticio)</div>
    <div class="card"><div class="row"><div><div class="muted">Salario semanal</div><b>${money(a.salary, C.cur())}</b></div>
      <div><div class="muted">Último pago</div><b>${a.lastPaidAt ? fmtDay(new Date(a.lastPaidAt).toISOString()) : '—'}</b></div></div></div>
    <div class="grid2"><button class="btn" data-pay>💵 Pagar salario</button><button class="btn warn" data-bonus>🎁 Bono</button></div>
    ${a.chatLink || a.appPackage ? '<div class="sep">Conversar</div><button class="btn ghost block" data-chat>💬 Conversar con ' + esc(a.name) + '</button>' : ''}
    ${ceo ? '<div class="sep">Zona peligrosa</div><button class="btn bad block" data-fire>🗑️ Despedir a ' + esc(a.name) + '</button>' : ''}`;
  const setForced = (state, mins) => C.store.set('agents', a.id, { forcedState: state, forcedUntil: Date.now() + mins * 60000 });
  body.querySelectorAll('[data-brk]').forEach((b) => b.onclick = async () => {
    const m = +b.dataset.brk; await setForced(m >= 60 ? 'rest' : 'coffee', m); toast(`${a.name} se fue a descansar ${m} min ☕`); C.say(a.id, '¡Gracias jefe! Ya vuelvo ☕');
  });
  body.querySelector('[data-dance]').onclick = async () => { await setForced('dance', 3); C.say(a.id, '¡Ay sí! 💃🕺'); };
  body.querySelector('[data-back]')?.addEventListener('click', async () => { await C.store.set('agents', a.id, { forcedState: null, forcedUntil: 0 }); toast('De vuelta al trabajo 💪'); });
  body.querySelector('[data-pay]').onclick = async () => {
    try { await spend(C, a.salary || 0, `Salario de ${a.name}`, a.id); await C.store.set('agents', a.id, { lastPaidAt: Date.now(), bonusBoost: 0 }); toast(`Pagado ${money(a.salary, C.cur())} a ${a.name} 💵`); C.say(a.id, '¡Cobré! Ahora sí trabajo con más ganas 🤑'); }
    catch (e) { toast(e.message, 'bad'); }
  };
  body.querySelector('[data-bonus]').onclick = async () => {
    const r = await dialog({ title: `🎁 Bono para ${a.name}`, html: `<label class="f">Monto (ficticio)</label><input class="in" name="m" type="number" value="1000" min="1">`, ok: 'Dar bono',
      onOk: async (w) => { const m = Number(val(w, 'm')); if (!(m > 0)) throw new Error('Monto inválido'); await spend(C, m, `Bono a ${a.name}`, a.id); await C.store.set('agents', a.id, { bonusBoost: Math.min(60, (a.bonusBoost || 0) + Math.ceil(m / 200)) }); return m; } });
    if (r) { confetti(25); C.say(a.id, '¡Wepa! Gracias por el bono 🎁💚'); }
  };
  body.querySelector('[data-chat]')?.addEventListener('click', () => openAndroidApp(a.appPackage, a.chatLink));
  body.querySelector('[data-fire]')?.addEventListener('click', async () => {
    if (await confirmDlg('¿Despedir?', `${a.name} recogerá sus cosas y dejará la oficina.`, 'Despedir', true)) { await C.store.del('agents', a.id); closeSheet(); toast(`${a.name} ya no trabaja aquí 👋`); }
  });
}

function renderConfig(C, a, body) {
  const f = (n, label, ph = '', type = 'text') => `<label class="f">${label}</label><input class="in" name="${n}" type="${type}" value="${esc(a[n] ?? '')}" placeholder="${esc(ph)}">`;
  const extra = {
    zapia: f('chatLink', '💬 Enlace para "Conversar" (Play Store, web o wa.me)', 'https://...') + f('appPackage', '📱 Paquete Android de ZapIA (opcional, abre la app directo)', 'ej: com.zapia.app') +
      f('monitorUrl', '📡 URL de pendientes de VivereShop (snippet)', 'https://vivereshop.com/wp-json/oficina/v1/pendientes') + f('monitorKey', '🔑 Clave del snippet', '') + f('pendingLink', '🔗 Página para ver usuarios pendientes', 'https://vivereshop.com/wp-admin/users.php'),
    streaming: f('sheetLink', '📄 Enlace de tu Google Sheet (para abrirlo rápido)', 'https://docs.google.com/spreadsheets/...'),
    custom: `<label class="f">🧠 Instrucciones (qué hace este agente)</label><textarea class="in" name="prompt" rows="6">${esc(a.prompt || '')}</textarea>
      <label class="f">Frecuencia</label><select class="in" name="frequency"><option value="manual">Cuando yo le diga</option><option value="daily" ${a.frequency === 'daily' ? 'selected' : ''}>Todos los días (al abrir la oficina)</option></select>` + f('chatLink', '💬 Enlace para conversar (opcional)'),
    monitor: f('monitorUrl', '📡 URL que devuelve { "count": n }') + f('monitorKey', '🔑 Clave (opcional)') + f('link', '🔗 Enlace para revisar'),
    atajo: f('chatLink', '🔗 Enlace (web, wa.me, Play Store)') + f('appPackage', '📱 Paquete Android (opcional)')
  }[a.role] || '';
  body.innerHTML = `<form class="card" onsubmit="return false">
    ${f('name', 'Nombre')}
    <label class="f">Color del uniforme</label>${colorPicker('color', a.color)}
    ${f('salary', 'Salario semanal (ficticio)', '', 'number')}
    <div class="row"><div>${f('workFrom', '🕘 Entra', '', 'time')}</div><div>${f('workTo', '🕔 Sale', '', 'time')}</div></div>
    <div class="row"><div>${f('breakFrom', '☕ Descanso desde', '', 'time')}</div><div>${f('breakTo', '☕ hasta', '', 'time')}</div></div>
    ${avatarFields(a, 'agent')}
    ${extra}
    <button class="btn block" style="margin-top:14px" data-save>💾 Guardar</button></form>`;
  wireColors(body); wireAvatar(body);
  body.querySelector('[data-save]').onclick = async () => {
    const d = {}; body.querySelectorAll('[name]').forEach((i) => { d[i.name] = i.type === 'number' ? Number(i.value || 0) : i.value.trim(); });
    if (!d.name) return toast('Ponle un nombre', 'bad');
    try { await C.store.set('agents', a.id, d); toast('Guardado ✅'); C.refreshNow(); } catch (e) { toast(e.message, 'bad'); }
  };
}

// ----------------------------- ZapIA -----------------------------
function renderZapia(C, a, body) {
  const p = C.S.pending; const configured = !!a.monitorUrl || C.store.demo;
  body.innerHTML = `${stateCard(C, a)}
    <div class="stats"><div class="stat ${p?.count ? 'warn' : 'ok'}"><b>${p ? p.count : '—'}</b><span>usuarios esperando aprobación</span></div>
      <div class="stat blue"><b>${p?.at ? new Date(p.at).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' }) : '—'}</b><span>última revisión</span></div></div>
    <button class="btn block" data-chat>💬 Conversar con ${esc(a.name)} (ZapIA)</button>
    <div class="btnrow" style="margin:10px 0"><button class="btn ghost sm" data-open>🔗 Ver pendientes en VivereShop</button><button class="btn ghost sm" data-check>🔄 Revisar ahora</button></div>
    ${!configured ? `<div class="card"><h4>📡 Conecta el contador</h4><div class="muted">Para que ${esc(a.name)} sepa cuándo hay trabajo, instala el snippet <b>wordpress/snippet-pendientes.php</b> en Code Snippets y pega su URL y clave en ⚙️ Configurar. Mientras tanto trabaja en horario normal.</div></div>` : ''}
    ${p?.error ? `<div class="card"><div class="muted">⚠️ ${esc(p.error)}</div></div>` : ''}
    <div class="sep">Esperando aprobación</div>
    <div class="list">${(p?.items || []).map((u) => `<div class="item"><div class="grow"><div class="t">${esc(u.name || u.login || 'Usuario')}</div><div class="s">${esc(u.email || '')} · ${esc(fmtDate(u.registered))}</div></div><span class="tag warn">pendiente</span></div>`).join('') || '<div class="empty"><span class="big">🎉</span>No hay nadie esperando. ¡A tomarse un cafecito!</div>'}</div>`;
  body.querySelector('[data-chat]').onclick = () => openAndroidApp(a.appPackage, a.chatLink);
  body.querySelector('[data-open]').onclick = () => openUrl(a.pendingLink || 'https://vivereshop.com/wp-admin/users.php');
  body.querySelector('[data-check]').onclick = async () => { await C.pollPending(true); refreshSheet(); };
}

// ----------------------------- Secretaria -----------------------------
function sendBlock(text, group, i) {
  return `<div class="msg">${esc(text)}</div><div class="btnrow"><button class="btn soft sm" data-copy="${i}">📋 Copiar</button>
    <button class="btn sm" data-send="${i}">📲 ${group?.link ? 'Copiar y abrir grupo' : 'Enviar por WhatsApp'}</button></div>`;
}
function wireSend(body, texts, groupsByIdx) {
  body.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => copy(texts[b.dataset.copy]));
  body.querySelectorAll('[data-send]').forEach((b) => b.onclick = async () => {
    const i = b.dataset.send; const g = groupsByIdx[i];
    if (g?.link) { await copy(texts[i]); toast('Copiado: pégalo en el grupo 👇'); setTimeout(() => openUrl(g.link), 400); }
    else openUrl(wa(texts[i]));
  });
}
function renderSecretaria(C, a, body, t) {
  const groups = [...C.S.groups].sort((x, y) => (x.order || 0) - (y.order || 0));
  if (t === 'grupos') {
    body.innerHTML = `<div class="muted" style="margin-bottom:10px">Estos son tus grupos de WhatsApp. ${esc(a.name)} escribe mensajes distintos para cada uno según el tema y el tono. Pega el enlace de invitación del grupo para abrirlo con un toque.</div>
      <div class="list">${groups.map((g) => `<div class="item"><div class="grow"><div class="t">👥 ${esc(g.name)}</div><div class="s">${esc(g.topic || '')} · tono ${esc(g.tone || '')}</div></div><button class="btn ghost sm" data-edit="${g.id}">✏️</button></div>`).join('')}</div>
      <button class="btn block" style="margin-top:12px" data-add>＋ Agregar grupo</button>`;
    const edit = async (g) => {
      const r = await dialog({ title: g ? 'Editar grupo' : 'Nuevo grupo', extra: g ? 'Eliminar' : null,
        html: `<label class="f">Nombre del grupo</label><input class="in" name="name" value="${esc(g?.name || '')}">
          <label class="f">¿De qué trata / quiénes están?</label><input class="in" name="topic" value="${esc(g?.topic || '')}" placeholder="Revendedores nuevos, líderes, proveedores...">
          <label class="f">Tono</label><input class="in" name="tone" value="${esc(g?.tone || 'motivador y cercano')}">
          <label class="f">Enlace de invitación (chat.whatsapp.com/...)</label><input class="in" name="link" value="${esc(g?.link || '')}">`,
        onOk: async (w) => {
          const d = { name: val(w, 'name'), topic: val(w, 'topic'), tone: val(w, 'tone'), link: val(w, 'link') };
          if (!d.name) throw new Error('Ponle nombre al grupo');
          if (g) await C.store.set('groups', g.id, d); else await C.store.add('groups', { ...d, order: groups.length + 1 });
        } });
      if (r === 'extra' && await confirmDlg('¿Eliminar grupo?', g.name, 'Eliminar', true)) await C.store.del('groups', g.id);
      api.syncGroups(C.S.groups);
    };
    body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(groups.find((g) => g.id === b.dataset.edit)));
    body.querySelector('[data-add]').onclick = () => edit(null);
    return;
  }
  const gen = async (kind, btn) => {
    btn.disabled = true; btn.textContent = '✍️ Escribiendo...'; C.running.add(a.id); C.refreshNow();
    C.say(a.id, 'Déjamelo a mí, ya estoy escribiendo ✍️');
    try {
      const payload = groups.map((g) => ({ id: g.id, name: g.name, topic: g.topic, tone: g.tone }));
      if (kind === 'hoy') { const r = await api.generateSecretaria(payload); await C.store.set('secretaria', todayKey(), { ...r, at: Date.now() }, false); }
      else { const r = await api.generateDinamicas(payload); await C.store.set('secretaria', 'din-' + weekKey(), { ...r, at: Date.now() }, false); }
      C.say(a.id, '¡Listo jefe! Ya puedes enviarlos 💚'); toast('Mensajes listos ✅');
    } catch (e) { toast(e.message, 'bad', 5000); }
    C.running.delete(a.id); C.refreshNow(); refreshSheet();
  };
  if (t === 'dinamicas') {
    const d = C.S.secDocs['din-' + weekKey()];
    const texts = (d?.items || []).map((x) => x.text);
    body.innerHTML = `<div class="card"><h4>🎲 Dinámicas de esta semana</h4><div class="muted">Retos, juegos y encuestas para mantener los grupos activos, motivados y vendiendo.</div>
      <button class="btn block" style="margin-top:10px" data-gen>${d ? '🔄 Crear otras' : '✨ Crear dinámicas de la semana'}</button></div>
      ${(d?.items || []).map((x, i) => `<div class="card"><h4>📅 ${esc(x.day || '')} · ${esc(x.title || '')}</h4>${sendBlock(x.text, null, i)}</div>`).join('') || '<div class="empty"><span class="big">🎲</span>Todavía no hay dinámicas esta semana.</div>'}`;
    body.querySelector('[data-gen]').onclick = (e) => gen('din', e.currentTarget);
    wireSend(body, texts, {});
    return;
  }
  const doc = C.S.secDocs[todayKey()];
  const texts = [], gmap = {};
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  let html = '';
  (doc?.groups || []).forEach((g) => {
    html += `<div class="sep">👥 ${esc(g.name)}</div>`;
    (g.messages || []).forEach((m) => { const i = texts.length; texts.push(m.text); gmap[i] = byId[g.id]; html += `<div class="card"><h4>${esc(m.type || 'Mensaje')}</h4>${sendBlock(m.text, byId[g.id], i)}</div>`; });
  });
  body.innerHTML = `<div class="card"><h4>📆 ${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
    <div class="muted">${doc ? `Listos desde las ${new Date(doc.at || Date.now()).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })} · copia o envía cada uno.` : `${esc(a.name)} los prepara sola cada mañana (si conectaste el backend). También puedes pedírselos ahora.`}</div>
    <button class="btn block" style="margin-top:10px" data-gen>${doc ? '🔄 Escribir otros' : '✨ Generar mensajes de hoy'}</button></div>
    ${html || `<div class="empty"><span class="big">💬</span>${groups.length} grupos esperando sus mensajes.</div>`}`;
  body.querySelector('[data-gen]').onclick = (e) => gen('hoy', e.currentTarget);
  wireSend(body, texts, gmap);
}

// ----------------------------- Streaming -----------------------------
function clientMsg(c, expired) {
  return expired
    ? `Hola ${c.cliente || ''} 👋 Te escribimos de VivereShop. Tu cuenta de ${c.servicio || 'streaming'} (${c.perfil || ''}) venció el ${fmtDay(c.vence)}. ¿Deseas renovarla para no perder tu perfil? 💚`
    : `Hola ${c.cliente || ''} 👋 Te recordamos que tu cuenta de ${c.servicio || 'streaming'} (${c.perfil || ''}) vence el ${fmtDay(c.vence)}. ¿Te la renuevo? Así no pierdes el acceso 😉`;
}
function renderStreaming(C, a, body, t) {
  const r = C.S.streaming;
  const head = `<div class="btnrow" style="margin-bottom:10px"><button class="btn sm" data-ref>🔄 Revisar Sheet</button>${a.sheetLink ? '<button class="btn ghost sm" data-sheet>📄 Abrir Google Sheet</button>' : ''}</div>`;
  if (!r) {
    body.innerHTML = head + (C.S.streamingError ? `<div class="card"><h4>⚠️ No pude leer el Sheet</h4><div class="muted">${esc(C.S.streamingError)}</div></div>` : '<div class="empty"><span class="big">📺</span>Revisando cuentas...</div>');
  } else if (t === 'perfiles') {
    body.innerHTML = head + `<div class="sep">🎟️ Perfiles disponibles (${r.profilesAvailable.length})</div><div class="list">${r.profilesAvailable.map((p) => `<div class="item"><div class="grow"><div class="t">${esc(p.servicio)} · ${esc(p.perfil || '')}</div><div class="s">${esc(p.correo || '')}</div></div><span class="tag">libre</span></div>`).join('') || '<div class="empty">No quedan perfiles libres 😬</div>'}</div>
      <div class="sep">🏦 Tus cuentas por vencer</div><div class="list">${[...r.accountsExpired.map((x) => ({ ...x, exp: 1 })), ...r.accountsExpiring].map((x) => `<div class="item"><div class="grow"><div class="t">${esc(x.servicio)}</div><div class="s">${esc(x.correo || '')} · vence ${esc(fmtDay(x.vence))}</div></div><span class="tag ${x.exp ? 'bad' : 'warn'}">${x.exp ? 'vencida' : x.dias === 0 ? 'hoy' : `${x.dias} día(s)`}</span></div>`).join('') || '<div class="empty">Tus cuentas están al día ✅</div>'}</div>`;
  } else {
    const cl = (c, exp) => `<div class="item"><div class="grow"><div class="t">${esc(c.cliente || 'Cliente')} · ${esc(c.servicio || '')}</div><div class="s">${esc(c.perfil || '')} · ${esc(c.correo || '')} · ${exp ? 'venció' : 'vence'} ${esc(fmtDay(c.vence))}</div></div>
      <span class="tag ${exp ? 'bad' : 'warn'}">${exp ? `hace ${Math.abs(c.dias)}d` : c.dias === 0 ? 'hoy' : `${c.dias}d`}</span>${c.telefono ? `<button class="btn sm" data-wa="${esc(c.telefono)}" data-msg="${esc(clientMsg(c, exp))}">📲</button>` : ''}</div>`;
    body.innerHTML = head + `<div class="stats">
      <div class="stat warn"><b>${r.clientsExpiring.length}</b><span>clientes por vencer</span></div>
      <div class="stat bad"><b>${r.clientsExpired.length}</b><span>clientes vencidos</span></div>
      <div class="stat ok"><b>${r.profilesAvailable.length}</b><span>perfiles disponibles</span></div>
      <div class="stat blue"><b>${r.accountsExpiring.length + r.accountsExpired.length}</b><span>tus cuentas por vencer</span></div></div>
      <div class="sep">⏳ Por vencer (próximos ${C.S.settings.warnDays || 3} días)</div><div class="list">${r.clientsExpiring.map((c) => cl(c, false)).join('') || '<div class="empty">Nadie por vencer 👌</div>'}</div>
      <div class="sep">❌ Vencidos</div><div class="list">${r.clientsExpired.map((c) => cl(c, true)).join('') || '<div class="empty">Ningún vencido 🎉</div>'}</div>
      <div class="muted" style="margin-top:10px">Actualizado: ${new Date(r.updatedAt || Date.now()).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}</div>`;
    body.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => openUrl(wa(b.dataset.msg, b.dataset.wa)));
  }
  body.querySelector('[data-ref]').onclick = async (e) => { e.currentTarget.disabled = true; await C.pollStreaming(true); refreshSheet(); };
  body.querySelector('[data-sheet]')?.addEventListener('click', () => openUrl(a.sheetLink));
}

// ----------------------------- Tareas -----------------------------
function renderTasks(C, a, body) {
  const tasks = [...C.S.tasks].sort((x, y) => new Date(x.due || 0) - new Date(y.due || 0));
  const now = Date.now(); const end = new Date(); end.setHours(23, 59, 59, 999);
  const late = tasks.filter((t) => !t.done && t.due && new Date(t.due) <= now);
  const today = tasks.filter((t) => !t.done && t.due && new Date(t.due) > now && new Date(t.due) <= end);
  const later = tasks.filter((t) => !t.done && (!t.due || new Date(t.due) > end));
  const done = tasks.filter((t) => t.done).sort((x, y) => (y.doneAt || 0) - (x.doneAt || 0)).slice(0, 15);
  const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const item = (t) => `<div class="item ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-tg="${t.id}">${t.done ? '✓' : ''}</button>
    <div class="grow"><div class="t">${esc(t.title)}</div><div class="s">${t.due ? '🕒 ' + esc(fmtDate(t.due)) : 'sin hora'} · ${esc(t.scope || 'día')}${!t.done ? ` · insiste cada ${t.nagMinutes || 30} min` : ''}${t.by ? ` · ${esc(t.by)}` : ''}</div></div>
    <button class="btn ghost sm" data-del="${t.id}">🗑️</button></div>`;
  const perm = webPermission();
  body.innerHTML = `${perm !== 'granted' ? `<div class="card"><h4>🔔 Activa las notificaciones</h4><div class="muted">Para que ${esc(a.name)} te insista aunque no estés mirando la oficina.</div><button class="btn sm" style="margin-top:8px" data-perm>Activar</button></div>` : ''}
    <form class="card" onsubmit="return false"><h4>✍️ Nueva tarea</h4>
      <input class="in" name="title" placeholder="¿Qué vas a hacer?" maxlength="140">
      <div class="row"><div><label class="f">¿Cuándo?</label><input class="in" type="datetime-local" name="due" value="${local}"></div>
        <div><label class="f">Plan</label><select class="in" name="scope"><option value="día">Hoy / mañana</option><option value="semana">Esta semana</option><option value="mes">Este mes</option></select></div></div>
      <label class="f">Si no la haces, insistir cada</label><select class="in" name="nag"><option>10</option><option>15</option><option selected>30</option><option>60</option><option>120</option></select>
      <button class="btn block" style="margin-top:12px" data-add>＋ Agregar y que me persiga</button></form>
    ${late.length ? `<div class="sep" style="color:var(--bad)">🚨 Atrasadas / ahora (${late.length})</div><div class="list">${late.map(item).join('')}</div>` : ''}
    <div class="sep">📅 Hoy (${today.length})</div><div class="list">${today.map(item).join('') || '<div class="empty">Nada más para hoy</div>'}</div>
    <div class="sep">🗓️ Próximas (${later.length})</div><div class="list">${later.map(item).join('') || '<div class="empty">Planifica tu semana y tu mes aquí ✨</div>'}</div>
    ${done.length ? `<div class="sep">✅ Hechas</div><div class="list">${done.map(item).join('')}</div>` : ''}`;
  body.querySelector('[data-perm]')?.addEventListener('click', async () => { await askWebPermission(); refreshSheet(); });
  body.querySelector('[data-add]').onclick = async () => {
    const title = val(body, 'title'); if (!title) return toast('Escribe la tarea', 'bad');
    const dueV = val(body, 'due');
    const t = { title, due: dueV ? new Date(dueV).toISOString() : null, scope: val(body, 'scope'), nagMinutes: Number(val(body, 'nag')), done: false, createdAt: Date.now(), by: C.S.me?.name || '', uid: C.S.user.uid };
    const id = await C.store.add('tasks', t);
    scheduleTask({ id, ...t }, C.S.me?.name, a.name);
    C.say(a.id, `Anotado: "${title}". No te voy a dejar en paz hasta que la hagas 😈`);
    refreshSheet();
  };
  body.querySelectorAll('[data-tg]').forEach((b) => b.onclick = async () => {
    const t = C.S.tasks.find((x) => x.id === b.dataset.tg); if (!t) return;
    const doneNow = !t.done;
    await C.store.set('tasks', t.id, { done: doneNow, doneAt: doneNow ? Date.now() : null });
    clearNag(t.id);
    if (doneNow) { cancelTask(t); confetti(30); C.say(a.id, PRAISE[Math.floor(Math.random() * PRAISE.length)]); }
    else scheduleTask({ ...t, done: false }, C.S.me?.name, a.name);
  });
  body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const t = C.S.tasks.find((x) => x.id === b.dataset.del); if (!t) return;
    if (!t.done && !(await confirmDlg('¿Borrar tarea?', `${t.title} — ¿seguro? ${a.name} se va a dar cuenta 👀`, 'Borrar', true))) return;
    cancelTask(t); clearNag(t.id); await C.store.del('tasks', t.id);
  });
}

// ----------------------------- Contratados -----------------------------
function renderCustom(C, a, body) {
  body.innerHTML = `${stateCard(C, a)}
    <div class="card"><h4>🧠 Su trabajo</h4><div class="muted" style="white-space:pre-wrap">${esc(a.prompt || 'Sin instrucciones. Ve a ⚙️ Configurar.')}</div>
      <div class="muted" style="margin-top:6px">${a.frequency === 'daily' ? '🔁 Trabaja todos los días al abrir la oficina' : '👆 Trabaja cuando tú le digas'}</div>
      <button class="btn block" style="margin-top:10px" data-run>▶️ Ponlo a trabajar ahora</button></div>
    ${a.lastOutput ? `<div class="card"><h4>📄 Último resultado <span class="muted">${a.lastRunAt ? esc(fmtDate(new Date(a.lastRunAt).toISOString())) : ''}</span></h4><div class="msg">${esc(a.lastOutput)}</div>
      <div class="btnrow"><button class="btn soft sm" data-copy>📋 Copiar</button><button class="btn sm" data-wa>📲 WhatsApp</button></div></div>` : ''}
    ${a.chatLink ? '<button class="btn ghost block" data-chat>💬 Conversar</button>' : ''}`;
  body.querySelector('[data-run]').onclick = async (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = '⏳ Trabajando...'; await C.runCustom(a); refreshSheet(); };
  body.querySelector('[data-copy]')?.addEventListener('click', () => copy(a.lastOutput));
  body.querySelector('[data-wa]')?.addEventListener('click', () => openUrl(wa(a.lastOutput)));
  body.querySelector('[data-chat]')?.addEventListener('click', () => openAndroidApp(a.appPackage, a.chatLink));
}
function renderMonitor(C, a, body) {
  const m = C.S.monitorData[a.id];
  body.innerHTML = `${stateCard(C, a)}<div class="stats"><div class="stat ${m?.count ? 'warn' : 'ok'}"><b>${m ? m.count : '—'}</b><span>pendientes detectados</span></div>
    <div class="stat blue"><b>${m?.at ? new Date(m.at).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' }) : '—'}</b><span>última revisión</span></div></div>
    ${m?.error ? `<div class="card"><div class="muted">⚠️ ${esc(m.error)}</div></div>` : ''}
    <div class="btnrow"><button class="btn sm" data-check>🔄 Revisar</button>${a.link ? '<button class="btn ghost sm" data-open>🔗 Abrir</button>' : ''}</div>
    <div class="list" style="margin-top:10px">${(m?.items || []).slice(0, 30).map((x) => `<div class="item"><div class="grow"><div class="t">${esc(x.name || x.title || JSON.stringify(x))}</div></div></div>`).join('')}</div>`;
  body.querySelector('[data-check]').onclick = async () => { await C.pollMonitors(true); refreshSheet(); };
  body.querySelector('[data-open]')?.addEventListener('click', () => openUrl(a.link));
}
function renderAtajo(C, a, body) {
  body.innerHTML = `${stateCard(C, a)}<button class="btn block" data-chat style="padding:18px;font-size:17px">🚀 Abrir ${esc(a.name)}</button>
    <p class="muted" style="margin-top:12px">Configura el enlace o el paquete Android en ⚙️ Configurar.</p>`;
  body.querySelector('[data-chat]').onclick = () => openAndroidApp(a.appPackage, a.chatLink);
}

// ============================ CONTRATAR ============================
const TEMPLATES = [
  { role: 'custom', e: '🤖', t: 'Agente IA personalizado', d: 'Le escribes qué hacer y lo hace con IA gratis (ideas de posts, guiones, análisis, respuestas...)', prompt: 'Escribe 3 ideas de publicaciones para TikTok que atraigan nuevos revendedores a VivereShop. Incluye gancho, guion corto y llamado a la acción.' },
  { role: 'monitor', e: '📡', t: 'Vigilante de una URL', d: 'Revisa cada pocos minutos una dirección que devuelve un número (pedidos pendientes, tickets...) y trabaja cuando hay algo.' },
  { role: 'atajo', e: '🔗', t: 'Atajo a otra app o agente', d: 'Como ZapIA: un trabajador que te lleva a otra app, bot o página con un toque.' },
  { role: 'secretaria', e: '💬', t: 'Otra secretaria', d: 'Usa los mismos grupos y genera mensajes y dinámicas.' },
  { role: 'tareas', e: '⏰', t: 'Otro coach de tareas', d: 'Comparte la lista de tareas y te persigue.' }
];
export function hirePanel(C) {
  let sel = 0;
  openSheet({ title: 'Recursos Humanos', sub: 'Contrata un nuevo agente', icon: '🤝', live: false, render(body) {
    const tp = TEMPLATES[sel];
    const used = new Set(C.S.agents.map((x) => x.desk)); let desk = 0; while (used.has(desk)) desk++;
    const color = PALETTE[C.S.agents.length % PALETTE.length];
    body.innerHTML = `<div class="sep">1. ¿Qué tipo de trabajador?</div>
      ${TEMPLATES.map((x, i) => `<button class="tpl ${i === sel ? 'on' : ''}" data-tp="${i}"><span class="e">${x.e}</span><span><b>${x.t}</b><span>${x.d}</span></span></button>`).join('')}
      <div class="sep">2. Sus datos</div>
      <form class="card" onsubmit="return false">
        <label class="f">Nombre</label><input class="in" name="name" placeholder="Ej: Yari, Pancho, Robotín">
        <label class="f">Color del uniforme</label>${colorPicker('color', color)}
        ${avatarFields({ id: 'nuevo' + C.S.agents.length, gender: C.S.agents.length % 2 ? 'm' : 'f' }, 'agent')}
        <label class="f">Salario semanal (ficticio)</label><input class="in" name="salary" type="number" value="7000">
        ${tp.role === 'custom' ? `<label class="f">🧠 ¿Qué va a hacer?</label><textarea class="in" name="prompt" rows="5">${esc(tp.prompt)}</textarea>
          <label class="f">Frecuencia</label><select class="in" name="frequency"><option value="manual">Cuando yo le diga</option><option value="daily">Todos los días</option></select>` : ''}
        ${tp.role === 'monitor' ? '<label class="f">📡 URL a vigilar (devuelve { "count": n })</label><input class="in" name="monitorUrl" placeholder="https://..."><label class="f">🔑 Clave (opcional)</label><input class="in" name="monitorKey"><label class="f">🔗 Enlace para revisar</label><input class="in" name="link">' : ''}
        ${tp.role === 'atajo' ? '<label class="f">🔗 Enlace</label><input class="in" name="chatLink" placeholder="https://wa.me/..., Play Store, web"><label class="f">📱 Paquete Android (opcional)</label><input class="in" name="appPackage">' : ''}
        <div class="muted" style="margin-top:10px">Se sentará en el puesto #${desk + 1}. Bono de bienvenida: un salario.</div>
        <button class="btn block" style="margin-top:12px" data-hire>🤝 ¡Contratar!</button></form>`;
    wireColors(body); wireAvatar(body);
    body.querySelectorAll('[data-tp]').forEach((b) => b.onclick = () => { sel = +b.dataset.tp; refreshSheet(); });
    body.querySelector('[data-hire]').onclick = async (e) => {
      const d = { role: tp.role, desk, hiredAt: Date.now(), lastPaidAt: Date.now(), workFrom: '07:00', workTo: '23:00', breakFrom: '', breakTo: '' };
      body.querySelectorAll('form [name]').forEach((i) => { d[i.name] = i.type === 'number' ? Number(i.value || 0) : i.value.trim(); });
      if (!d.name) return toast('Ponle un nombre', 'bad');
      e.currentTarget.disabled = true;
      try {
        await spend(C, d.salary || 0, `Contratación de ${d.name}`);
        const id = await C.store.add('agents', d);
        closeSheet(); confetti(50); toast(`¡Bienvenido ${d.name}! 🎉`);
        setTimeout(() => { C.office.focus(id); C.say(id, '¡Hola equipo! Feliz de estar aquí 👋'); }, 900);
      } catch (err) { toast(err.message, 'bad'); e.currentTarget.disabled = false; }
    };
  } });
}

// ============================ DASHBOARD (pantalla CEO) ============================
export function dashboard(C) {
  C.office.setScreen(true, C.S.areas);
  const wrap = h(`<div class="monitor"><div class="bezel"><div class="glassy">
    <div class="dash-top"><span style="font-size:24px">🖥️</span><h2>Dashboard VivereShop</h2><button class="btn soft sm" data-edit>✏️ Editar</button><button class="power" title="Apagar" data-off>⏻</button></div>
    <div class="dash-body"></div></div></div></div>`);
  document.body.appendChild(wrap);
  let edit = false;
  const close = () => { wrap.remove(); C.office.setScreen(false); C.dashRender = null; };
  wrap.querySelector('[data-off]').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-edit]').onclick = (e) => { edit = !edit; e.currentTarget.textContent = edit ? '✅ Listo' : '✏️ Editar'; render(); };
  const body = wrap.querySelector('.dash-body');
  function render() {
    const areas = [...C.S.areas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const ctx = C.ctx(); const tasksToday = C.S.tasks.filter((t) => !t.done && t.due && new Date(t.due) <= new Date().setHours(23, 59, 59)).length;
    const r = C.S.streaming;
    body.innerHTML = `<div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat warn"><b>${ctx.pending ?? '—'}</b><span>usuarios por aprobar</span></div>
        <div class="stat bad"><b>${r ? r.clientsExpiring.length + r.clientsExpired.length : '—'}</b><span>clientes streaming en alerta</span></div>
        <div class="stat ok"><b>${r ? r.profilesAvailable.length : '—'}</b><span>perfiles libres</span></div>
        <div class="stat blue"><b>${tasksToday}</b><span>tareas para hoy</span></div></div>
      <div class="areas">${areas.map((a) => `<button class="area" style="--c:${esc(a.color)}" data-area="${a.id}">${edit ? `<span class="edit" data-ed="${a.id}">✏️</span>` : ''}<span class="e">${esc(a.emoji || '📁')}</span><b>${esc(a.name)}</b><small>${(a.links || []).length} enlace(s)</small></button>`).join('')}
      <button class="area add" data-new><span class="e">＋</span><b>Nueva área</b><small>Crea un acceso</small></button></div>`;
    body.querySelectorAll('[data-area]').forEach((b) => b.onclick = (e) => {
      const a = areas.find((x) => x.id === b.dataset.area);
      if (edit || e.target.dataset.ed) return editArea(C, a);
      const links = a.links || [];
      if (links.length === 1) return openUrl(links[0].url);
      dialog({ title: `${a.emoji} ${a.name}`, ok: 'Cerrar', cancel: null,
        html: `<div class="list">${links.map((l, i) => `<button class="item" style="border:0;text-align:left" data-l="${i}"><span style="font-size:20px">🔗</span><div class="grow"><div class="t">${esc(l.label)}</div><div class="s">${esc(l.url)}</div></div></button>`).join('') || '<div class="empty">Sin enlaces. Toca ✏️ Editar.</div>'}</div>` });
      setTimeout(() => document.querySelectorAll('.dlg [data-l]').forEach((x) => x.onclick = () => openUrl(links[+x.dataset.l].url)), 30);
    });
    body.querySelector('[data-new]').onclick = () => editArea(C, null);
  }
  C.dashRender = render; render();
}
async function editArea(C, a) {
  const linksTxt = (a?.links || []).map((l) => `${l.label} | ${l.url}`).join('\n');
  const r = await dialog({ title: a ? 'Editar área' : 'Nueva área', extra: a ? 'Eliminar' : null,
    html: `<div class="row"><div style="flex:0 0 80px"><label class="f">Ícono</label><input class="in" name="emoji" value="${esc(a?.emoji || '📁')}" maxlength="4" style="text-align:center;font-size:20px"></div>
      <div><label class="f">Nombre</label><input class="in" name="name" value="${esc(a?.name || '')}" placeholder="Ej: Retiros de vendedores"></div></div>
      <label class="f">Color</label>${colorPicker('color', a?.color || '#16a34a')}
      <label class="f">Enlaces (uno por línea: Nombre | https://...)</label>
      <textarea class="in" name="links" rows="5" placeholder="Pedidos | https://vivereshop.com/wp-admin/...">${esc(linksTxt)}</textarea>`,
    onOk: async (w) => {
      const links = val(w, 'links').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [x, ...rest] = l.split('|'); const url = (rest.join('|') || x).trim(); return { label: rest.length ? x.trim() : url, url: /^https?:\/\//.test(url) ? url : 'https://' + url };
      });
      const d = { emoji: val(w, 'emoji') || '📁', name: val(w, 'name'), color: val(w, 'color'), links };
      if (!d.name) throw new Error('Ponle nombre al área');
      if (a) await C.store.set('areas', a.id, d); else await C.store.add('areas', { ...d, order: C.S.areas.length });
    } });
  setTimeout(() => document.querySelectorAll('.dlg').forEach(wireColors), 0);
  if (r === 'extra' && await confirmDlg('¿Eliminar área?', a.name, 'Eliminar', true)) await C.store.del('areas', a.id);
}

// ============================ EQUIPO (socias) ============================
export function teamPanel(C) {
  openSheet({ title: 'Equipo directivo', sub: 'CEO y socias', icon: '👑', render(body) {
    const ceo = C.isCEO();
    const ms = [...C.S.members].sort((a, b) => (a.role === 'ceo' ? -1 : 1) - (b.role === 'ceo' ? -1 : 1));
    body.innerHTML = `<div class="list">${ms.map((m) => {
      const on = Date.now() - (m.lastSeen || 0) < 150000;
      return `<div class="item"><div class="av" style="width:40px;height:40px;border-radius:13px;background:${esc(m.color || '#16a34a')};display:grid;place-items:center;color:#fff;font-size:18px">${m.role === 'ceo' ? '👑' : '💎'}</div>
        <div class="grow"><div class="t">${esc(m.name)} ${m.id === C.S.user.uid ? '<span class="tag">tú</span>' : ''}</div><div class="s">${esc(m.email || '')} · ${m.role === 'ceo' ? 'CEO' : 'Socia'} · ${on ? '🟢 en línea' : 'visto ' + (m.lastSeen ? fmtDate(new Date(m.lastSeen).toISOString()) : 'nunca')}</div></div>
        ${ceo && m.id !== C.S.user.uid ? `<button class="btn ghost sm" data-rm="${m.id}">🚫</button>` : ''}</div>`;
    }).join('')}</div>
    ${ceo ? '<button class="btn block" style="margin-top:12px" data-add>＋ Crear usuario para socia</button>' : ''}
    <button class="btn ghost block" style="margin-top:8px" data-me>🎨 Mi nombre y color</button>
    <p class="muted" style="margin-top:12px">🔒 Solo las personas creadas aquí pueden entrar. Si quitas el acceso a alguien, su cuenta ya no puede ver nada.</p>`;
    body.querySelector('[data-add]')?.addEventListener('click', async () => {
      const r = await dialog({ title: 'Nueva socia', ok: 'Crear usuario',
        html: `<label class="f">Nombre</label><input class="in" name="name" placeholder="Ada">
          <label class="f">Correo</label><input class="in" name="email" type="email" placeholder="ada@gmail.com">
          <label class="f">Contraseña temporal (mín. 6)</label><input class="in" name="pass" type="text" value="Vivere${Math.floor(1000 + Math.random() * 9000)}!">
          <label class="f">Color</label>${colorPicker('color', '#ec4899')}`,
        onOk: async (w) => {
          const name = val(w, 'name'), email = val(w, 'email'), pass = val(w, 'pass');
          if (!name || !email || pass.length < 6) throw new Error('Completa nombre, correo y contraseña (6+)');
          await C.store.createMember(email, pass, { name, role: 'socia', color: val(w, 'color'), gender: 'f' });
          return { email, pass, name };
        } });
      setTimeout(() => document.querySelectorAll('.dlg').forEach(wireColors), 0);
      if (r && r.email) {
        const txt = `Hola ${r.name} 💚 Ya tienes acceso a la oficina virtual de VivereShop.\n\n🔗 ${location.origin}${location.pathname}\n📧 ${r.email}\n🔑 ${r.pass}\n\nCambia tu contraseña con "¿Olvidaste tu contraseña?" cuando entres.`;
        dialog({ title: '✅ Usuario creado', html: `<div class="msg">${esc(txt)}</div>`, ok: '📋 Copiar', cancel: 'Cerrar', onOk: () => copy(txt) });
      }
    });
    body.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      const m = C.S.members.find((x) => x.id === b.dataset.rm);
      if (await confirmDlg('¿Quitar acceso?', `${m.name} ya no podrá entrar a la oficina.`, 'Quitar', true)) await C.store.del('members', m.id);
    });
    body.querySelector('[data-me]').onclick = async () => {
      const me = C.S.me;
      const pr = dialog({ title: 'Mi perfil', html: `<label class="f">Nombre</label><input class="in" name="name" value="${esc(me.name)}"><label class="f">Color de ropa</label>${colorPicker('color', me.color || '#16a34a')}${avatarFields(me, 'member')}`,
        onOk: (w) => C.store.set('members', C.S.user.uid, { name: val(w, 'name') || me.name, color: val(w, 'color'), gender: val(w, 'gender'), hairStyle: val(w, 'hairStyle'), hairColor: val(w, 'hairColor'), skin: val(w, 'skin') }) });
      setTimeout(() => { const d = document.querySelector('.dlg'); if (d) { wireColors(d); wireAvatar(d); } }, 0);
      await pr;
    };
    setTimeout(() => wireColors(document), 0);
  } });
}

// ============================ BILLETERA ============================
export function walletPanel(C) {
  openSheet({ title: 'Billetera de la empresa', sub: 'Dinero ficticio para la nómina', icon: '💰', render(body) {
    const total = C.S.agents.reduce((s, a) => s + (a.salary || 0), 0);
    const led = [...C.S.ledger].sort((a, b) => b.at - a.at).slice(0, 25);
    body.innerHTML = `<div class="stats"><div class="stat ok"><b>${money(C.S.office?.wallet, C.cur())}</b><span>saldo disponible</span></div><div class="stat warn"><b>${money(total, C.cur())}</b><span>nómina semanal</span></div></div>
      <div class="grid2"><button class="btn" data-all>💵 Pagar nómina completa</button><button class="btn ghost" data-in>➕ Inyectar capital</button></div>
      <div class="sep">Movimientos</div><div class="list">${led.map((l) => `<div class="item"><div class="grow"><div class="t">${esc(l.note)}</div><div class="s">${esc(fmtDate(new Date(l.at).toISOString()))}${l.by ? ' · ' + esc(l.by) : ''}</div></div><b style="color:${l.type === 'ingreso' ? 'var(--g)' : 'var(--bad)'}">${l.type === 'ingreso' ? '+' : '−'}${money(l.amount, C.cur())}</b></div>`).join('') || '<div class="empty">Sin movimientos</div>'}</div>`;
    body.querySelector('[data-all]').onclick = async () => {
      try {
        await spend(C, total, `Nómina de ${C.S.agents.length} agentes`);
        await C.store.batchSet(C.S.agents.map((a) => ['agents', a.id, { lastPaidAt: Date.now(), bonusBoost: 0 }]));
        confetti(40); toast('Nómina pagada 💸 ¡Equipo feliz!');
        C.S.agents.slice(0, 3).forEach((a, i) => setTimeout(() => C.say(a.id, ['¡Cobramos! 🤑', 'Gracias jefe 💚', '¡Eso es puntualidad! 👏'][i]), i * 700));
      } catch (e) { toast(e.message, 'bad'); }
    };
    body.querySelector('[data-in]').onclick = () => dialog({ title: '➕ Inyectar capital', html: '<label class="f">Monto</label><input class="in" name="m" type="number" value="50000">', ok: 'Agregar',
      onOk: async (w) => { const m = Number(val(w, 'm')); if (!(m > 0)) throw new Error('Monto inválido');
        await C.store.set('office', 'main', { wallet: (C.S.office?.wallet || 0) + m }); await C.store.add('ledger', { type: 'ingreso', amount: m, note: 'Inyección de capital', at: Date.now(), by: C.S.me?.name || '' }); } });
  } });
}

// ============================ CELEBRAR ============================
export async function celebrate(C) {
  const r = await dialog({ title: '🎉 ¡A celebrar!', ok: '💃 ¡Que bailen todos!',
    html: `<label class="f">¿Qué celebramos?</label><input class="in" name="msg" placeholder="¡Llegamos a 100 ventas hoy!" maxlength="60">
      <label class="f">Duración</label><select class="in" name="min"><option value="1">1 minuto</option><option value="3" selected>3 minutos</option><option value="10">10 minutos</option></select>`,
    onOk: async (w) => {
      await C.store.set('office', 'main', { celebrateUntil: Date.now() + Number(val(w, 'min')) * 60000, celebrateMsg: val(w, 'msg') || '¡Celebrando en VivereShop!', celebrateBy: C.S.me?.name || '' });
    } });
  if (r) confetti(80);
}
export async function stopCelebrate(C) { await C.store.set('office', 'main', { celebrateUntil: 0 }); }

// ============================ AJUSTES ============================
export function settingsPanel(C) {
  openSheet({ title: 'Ajustes', sub: C.store.demo ? 'Modo demostración' : 'Conexiones y preferencias', icon: '⚙️', live: false, render(body) {
    const s = C.S.settings; const ceo = C.isCEO();
    const q = C.office.quality;
    body.innerHTML = `<form class="card" onsubmit="return false"><h4>🔌 Backend gratis (Google Apps Script)</h4>
        <div class="muted">Conecta tu Google Sheet de streaming y la IA gratis de Gemini. Sigue la GUÍA, paso 3.</div>
        <label class="f">URL de la aplicación web</label><input class="in" name="backendUrl" value="${esc(s.backendUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" ${ceo ? '' : 'disabled'}>
        <label class="f">Clave secreta (API_KEY)</label><input class="in" name="backendKey" value="${esc(s.backendKey || '')}" type="password" ${ceo ? '' : 'disabled'}>
        <label class="f">Avisar cuentas que vencen en (días)</label><input class="in" name="warnDays" type="number" min="1" max="15" value="${esc(s.warnDays || 3)}" ${ceo ? '' : 'disabled'}>
        ${ceo ? '<div class="btnrow" style="margin-top:12px"><button class="btn" data-save>💾 Guardar</button><button class="btn ghost" data-test>🧪 Probar conexión</button></div>' : '<div class="muted" style="margin-top:8px">Solo el CEO cambia las conexiones.</div>'}</form>
      <div class="card"><h4>🔔 Notificaciones</h4><div class="muted">Estado: ${webPermission() === 'granted' ? '✅ activadas' : '❌ desactivadas'}</div><button class="btn sm" style="margin-top:8px" data-perm>Activar notificaciones</button></div>
      <div class="card"><h4>🎮 Gráficos</h4><div class="muted">"Ligero" va más fluido en laptops sencillas y teléfonos viejos.</div>
        <div class="btnrow" style="margin-top:8px"><button class="btn ${q === 'alta' ? '' : 'ghost'} sm" data-q="alta">✨ Bonito</button><button class="btn ${q === 'baja' ? '' : 'ghost'} sm" data-q="baja">⚡ Ligero</button></div></div>
      <div class="card"><h4>💻 Instalar</h4><div class="muted">PC: abre la oficina en Chrome o Edge y toca el ícono "Instalar" en la barra de direcciones. Teléfono: instala el APK (GUÍA, paso 5).</div></div>
      ${C.store.demo ? '<button class="btn warn block" data-reset>♻️ Reiniciar demo</button>' : ''}
      <button class="btn ghost block" style="margin-top:8px" data-out>🚪 Cerrar sesión</button>`;
    body.querySelector('[data-save]')?.addEventListener('click', async () => {
      await C.store.set('settings', 'main', { backendUrl: val(body, 'backendUrl'), backendKey: val(body, 'backendKey'), warnDays: Number(val(body, 'warnDays') || 3) });
      toast('Guardado ✅'); setTimeout(() => { C.pollStreaming(true); api.syncGroups(C.S.groups); }, 500);
    });
    body.querySelector('[data-test]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { api.setSettings({ ...s, backendUrl: val(body, 'backendUrl'), backendKey: val(body, 'backendKey') }); const r = await api.getStreaming(); toast(`✅ Conectado. ${r.totals?.clientes ?? 0} clientes en el Sheet`); }
      catch (err) { toast(err.message, 'bad', 6000); }
      api.setSettings(C.S.settings); e.currentTarget.disabled = false;
    });
    body.querySelector('[data-perm]').onclick = async () => { await askWebPermission(); refreshSheet(); };
    body.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => C.office.setQuality(b.dataset.q));
    body.querySelector('[data-reset]')?.addEventListener('click', () => { try { localStorage.removeItem('viverehq-demo-v1'); } catch {} location.reload(); });
    body.querySelector('[data-out]').onclick = () => C.store.logout();
  } });
}
