/**
 * ================================================================
 *  VIVERESHOP OFICINA — Backend 100% gratis en Google Apps Script
 *  - Lee tu Google Sheet de streaming (agente Neto)
 *  - Escribe los mensajes diarios y dinámicas con IA gratis de Gemini (agente Clau)
 *  - Ejecuta los agentes IA que contrates
 *  - Cada mañana prepara todo solo y te manda un resumen por correo
 *
 *  INSTALACIÓN: ver GUIA.md, paso 3. Resumen:
 *   1) Llena CONFIG aquí abajo.
 *   2) Ejecuta la función  setup  (una vez) y autoriza.
 *   3) Implementar > Nueva implementación > Aplicación web
 *      (Ejecutar como: Yo · Acceso: Cualquier usuario).
 *   4) Copia la URL y la API_KEY (sale en el registro) en Ajustes ⚙️ de la oficina.
 * ================================================================
 */
const CONFIG = {
  // Clave gratis de https://aistudio.google.com/apikey
  GEMINI_API_KEY: '',
  // Modelo gratis. Si Google lo cambia, prueba otro de AI Studio.
  GEMINI_MODEL: 'gemini-2.5-flash',

  // ID de tu Google Sheet de streaming (lo que va entre /d/ y /edit en el enlace)
  STREAMING_SHEET_ID: '',
  // Pestaña donde están los clientes / perfiles
  TAB_CLIENTES: 'Clientes',
  // Pestaña con TUS cuentas madre (opcional; si no existe se ignora)
  TAB_CUENTAS: 'Cuentas',
  // Solo mostrar vencidos de los últimos X días (para no llenar la lista con clientes viejos)
  DIAS_VENCIDOS_MAX: 15,

  // Resumen diario por correo (6 a.m.) con las alertas de streaming
  EMAIL_RESUMEN: true,
  NEGOCIO: 'VivereShop',
  PAIS: 'República Dominicana'
};

// Nombres de columna que se reconocen (no importan mayúsculas ni tildes)
const COLS = {
  cliente: ['cliente', 'nombre', 'nombre cliente', 'usuario cliente', 'comprador'],
  telefono: ['telefono', 'whatsapp', 'celular', 'numero', 'tel', 'contacto'],
  servicio: ['servicio', 'plataforma', 'app', 'producto'],
  correo: ['correo', 'cuenta', 'email', 'correo cuenta', 'usuario'],
  perfil: ['perfil', 'pantalla', 'pin perfil', 'nombre perfil'],
  vence: ['vence', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento', 'fecha fin', 'corte', 'fecha corte', 'expira'],
  estado: ['estado', 'status', 'disponibilidad']
};

// ------------------------------------------------------------------
const PROPS = PropertiesService.getScriptProperties();
const TZ = Session.getScriptTimeZone() || 'America/Santo_Domingo';

function doGet() { return out_({ ok: true, data: { msg: 'VivereShop Oficina backend activo ✅' } }); }

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!b.key || b.key !== PROPS.getProperty('API_KEY')) return out_({ ok: false, error: 'Clave del backend incorrecta.' });
    switch (b.action) {
      case 'ping': return out_({ ok: true, data: 'pong' });
      case 'streaming': return out_({ ok: true, data: streaming_(Number(b.warnDays) || 3) });
      case 'getSecretaria': return out_({ ok: true, data: getSecretaria_(b.date) });
      case 'secretaria': return out_({ ok: true, data: generarMensajes_(guardarGrupos_(b.groups), b.date || hoy_()) });
      case 'dinamicas': return out_({ ok: true, data: generarDinamicas_(guardarGrupos_(b.groups)) });
      case 'saveGroups': guardarGrupos_(b.groups); return out_({ ok: true, data: true });
      case 'agent': return out_({ ok: true, data: agente_(b.name, b.prompt) });
      default: return out_({ ok: false, error: 'Acción desconocida: ' + b.action });
    }
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ================================================================ SETUP
function setup() {
  if (!PROPS.getProperty('API_KEY')) PROPS.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, ''));
  datos_(); // crea la hoja de caché
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'tareaDiaria') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tareaDiaria').timeBased().everyDays(1).atHour(6).nearMinute(0).create();
  Logger.log('✅ Listo. Copia esta API_KEY en Ajustes ⚙️ de la oficina:\n\n' + PROPS.getProperty('API_KEY'));
  Logger.log('Zona horaria del script: ' + TZ + ' (debe ser America/Santo_Domingo)');
  if (!CONFIG.GEMINI_API_KEY) Logger.log('⚠️ Falta GEMINI_API_KEY en CONFIG.');
  if (!CONFIG.STREAMING_SHEET_ID) Logger.log('⚠️ Falta STREAMING_SHEET_ID en CONFIG.');
}

/** Corre solo cada día ~6 a.m.: mensajes, dinámicas (lunes) y resumen por correo */
function tareaDiaria() {
  const grupos = gruposGuardados_();
  try { generarMensajes_(grupos, hoy_()); } catch (e) { console.error('Mensajes: ' + e); }
  try { if (!leerCache_('sem-' + semana_())) generarDinamicas_(grupos); } catch (e) { console.error('Dinámicas: ' + e); }
  if (CONFIG.EMAIL_RESUMEN && CONFIG.STREAMING_SHEET_ID) {
    try { enviarResumen_(streaming_(3)); } catch (e) { console.error('Resumen: ' + e); }
  }
}

/** Para probar desde el editor */
function probarTodo() {
  Logger.log(JSON.stringify(streaming_(3), null, 2).slice(0, 3000));
  Logger.log(agente_('Prueba', 'Saluda en una línea al equipo de VivereShop.'));
}

// ================================================================ STREAMING
function streaming_(warnDays) {
  if (!CONFIG.STREAMING_SHEET_ID) throw new Error('Falta STREAMING_SHEET_ID en el backend.');
  const ss = SpreadsheetApp.openById(CONFIG.STREAMING_SHEET_ID);
  const today = inicioDia_(new Date());
  const res = { updatedAt: Date.now(), clientsExpiring: [], clientsExpired: [], profilesAvailable: [], accountsExpiring: [], accountsExpired: [], totals: { clientes: 0, cuentas: 0 } };

  const shC = ss.getSheetByName(CONFIG.TAB_CLIENTES) || ss.getSheets()[0];
  leerFilas_(shC).forEach((r) => {
    const libre = !r.cliente || /disponible|libre|vac[ií]/i.test(r.estado || '');
    if (libre) { if (r.servicio || r.correo) res.profilesAvailable.push(limpio_(r)); return; }
    res.totals.clientes++;
    if (!r._vence) return;
    const dias = Math.round((inicioDia_(r._vence) - today) / 864e5);
    const item = Object.assign(limpio_(r), { dias: dias });
    if (dias < 0 && dias >= -CONFIG.DIAS_VENCIDOS_MAX) res.clientsExpired.push(item);
    else if (dias >= 0 && dias <= warnDays) res.clientsExpiring.push(item);
  });

  const shA = ss.getSheetByName(CONFIG.TAB_CUENTAS);
  if (shA) {
    leerFilas_(shA).forEach((r) => {
      if (!r._vence) return;
      res.totals.cuentas++;
      const dias = Math.round((inicioDia_(r._vence) - today) / 864e5);
      const item = { servicio: r.servicio || '', correo: r.correo || '', vence: fmt_(r._vence), dias: dias };
      if (dias < 0 && dias >= -CONFIG.DIAS_VENCIDOS_MAX) res.accountsExpired.push(item);
      else if (dias >= 0 && dias <= warnDays) res.accountsExpiring.push(item);
    });
  }
  const byDias = (a, b) => a.dias - b.dias;
  res.clientsExpiring.sort(byDias); res.clientsExpired.sort((a, b) => b.dias - a.dias); res.accountsExpiring.sort(byDias);
  res.profilesAvailable = res.profilesAvailable.slice(0, 200);
  return res;
}

function leerFilas_(sh) {
  const v = sh.getDataRange().getValues();
  let hi = v.findIndex((row) => row.filter((c) => String(c).trim()).length >= 2);
  if (hi < 0) return [];
  const head = v[hi].map(norm_);
  const idx = {};
  Object.keys(COLS).forEach((k) => {
    let i = head.findIndex((h) => COLS[k].indexOf(h) >= 0);
    if (i < 0) i = head.findIndex((h) => h && COLS[k].some((a) => h.indexOf(a) >= 0));
    idx[k] = i;
  });
  return v.slice(hi + 1).filter((row) => row.some((c) => String(c).trim())).map((row) => {
    const o = {};
    Object.keys(idx).forEach((k) => { o[k] = idx[k] >= 0 ? row[idx[k]] : ''; });
    o._vence = fecha_(o.vence);
    ['cliente', 'telefono', 'servicio', 'correo', 'perfil', 'estado'].forEach((k) => { o[k] = String(o[k] == null ? '' : o[k]).trim(); });
    o.telefono = o.telefono.replace(/\D/g, '');
    if (o.telefono.length === 10) o.telefono = '1' + o.telefono; // números de RD
    return o;
  });
}
function limpio_(r) { return { cliente: r.cliente, telefono: r.telefono, servicio: r.servicio, correo: r.correo, perfil: r.perfil, vence: r._vence ? fmt_(r._vence) : '' }; }
function norm_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function fecha_(x) {
  if (!x) return null;
  if (Object.prototype.toString.call(x) === '[object Date]') return isNaN(x) ? null : x;
  const s = String(x).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // dd/mm/aaaa
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function inicioDia_(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function fmt_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function hoy_() { return fmt_(new Date()); }
function semana_() { const d = new Date(); const dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); return fmt_(d); }

function enviarResumen_(r) {
  const n = r.clientsExpiring.length + r.clientsExpired.length + r.accountsExpiring.length + r.accountsExpired.length;
  const lista = (arr, t) => arr.length ? '<h3>' + t + '</h3><ul>' + arr.map((c) => '<li><b>' + (c.cliente || c.servicio) + '</b> · ' + (c.servicio || '') + ' ' + (c.perfil || '') + ' · ' + c.vence + '</li>').join('') + '</ul>' : '';
  const html = '<div style="font-family:Arial;max-width:560px"><h2 style="color:#16a34a">📺 Resumen de streaming — ' + hoy_() + '</h2>' +
    '<p>Perfiles disponibles: <b>' + r.profilesAvailable.length + '</b></p>' +
    lista(r.clientsExpiring, '⏳ Clientes por vencer') + lista(r.clientsExpired, '❌ Clientes vencidos') +
    lista(r.accountsExpiring.concat(r.accountsExpired), '🏦 Tus cuentas por vencer') + '<p style="color:#666">— Neto, tu agente de streaming en la oficina de VivereShop</p></div>';
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: (n ? '⚠️ ' + n + ' alerta(s)' : '✅ Todo al día') + ' · Streaming VivereShop', htmlBody: html });
}

// ================================================================ SECRETARIA
const GRUPOS_DEFAULT = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: 'grupo-' + i, name: 'Grupo ' + i, topic: 'Revendedores de VivereShop', tone: 'motivador y cercano' }));
function guardarGrupos_(groups) {
  if (Array.isArray(groups) && groups.length) {
    const slim = groups.map((g) => ({ id: g.id, name: String(g.name || '').slice(0, 60), topic: String(g.topic || '').slice(0, 160), tone: String(g.tone || '').slice(0, 60) }));
    PROPS.setProperty('GROUPS', JSON.stringify(slim));
    return slim;
  }
  return gruposGuardados_();
}
function gruposGuardados_() { try { return JSON.parse(PROPS.getProperty('GROUPS')) || GRUPOS_DEFAULT; } catch (e) { return GRUPOS_DEFAULT; } }

function getSecretaria_(date) {
  return { today: leerCache_('dia-' + (date || hoy_())), dinamicas: leerCache_('sem-' + semana_()), week: semana_() };
}

function generarMensajes_(groups, date) {
  const d = new Date();
  const temas = ['constancia', 'servicio al cliente', 'redes sociales', 'metas de la semana', 'trabajo en equipo', 'cerrar ventas', 'confianza', 'creatividad en estados de WhatsApp'];
  const tema = temas[d.getDate() % temas.length];
  const prompt =
    'Eres Clau, la secretaria y community manager de ' + CONFIG.NEGOCIO + ', un marketplace de ' + CONFIG.PAIS +
    ' que vende cuentas de streaming (Netflix, Disney+, Max, Prime, Spotify...) y productos digitales mediante revendedores.\n' +
    'Hoy es ' + diaSemanaEs_(d) + ' ' + date + '. Tema motivacional del día: ' + tema + '.\n' +
    'Escribe mensajes de WhatsApp LISTOS PARA COPIAR para cada grupo. Español dominicano natural, cálido, con emojis (sin exagerar), ' +
    'frases cortas, puedes usar *negritas* de WhatsApp. No inventes precios, premios ni promociones concretas.\n' +
    'Para CADA grupo crea exactamente 5 mensajes con estos tipos:\n' +
    '1) "☀️ Buenos días": saludo con energía y motivación del día.\n' +
    '2) "📢 Publicaciones": pedirles que suban/envíen sus publicaciones y estados de hoy.\n' +
    '3) "🤔 Seguimiento": pregunta abierta sobre cómo va su trabajo/ventas.\n' +
    '4) "❓ Dudas": invitarlos a escribir sus dudas sobre pedidos o la plataforma.\n' +
    '5) "📊 Encuesta": una encuesta con 3 o 4 opciones numeradas con emojis (1️⃣ 2️⃣ 3️⃣ 4️⃣).\n' +
    'Adapta cada grupo a su tema y tono, y que los mensajes NO se repitan entre grupos.\n' +
    'Grupos: ' + JSON.stringify(groups) + '\n' +
    'Responde SOLO JSON válido con esta forma: {"groups":[{"id":"...","name":"...","messages":[{"type":"☀️ Buenos días","text":"..."}]}]}';
  const out = gemini_(prompt, true);
  const byId = {}; (out.groups || []).forEach((g) => { byId[g.id] = g; });
  const result = { date: date, groups: groups.map((g, i) => ({ id: g.id, name: g.name, messages: ((byId[g.id] || (out.groups || [])[i] || {}).messages || []).slice(0, 6) })) };
  guardarCache_('dia-' + date, result);
  return result;
}

function generarDinamicas_(groups) {
  const prompt =
    'Eres la community manager de ' + CONFIG.NEGOCIO + ' (' + CONFIG.PAIS + '), marketplace de cuentas de streaming con revendedores en grupos de WhatsApp.\n' +
    'Crea un plan de 5 dinámicas para ESTA SEMANA (lunes a domingo) para mantener los grupos activos, entretenidos, trabajando y motivados: ' +
    'retos de ventas, trivias de series/películas, concursos de publicaciones, encuestas divertidas, reconocimientos, juegos rápidos.\n' +
    'Cada una con el mensaje listo para pegar en WhatsApp (español dominicano, emojis, *negritas*). Premios simbólicos o "Puntos Vivere", sin dinero inventado.\n' +
    'Grupos (para inspirarte): ' + JSON.stringify(groups.map((g) => g.name + ' — ' + g.topic)) + '\n' +
    'Responde SOLO JSON: {"items":[{"day":"Lunes","title":"...","text":"..."}]}';
  const out = gemini_(prompt, true);
  const result = { week: semana_(), items: (out.items || []).slice(0, 7) };
  guardarCache_('sem-' + semana_(), result);
  return result;
}

// ================================================================ AGENTES CONTRATADOS
function agente_(name, prompt) {
  if (!prompt) throw new Error('Este agente no tiene instrucciones.');
  const p = 'Eres ' + (name || 'un agente') + ', trabajador virtual de ' + CONFIG.NEGOCIO + ' (' + CONFIG.PAIS + '), marketplace de cuentas de streaming y productos digitales con revendedores.\n' +
    'Fecha: ' + diaSemanaEs_(new Date()) + ' ' + hoy_() + '.\nResponde en español, listo para usar, claro y ordenado (formato de WhatsApp: *negritas*, viñetas con emojis).\n\nTAREA:\n' + prompt;
  return gemini_(p, false);
}

// ================================================================ GEMINI (gratis)
function gemini_(prompt, json) {
  const key = CONFIG.GEMINI_API_KEY || PROPS.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Falta la GEMINI_API_KEY en el backend (Code.gs > CONFIG).');
  const models = [CONFIG.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr = '';
  for (let i = 0; i < models.length; i++) {
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95 } };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body), muteHttpExceptions: true
    });
    const code = r.getResponseCode();
    if (code === 200) {
      const j = JSON.parse(r.getContentText());
      const text = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('').trim();
      if (!json) return text;
      try { return JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()); }
      catch (e) { lastErr = 'La IA respondió en un formato raro, intenta otra vez.'; continue; }
    }
    lastErr = 'Gemini ' + code + ': ' + r.getContentText().slice(0, 200);
    if (code === 429) Utilities.sleep(4000);
    if ([404, 429, 500, 503].indexOf(code) < 0) break;
  }
  throw new Error(lastErr);
}

// ================================================================ CACHÉ (hoja de cálculo propia)
function datos_() {
  let id = PROPS.getProperty('DATA_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { id = null; } }
  const ss = SpreadsheetApp.create('VivereShop Oficina – Datos del backend');
  ss.getSheets()[0].setName('Cache').appendRow(['clave', 'json', 'actualizado']);
  PROPS.setProperty('DATA_SHEET_ID', ss.getId());
  return ss;
}
function hojaCache_() { return datos_().getSheetByName('Cache'); }
function leerCache_(k) {
  const sh = hojaCache_(); const v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i > 0; i--) if (v[i][0] === k) { try { return JSON.parse(v[i][1]); } catch (e) { return null; } }
  return null;
}
function guardarCache_(k, obj) {
  const sh = hojaCache_(); const v = sh.getDataRange().getValues();
  const txt = JSON.stringify(obj);
  for (let i = 1; i < v.length; i++) if (v[i][0] === k) { sh.getRange(i + 1, 2, 1, 2).setValues([[txt, new Date()]]); return; }
  sh.appendRow([k, txt, new Date()]);
  if (sh.getLastRow() > 400) sh.deleteRows(2, 100); // limpieza
}
function diaSemanaEs_(d) { return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]; }
