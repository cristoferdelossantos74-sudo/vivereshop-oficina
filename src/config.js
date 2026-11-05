// ============================================================
//  CONFIGURACIÓN (ver GUIA.md, paso 1)
// ============================================================
// Opción A (recomendada): guarda la configuración de Firebase como secreto
//   FIREBASE_CONFIG en GitHub y no toques este archivo.
//   Acepta el JSON en una línea o el bloque tal cual lo copia Firebase
//   (const firebaseConfig = { apiKey: "...", ... }).
// Opción B: pega aquí los datos de tu app web de Firebase.
const MANUAL = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

const KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

// Lee la configuración aunque venga en formato JSON o como código de Firebase
function parseConfig(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  try { const j = JSON.parse(txt); if (j && j.apiKey) return j; } catch {}
  const out = {};
  for (const k of KEYS) {
    const m = txt.match(new RegExp(`["']?${k}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
    if (m) out[k] = m[1].trim();
  }
  return out.apiKey ? out : null;
}

const fromEnv = import.meta.env.VITE_FIREBASE_CONFIG;
const parsed = parseConfig(fromEnv);

// Si el secreto existe pero no se pudo leer, se muestra un aviso en vez de una página en blanco
export const CONFIG_ERROR = fromEnv && !parsed
  ? 'No pude leer el secreto FIREBASE_CONFIG de GitHub. Cópialo otra vez desde Firebase (Configuración del proyecto > Tus apps) y vuelve a correr "Run workflow".'
  : '';

export const FIREBASE_CONFIG = parsed || MANUAL;

// El correo del CEO NO va aquí: va solo en las reglas de Firestore
// (firestore.rules), que es donde de verdad se protege la oficina.

// Nombre que se ve arriba
export const COMPANY = 'VivereShop';
