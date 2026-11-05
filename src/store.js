// Capa de datos: Firebase (real) o almacenamiento local (modo demo).
// Las dos implementan la misma interfaz para que el resto de la app no cambie.
import { FIREBASE_CONFIG } from './config.js';

export const DEMO = (typeof __DEMO__ !== 'undefined' && __DEMO__) || !FIREBASE_CONFIG.apiKey;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ------------------------------------------------------------------
// MODO DEMO (localStorage)
// ------------------------------------------------------------------
function createLocalStore() {
  const KEY = 'viverehq-demo-v1';
  let db = {};
  try { db = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { db = {}; }
  const listeners = new Set();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    listeners.forEach((l) => l());
  };
  const col = (c) => (db[c] ||= {});
  let authCb = null;
  let user = null;
  try { user = JSON.parse(sessionStorage.getItem(KEY + '-user') || 'null'); } catch {}

  return {
    demo: true,
    onAuth(cb) { authCb = cb; setTimeout(() => cb(user), 0); },
    async login(email, pass) {
      if (!email || !pass) throw new Error('Escribe correo y contraseña');
      const members = Object.entries(col('members'));
      let m = members.find(([, v]) => v.email === email.toLowerCase());
      const id = m ? m[0] : 'ceo-demo';
      user = { uid: id, email: email.toLowerCase() };
      try { sessionStorage.setItem(KEY + '-user', JSON.stringify(user)); } catch {}
      authCb && authCb(user);
    },
    async logout() { user = null; try { sessionStorage.removeItem(KEY + '-user'); } catch {} authCb && authCb(null); },
    async resetPassword() { throw new Error('En modo demo no hay correos de recuperación.'); },
    async createMember(email, _pass, data) {
      const id = uid();
      col('members')[id] = { ...data, email: email.toLowerCase(), createdAt: Date.now() };
      save();
      return id;
    },
    watch(c, cb) {
      const fire = () => cb(Object.entries(col(c)).map(([id, v]) => ({ id, ...v })));
      listeners.add(fire); setTimeout(fire, 0);
      return () => listeners.delete(fire);
    },
    watchDoc(c, id, cb) {
      const fire = () => cb(col(c)[id] ? { id, ...col(c)[id] } : null);
      listeners.add(fire); setTimeout(fire, 0);
      return () => listeners.delete(fire);
    },
    async get(c, id) { return col(c)[id] ? { id, ...col(c)[id] } : null; },
    async add(c, data) { const id = uid(); col(c)[id] = { ...data }; save(); return id; },
    async set(c, id, data, merge = true) { col(c)[id] = merge ? { ...(col(c)[id] || {}), ...data } : { ...data }; save(); },
    async del(c, id) { delete col(c)[id]; save(); },
    async batchSet(items) { items.forEach(([c, id, d]) => { col(c)[id] = { ...(col(c)[id] || {}), ...d }; }); save(); }
  };
}

// ------------------------------------------------------------------
// FIREBASE (Auth + Firestore) — plan gratis Spark
// ------------------------------------------------------------------
async function createFirebaseStore() {
  const { initializeApp } = await import('firebase/app');
  const A = await import('firebase/auth');
  const F = await import('firebase/firestore');

  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
  const fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });

  const errEs = (e) => {
    const c = e?.code || '';
    const map = {
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/user-not-found': 'Ese correo no tiene cuenta.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
      'auth/email-already-in-use': 'Ese correo ya tiene cuenta.',
      'auth/weak-password': 'La contraseña debe tener mínimo 6 caracteres.',
      'auth/invalid-email': 'Correo no válido.',
      'auth/network-request-failed': 'Sin conexión a internet.',
      'permission-denied': 'No tienes permiso para esto.'
    };
    return new Error(map[c] || e?.message || 'Error');
  };
  const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { throw errEs(e); } };

  return {
    demo: false,
    onAuth(cb) { A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase() } : null)); },
    login: wrap((email, pass) => A.signInWithEmailAndPassword(auth, email.trim(), pass)),
    logout: wrap(() => A.signOut(auth)),
    resetPassword: wrap((email) => A.sendPasswordResetEmail(auth, email.trim())),
    // Crea la cuenta de una socia SIN cerrar tu sesión (usa una segunda instancia)
    createMember: wrap(async (email, pass, data) => {
      const second = initializeApp(FIREBASE_CONFIG, 'alta-' + Date.now());
      const a2 = A.getAuth(second);
      const cred = await A.createUserWithEmailAndPassword(a2, email.trim(), pass);
      await A.signOut(a2);
      await F.setDoc(F.doc(fs, 'members', cred.user.uid), { ...data, email: email.trim().toLowerCase(), createdAt: Date.now() });
      return cred.user.uid;
    }),
    watch(c, cb) {
      return F.onSnapshot(F.collection(fs, c), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn(c, e));
    },
    watchDoc(c, id, cb) {
      return F.onSnapshot(F.doc(fs, c, id), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), (e) => console.warn(c, e));
    },
    get: wrap(async (c, id) => { const d = await F.getDoc(F.doc(fs, c, id)); return d.exists() ? { id: d.id, ...d.data() } : null; }),
    add: wrap(async (c, data) => (await F.addDoc(F.collection(fs, c), data)).id),
    set: wrap((c, id, data, merge = true) => F.setDoc(F.doc(fs, c, id), data, { merge })),
    del: wrap((c, id) => F.deleteDoc(F.doc(fs, c, id))),
    batchSet: wrap(async (items) => {
      const b = F.writeBatch(fs);
      items.forEach(([c, id, d]) => b.set(F.doc(fs, c, id), d, { merge: true }));
      await b.commit();
    })
  };
}

export async function createStore() {
  return DEMO ? createLocalStore() : createFirebaseStore();
}
export { uid };
