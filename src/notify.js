// Recordatorios insistentes del coach de tareas
// - En el APK: notificaciones locales programadas (suenan aunque la app esté cerrada)
// - En PC / navegador: notificaciones + sonido mientras la oficina esté abierta
import { isNative, beep, vibrate } from './ui.js';
import { nagText, hash } from './agents.js';

const MAX_REPEATS = 24;
let LN = null;
async function ln() {
  if (!isNative()) return null;
  if (!LN) LN = (await import('@capacitor/local-notifications')).LocalNotifications;
  return LN;
}

export async function initNotifications() {
  const L = await ln();
  if (!L) return;
  try {
    await L.requestPermissions();
    await L.createChannel({ id: 'tareas', name: 'Recordatorios de tareas', importance: 5, vibration: true, visibility: 1 });
  } catch (e) { console.warn(e); }
}
export async function askWebPermission() {
  if (isNative()) return initNotifications();
  if (!('Notification' in window)) return 'no';
  return Notification.requestPermission();
}
export const webPermission = () => (isNative() ? 'granted' : ('Notification' in window ? Notification.permission : 'no'));

const nid = (taskId, k) => (hash(taskId) % 200000) * 100 + k + 1000;

export async function cancelTask(task) {
  const L = await ln(); if (!L) return;
  await L.cancel({ notifications: Array.from({ length: MAX_REPEATS }, (_, k) => ({ id: nid(task.id, k) })) }).catch(() => {});
}
export async function scheduleTask(task, owner = 'CEO', coach = 'Profe Tito') {
  const L = await ln(); if (!L) return;
  await cancelTask(task);
  if (task.done || !task.due) return;
  const every = Math.max(5, Number(task.nagMinutes || 30)) * 60000;
  const start = new Date(task.due).getTime();
  const now = Date.now();
  const list = [];
  for (let k = 0; k < MAX_REPEATS; k++) {
    const at = start + k * every;
    if (at <= now + 5000) continue;
    list.push({
      id: nid(task.id, k), channelId: 'tareas',
      title: `⏰ ${coach}`, body: nagText(owner, task.title, Math.floor(k / 3)),
      schedule: { at: new Date(at), allowWhileIdle: true }, extra: { taskId: task.id }
    });
  }
  if (list.length) await L.schedule({ notifications: list }).catch((e) => console.warn(e));
}
export async function resyncAll(tasks, owner, coach) {
  const L = await ln(); if (!L) return;
  try {
    const p = await L.getPending();
    if (p.notifications.length) await L.cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) });
    for (const t of tasks) await scheduleTask(t, owner, coach);
    // Resumen diario 8:00 a.m.
    const pending = tasks.filter((t) => !t.done).length;
    await L.schedule({ notifications: [{
      id: 1, channelId: 'tareas', title: `☀️ Buenos días ${owner}`,
      body: pending ? `Tienes ${pending} tarea(s) pendientes. ¡Entra a la oficina y vamos a romperla! 💪` : 'Agenda limpia. ¿Qué vamos a conquistar hoy? 🚀',
      schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true }
    }] });
  } catch (e) { console.warn(e); }
}

// ---- Motor dentro de la app (todas las plataformas) ----
const KEY = 'viverehq-nag';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export function nagTick(tasks, owner, coach, speak) {
  const now = Date.now(); const st = load(); let fired = null;
  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const due = new Date(t.due).getTime(); if (due > now) continue;
    const s = st[t.id] || { last: 0, n: 0 };
    const every = Math.max(5, Number(t.nagMinutes || 30)) * 60000;
    if (now - s.last < every) continue;
    s.last = now; s.n += 1; st[t.id] = s;
    const text = nagText(owner, t.title, Math.floor((s.n - 1) / 3));
    fired = { task: t, text };
    break; // uno a la vez para no saturar
  }
  save(st);
  if (fired) {
    speak?.(fired.text);
    beep(); vibrate();
    if (!isNative() && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(`⏰ ${coach}`, { body: fired.text, icon: 'icons/icon-192.png', tag: 'tarea-' + fired.task.id, renotify: true }); } catch {}
    }
  }
  return fired;
}
export function clearNag(taskId) { const st = load(); delete st[taskId]; save(st); }
