// ============================================================
//  CONFIGURACIÓN (ver GUIA.md, paso 1)
// ============================================================
// Opción A (recomendada): guarda la configuración de Firebase como secreto
//   FIREBASE_CONFIG en GitHub y no toques este archivo.
// Opción B: pega aquí los datos de tu app web de Firebase.
const fromEnv = import.meta.env.VITE_FIREBASE_CONFIG;

export const FIREBASE_CONFIG = fromEnv ? JSON.parse(fromEnv) : {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// El correo del CEO NO va aquí: va solo en las reglas de Firestore
// (firestore.rules), que es donde de verdad se protege la oficina.

// Nombre que se ve arriba
export const COMPANY = 'VivereShop';
