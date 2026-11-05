// Conexión con el backend gratis (Google Apps Script) y con VivereShop.
import { DEMO } from './store.js';
import { todayKey } from './agents.js';

let settings = {};
export const setSettings = (s) => { settings = s || {}; };

async function callBackend(action, payload = {}) {
  if (!settings.backendUrl) throw new Error('Falta conectar el backend (Ajustes ⚙️ > Backend).');
  const r = await fetch(settings.backendUrl, {
    method: 'POST',
    // text/plain evita el "preflight" CORS que Apps Script no soporta
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: settings.backendKey, action, ...payload })
  });
  let j;
  try { j = await r.json(); } catch { throw new Error('El backend no respondió bien. Revisa la URL de Apps Script.'); }
  if (!j.ok) throw new Error(j.error || 'Error del backend');
  return j.data;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Streaming ----------------
export async function getStreaming() {
  if (DEMO && !settings.backendUrl) { await wait(500); return demoStreaming(); }
  return callBackend('streaming', { warnDays: Number(settings.warnDays || 3) });
}

// ---------------- Secretaria ----------------
export async function getSecretaria(date = todayKey()) {
  if (DEMO && !settings.backendUrl) return null;
  return callBackend('getSecretaria', { date });
}
export async function generateSecretaria(groups, date = todayKey()) {
  if (DEMO && !settings.backendUrl) { await wait(1200); return demoSecretaria(groups, date); }
  return callBackend('secretaria', { groups, date, force: true });
}
export async function generateDinamicas(groups) {
  if (DEMO && !settings.backendUrl) { await wait(1200); return demoDinamicas(); }
  return callBackend('dinamicas', { groups, force: true });
}
export async function syncGroups(groups) {
  if (!settings.backendUrl) return;
  return callBackend('saveGroups', { groups }).catch(() => {});
}

// ---------------- Agentes IA contratados ----------------
export async function runAgent(agent) {
  if (DEMO && !settings.backendUrl) {
    await wait(1500);
    return `🤖 (Demo) Resultado de ${agent.name}:\n\n• Analicé tu instrucción: "${(agent.prompt || '').slice(0, 80)}"\n• Conecta el backend gratis en Ajustes para que trabaje de verdad con IA.`;
  }
  return callBackend('agent', { name: agent.name, prompt: agent.prompt || '' });
}

// ---------------- Monitores (ZapIA / URLs) ----------------
// Espera una URL que devuelva JSON con { count: n } (o un número)
export async function readMonitor(url, key) {
  if (!url) return null;
  const u = new URL(url);
  if (key) u.searchParams.set('key', key);
  const r = await fetch(u.toString(), { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (typeof j === 'number') return { count: j, items: [] };
  if (j && typeof j.count === 'number') return { count: j.count, items: j.users || j.items || [] };
  throw new Error('La URL no devolvió { count }');
}
export function demoPending() {
  const n = new Date().getMinutes() % 4;
  return { count: n, items: Array.from({ length: n }, (_, i) => ({ name: ['Carla M.', 'José R.', 'Ana P.', 'Luis D.'][i], email: 'demo' + i + '@mail.com', registered: new Date().toISOString() })) };
}

// ---------------- Datos de ejemplo (modo demo) ----------------
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function demoStreaming() {
  return {
    updatedAt: Date.now(),
    clientsExpiring: [
      { cliente: 'María López', telefono: '18095551234', servicio: 'Netflix', correo: 'netflix1@vivere.com', perfil: 'Perfil 2', vence: addDays(1), dias: 1 },
      { cliente: 'Pedro Gómez', telefono: '18295559876', servicio: 'Disney+', correo: 'disney@vivere.com', perfil: 'Perfil 4', vence: addDays(3), dias: 3 }
    ],
    clientsExpired: [
      { cliente: 'Rosa Díaz', telefono: '18495554321', servicio: 'Max', correo: 'max@vivere.com', perfil: 'Perfil 1', vence: addDays(-2), dias: -2 }
    ],
    profilesAvailable: [
      { servicio: 'Netflix', correo: 'netflix1@vivere.com', perfil: 'Perfil 5' },
      { servicio: 'Prime Video', correo: 'prime@vivere.com', perfil: 'Perfil 3' },
      { servicio: 'Spotify', correo: 'spoti@vivere.com', perfil: 'Miembro 6' }
    ],
    accountsExpiring: [{ servicio: 'Netflix', correo: 'netflix1@vivere.com', vence: addDays(2), dias: 2 }],
    accountsExpired: [],
    totals: { clientes: 48, cuentas: 12 }
  };
}
function demoSecretaria(groups, date) {
  const day = new Date().toLocaleDateString('es-DO', { weekday: 'long' });
  return {
    date,
    groups: groups.map((g) => ({
      id: g.id, name: g.name,
      messages: [
        { type: '☀️ Buenos días', text: `¡Buenos días, familia de ${g.name}! ☀️ Feliz ${day}. Hoy es un gran día para vender y crecer juntos en VivereShop 💚 ¿Quién está activo? Dejen un 🔥` },
        { type: '📢 Publicaciones', text: `📢 Recordatorio: suban sus publicaciones de hoy en estados y redes. Mándenme la captura aquí y los destaco 🙌` },
        { type: '🤔 Seguimiento', text: '¿Cómo les fue ayer con las ventas? Cuéntenme en una palabra cómo va su semana 👇' },
        { type: '❓ Dudas', text: '¿Alguna duda con los pedidos o con la plataforma? Escríbanla aquí, ninguna pregunta es tonta 💬' },
        { type: '📊 Encuesta', text: '📊 ENCUESTA: ¿Qué servicio les piden más esta semana?\n1️⃣ Netflix\n2️⃣ Disney+\n3️⃣ Spotify\n4️⃣ Otro\nRespondan con el número 👇' }
      ]
    }))
  };
}
function demoDinamicas() {
  return {
    week: todayKey(),
    items: [
      { day: 'Lunes', title: 'Reto 5 ventas', text: '🏆 Reto de la semana: el primero en hacer 5 ventas gana un perfil gratis por un mes.' },
      { day: 'Miércoles', title: 'Miércoles de captura', text: '📸 Suban captura de su mejor publicación. La que tenga más reacciones gana mención especial.' },
      { day: 'Viernes', title: 'Trivia streaming', text: '🎬 Trivia: adivinen la serie con 3 emojis. 🧪👨‍🦲💰 ¡El primero gana puntos Vivere!' },
      { day: 'Domingo', title: 'Ranking', text: '📈 Publicamos el ranking semanal de los más activos del grupo. ¡Aplausos a los top 3! 👏' }
    ]
  };
}
