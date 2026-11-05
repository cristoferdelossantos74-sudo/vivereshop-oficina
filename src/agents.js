// Roles, datos iniciales y "cerebro" de estados de los agentes
export const ROLES = {
  zapia: { label: 'Aprobador de usuarios (ZapIA)', icon: '✅', screen: 'Aprobando usuarios' },
  secretaria: { label: 'Secretaria de grupos WhatsApp', icon: '💬', screen: 'Mensajes del día' },
  streaming: { label: 'Encargado de Streaming', icon: '📺', screen: 'Cuentas y perfiles' },
  tareas: { label: 'Coach de tareas', icon: '⏰', screen: 'Tus pendientes' },
  custom: { label: 'Agente IA personalizado', icon: '🤖', screen: 'Trabajando' },
  monitor: { label: 'Vigilante (monitor de URL)', icon: '📡', screen: 'Vigilando' },
  atajo: { label: 'Atajo a otra app', icon: '🔗', screen: 'En línea' }
};

export const STATE_INFO = {
  work: { emoji: '💻', text: 'Trabajando' },
  coffee: { emoji: '☕', text: 'Tomando café' },
  rest: { emoji: '🛋️', text: 'Descansando' },
  dance: { emoji: '💃', text: '¡Celebrando!' },
  off: { emoji: '🌙', text: 'Fuera de horario' }
};

// ---------- Apariencia de los avatares ----------
export const AVATAR = {
  skins: ['#ffe0bd', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'],
  hairs: ['#1a0f0a', '#3b2314', '#6b4226', '#a0522d', '#d4a54a', '#b91c1c', '#7c3aed', '#db2777'],
  styles: {
    f: [['largo', 'Largo suelto'], ['cola', 'Cola de caballo'], ['mono', 'Moño'], ['rizos', 'Rizos']],
    m: [['corto', 'Corto'], ['tupe', 'Tupé'], ['rapado', 'Rapado'], ['afro', 'Afro']]
  }
};
export function avatarOf(e = {}, kind = 'agent') {
  const h = hash(e.id || e.name || 'x');
  const gender = e.gender || (kind === 'member' ? (e.role === 'ceo' ? 'm' : 'f') : (e.role === 'secretaria' ? 'f' : (h % 2 ? 'f' : 'm')));
  const styles = AVATAR.styles[gender].map((x) => x[0]);
  return {
    gender,
    hairStyle: styles.includes(e.hairStyle) ? e.hairStyle : styles[h % styles.length],
    hairColor: e.hairColor || AVATAR.hairs[h % 4],
    skin: e.skin || AVATAR.skins[(h >> 3) % AVATAR.skins.length],
    suit: kind === 'member' && e.role === 'ceo'
  };
}

export const PALETTE = ['#16a34a', '#0ea5e9', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#64748b', '#84cc16'];

const now = () => Date.now();

export function seedData(ceoName = 'Javi') {
  const agents = {
    'ag-zapia': {
      name: 'Zapi', role: 'zapia', color: '#16a34a', gender: 'm', hairStyle: 'tupe', hairColor: '#1a0f0a', skin: '#c68642', desk: 0, salary: 8000, lastPaidAt: now(), hiredAt: now(),
      chatLink: 'https://play.google.com/store/search?q=zapia&c=apps', appPackage: '',
      monitorUrl: '', monitorKey: '', pendingLink: 'https://vivereshop.com/wp-admin/users.php',
      breakFrom: '', breakTo: '', workFrom: '00:00', workTo: '23:59'
    },
    'ag-secretaria': {
      name: 'Clau', role: 'secretaria', color: '#ec4899', gender: 'f', hairStyle: 'largo', hairColor: '#3b2314', skin: '#e0ac69', desk: 1, salary: 9000, lastPaidAt: now(), hiredAt: now(),
      breakFrom: '13:00', breakTo: '13:30', workFrom: '06:00', workTo: '22:00'
    },
    'ag-streaming': {
      name: 'Neto', role: 'streaming', color: '#ef4444', gender: 'm', hairStyle: 'corto', hairColor: '#1a0f0a', skin: '#8d5524', desk: 2, salary: 8500, lastPaidAt: now(), hiredAt: now(),
      sheetLink: '', breakFrom: '', breakTo: '', workFrom: '07:00', workTo: '23:00'
    },
    'ag-tareas': {
      name: 'Profe Tito', role: 'tareas', color: '#f59e0b', gender: 'm', hairStyle: 'rapado', hairColor: '#6b4226', skin: '#f1c27d', desk: 3, salary: 7500, lastPaidAt: now(), hiredAt: now(),
      breakFrom: '', breakTo: '', workFrom: '06:00', workTo: '23:30'
    }
  };
  const areaList = [
    ['🏠', 'Inicio VivereShop', '#16a34a', [['Página principal', 'https://vivereshop.com/'], ['Panel', 'https://vivereshop.com/panel/']]],
    ['⚙️', 'Administración WP', '#0f172a', [['Escritorio', 'https://vivereshop.com/wp-admin/'], ['Code Snippets', 'https://vivereshop.com/wp-admin/admin.php?page=snippets']]],
    ['🛒', 'Pedidos', '#0ea5e9', [['Pedidos WooCommerce', 'https://vivereshop.com/wp-admin/admin.php?page=wc-orders']]],
    ['🏪', 'Vendedores (Dokan)', '#8b5cf6', [['Lista de vendedores', 'https://vivereshop.com/wp-admin/admin.php?page=dokan#/vendors']]],
    ['👥', 'Usuarios', '#f59e0b', [['Todos los usuarios', 'https://vivereshop.com/wp-admin/users.php']]],
    ['📦', 'Productos', '#ef4444', [['Productos', 'https://vivereshop.com/wp-admin/edit.php?post_type=product']]],
    ['🎓', 'Capacitación', '#14b8a6', [['Página de capacitación', 'https://vivereshop.com/capacitacion/']]]
  ];
  const areas = {};
  areaList.forEach(([emoji, name, color, links], i) => {
    areas['area-' + i] = { emoji, name, color, order: i, links: links.map(([label, url]) => ({ label, url })) };
  });
  const groups = {};
  for (let i = 1; i <= 8; i++) {
    groups['grupo-' + i] = { name: 'Grupo ' + i, topic: 'Revendedores de VivereShop', tone: 'motivador y cercano', link: '', order: i };
  }
  return {
    agents, areas, groups,
    office: { main: { wallet: 250000, celebrateUntil: 0, celebrateMsg: '', createdBy: ceoName } },
    settings: { main: { backendUrl: '', backendKey: '', warnDays: 3, currency: 'RD$' } }
  };
}

// ---------- utilidades de horario ----------
const toMin = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
export function inWindow(from, to, d = new Date()) {
  const a = toMin(from), b = toMin(to);
  if (a == null || b == null || a === b) return false;
  const t = d.getHours() * 60 + d.getMinutes();
  return a < b ? t >= a && t < b : t >= a || t < b;
}
export const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

// Ánimo: 100 al cobrar, baja ~12 puntos por día sin pago
export function moodOf(agent) {
  const days = (now() - (agent.lastPaidAt || 0)) / 864e5;
  return Math.max(0, Math.min(100, Math.round(100 - days * 12 + (agent.bonusBoost || 0))));
}
export const moodEmoji = (m) => (m >= 75 ? '😄' : m >= 50 ? '🙂' : m >= 25 ? '😐' : '😤');

/**
 * Carga de trabajo de cada agente (cuántas cosas tiene pendientes).
 * ctx = { pending: número de ZapIA, streaming: reporte, tasks: [], secretaria: doc de hoy }
 */
export function workloadOf(agent, ctx) {
  switch (agent.role) {
    case 'zapia': return ctx.pending == null ? null : ctx.pending;
    case 'secretaria': return ctx.secretaria ? 0 : (new Date().getHours() >= 6 ? 1 : 0);
    case 'streaming': {
      const r = ctx.streaming; if (!r) return null;
      return (r.clientsExpiring?.length || 0) + (r.clientsExpired?.length || 0) + (r.accountsExpiring?.length || 0) + (r.accountsExpired?.length || 0);
    }
    case 'tareas': {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      return (ctx.tasks || []).filter((t) => !t.done && t.due && new Date(t.due) <= end).length;
    }
    case 'monitor': return ctx.monitors?.[agent.id] ?? null;
    case 'custom': {
      if (ctx.running?.has(agent.id)) return 1;
      if (agent.frequency === 'daily' && agent.lastRunDay !== todayKey()) return 1;
      return 0;
    }
    default: return 0;
  }
}

/** Estado visual: work | coffee | rest | dance | off */
export function stateOf(agent, ctx, office) {
  const t = now();
  if (office?.celebrateUntil > t) return 'dance';
  if (agent.forcedState && agent.forcedUntil > t) return agent.forcedState;
  if (agent.workFrom && agent.workTo && !inWindow(agent.workFrom, agent.workTo)) return 'off';
  if (inWindow(agent.breakFrom, agent.breakTo)) return 'coffee';
  const load = workloadOf(agent, ctx);
  if (load == null) {
    // Sin datos conectados: trabaja en horario normal y hace pausas cada hora
    return new Date().getMinutes() < 48 ? 'work' : (hash(agent.id) % 2 ? 'coffee' : 'rest');
  }
  if (load > 0) return 'work';
  return hash(agent.id + new Date().getHours()) % 2 ? 'coffee' : 'rest';
}

export function hash(s = '') { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

// ---------- Frases del coach de tareas (suben de intensidad) ----------
export const NAG = [
  ['¡Dale {n}, que tú puedes! 💪 Te toca: "{t}"', 'Un pasito a la vez. Empieza con "{t}" y ya 🙌', 'Hoy se gana. "{t}" te está esperando 🔥'],
  ['Oye {n}... "{t}" sigue ahí 👀', 'No me hagas volver... "{t}" 😅', 'Los CEOs terminan lo que empiezan: "{t}" 😎'],
  ['{n}, ¡ya va siendo hora! "{t}" 😤', 'Sigo aquí y voy a seguir aquí hasta que hagas "{t}" ⏰', 'Diez minutitos nada más para "{t}". ¡Ya! 🏃'],
  ['🚨 {n}, MODO INSISTENTE ACTIVADO: "{t}" 🚨', 'Yo no me canso. "{t}". Hazla y te dejo tranquilo 😈', 'Tus socias cuentan contigo. "{t}" ¡AHORA! 📣']
];
export function nagText(name, title, level) {
  const pool = NAG[Math.min(level, NAG.length - 1)];
  return pool[Math.floor(Math.random() * pool.length)].replaceAll('{n}', name).replaceAll('{t}', title);
}
export const PRAISE = ['¡Esooo! Tarea completada 🎉', '¡Qué máquina! Una menos ✅', 'Así es que se hace 💚', '¡Dímelo CEO! Hecho 🔥'];
