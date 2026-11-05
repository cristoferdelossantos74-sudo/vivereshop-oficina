# 🏢 VivereShop Oficina — Guía de instalación (todo gratis)

Tu oficina virtual 3D con agentes trabajando. Funciona en **PC (Windows)**, en el **navegador del teléfono** y como **APK de Android**. Todo corre en servicios gratuitos:

| Pieza | Para qué | Costo |
|---|---|---|
| **Firebase** (plan Spark) | Login con correo y contraseña + base de datos en tiempo real | Gratis |
| **GitHub** | Construye el APK solo y publica la oficina en internet | Gratis |
| **Google Apps Script** | Lee tu Google Sheet, escribe mensajes con IA, resumen diario por correo | Gratis |
| **Gemini (Google AI Studio)** | La IA de la secretaria y de los agentes que contrates | Gratis (con límite diario) |
| **Code Snippets** | Le dice a Zapi cuántos usuarios esperan aprobación | Ya lo tienes |

Tiempo total: ~40 minutos la primera vez. Hazlo desde la PC.

---

## Paso 1 · Firebase (login y base de datos)

1. Entra a **console.firebase.google.com** → **Agregar proyecto** → nombre `vivereshop-oficina` → puedes desactivar Analytics → Crear.
2. **Authentication** → Comenzar → **Correo electrónico/contraseña** → Habilitar → Guardar.
3. **Authentication → Usuarios → Agregar usuario**: pon **tu correo de CEO** y tu contraseña.
4. **Firestore Database** → Crear base de datos → modo **producción** → ubicación `nam5` (o la más cercana) → Crear.
5. **Firestore → Reglas**: borra lo que hay, pega el contenido del archivo **`firestore.rules`**, cambia `TU_CORREO@gmail.com` por **tu correo** (en minúsculas) → **Publicar**.
   > Esto es la seguridad real: solo tú y las socias que tú crees pueden ver o tocar algo.
6. **Configuración del proyecto (⚙️) → Tus apps → Web `</>`** → nombre `oficina` → Registrar. Te sale algo así:
   ```js
   const firebaseConfig = { apiKey: "AIza...", authDomain: "vivereshop-oficina.firebaseapp.com", projectId: "vivereshop-oficina", ... };
   ```
   Guárdalo; lo usas en el paso 2 escrito **así, con comillas en cada nombre** (formato JSON):
   ```json
   {"apiKey":"AIza...","authDomain":"vivereshop-oficina.firebaseapp.com","projectId":"vivereshop-oficina","storageBucket":"vivereshop-oficina.firebasestorage.app","messagingSenderId":"123456","appId":"1:123456:web:abc"}
   ```

## Paso 2 · GitHub (publicar la oficina y crear el APK)

1. Crea una cuenta en **github.com** (si no tienes).
2. **New repository** → nombre `vivereshop-oficina` → **Public** → Create.
3. Toca **uploading an existing file** y arrastra **todo el contenido** de la carpeta `oficina-virtual` (incluida la carpeta `.github`). → **Commit changes**.
   > Si Windows no te deja ver `.github`, en el Explorador activa *Ver → Elementos ocultos*.
4. **Settings → Secrets and variables → Actions → New repository secret**
   - Nombre: `FIREBASE_CONFIG`
   - Valor: el JSON del paso 1.6 (todo en una línea, con comillas).
5. **Settings → Pages → Source: GitHub Actions**.
6. Ve a la pestaña **Actions** → *Construir APK y publicar la oficina* → **Run workflow**. Tarda ~6 minutos.
7. Cuando termine (✅ verde):
   - La oficina queda en: **`https://TU-USUARIO.github.io/vivereshop-oficina/`**
   - El APK queda en: **Releases** (columna derecha del repositorio) → `VivereShop.apk`.
8. Vuelve a Firebase → **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `TU-USUARIO.github.io`.

> Cada vez que cambies algo en GitHub, se reconstruye solo: web nueva + APK nuevo.

## Paso 3 · Backend gratis (Google Sheet + IA)

1. Saca tu clave de IA gratis en **aistudio.google.com/apikey** → *Create API key* → cópiala.
2. Abre **script.google.com** → **Nuevo proyecto** → nombre `VivereShop Backend`.
3. Borra todo y pega el contenido de **`apps-script/Code.gs`**. Arriba, en `CONFIG`, llena:
   - `GEMINI_API_KEY`: la clave del punto 1.
   - `STREAMING_SHEET_ID`: el código de tu Google Sheet (lo que va entre `/d/` y `/edit` en el enlace).
   - `TAB_CLIENTES` y `TAB_CUENTAS`: los nombres de tus pestañas (ver "Formato del Sheet" abajo).
4. ⚙️ **Configuración del proyecto** → Zona horaria: **(GMT-04:00) Santo Domingo**.
5. Arriba elige la función **`setup`** → **Ejecutar** → autoriza con tu cuenta (*Avanzado → Ir a VivereShop Backend*).
   En **Registro de ejecución** aparece tu **API_KEY**: cópiala.
6. **Implementar → Nueva implementación → ⚙️ Aplicación web**
   - Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier usuario** → Implementar → copia la **URL** (termina en `/exec`).
7. Entra a la oficina → **⚙️ Ajustes** → pega la **URL** y la **API_KEY** → Guardar → **🧪 Probar conexión**.

Desde ahí, todos los días a las ~6 a.m. el backend solo:
- escribe los mensajes de tus 8 grupos (Clau),
- los lunes crea las dinámicas de la semana,
- te manda un correo con las cuentas por vencer, vencidas y perfiles libres (Neto).

> Si cambias el código de `Code.gs` después: **Implementar → Administrar implementaciones → ✏️ → Versión: nueva → Implementar** (la URL no cambia).

### Formato del Sheet (Neto lo lee solo)
No tienes que cambiar tu Sheet si las columnas se llaman parecido. Reconoce estos nombres (sin importar mayúsculas o tildes):

- **Pestaña de clientes**: `Cliente` · `Teléfono`/`WhatsApp` · `Servicio`/`Plataforma` · `Correo`/`Cuenta` · `Perfil` · `Vence`/`Vencimiento`/`Fecha de vencimiento` · `Estado` (opcional)
  - Un perfil cuenta como **disponible** si la columna Cliente está vacía o el Estado dice *Disponible/Libre*.
- **Pestaña de tus cuentas** (opcional): `Servicio` · `Correo` · `Vence`

Las fechas pueden ser fechas de Sheets o texto `dd/mm/aaaa`. Si tu Sheet es distinto, pásame una captura de los encabezados y te ajusto el lector.

## Paso 4 · Zapi (tu agente de ZapIA)

ZapIA sigue aprobando usuarios en su app. La oficina **vigila** cuántos esperan para que Zapi trabaje o se tome su café, y su botón **💬 Conversar** te abre la app de ZapIA.

1. WordPress → **Code Snippets → Agregar nuevo** → pega **`wordpress/snippet-pendientes.php`** → cambia `CAMBIA-ESTA-CLAVE-2026` por una clave tuya → *Ejecutar en todas partes* → Activar.
2. En la oficina toca a **Zapi → ⚙️ Configurar**:
   - URL de pendientes: `https://vivereshop.com/wp-json/oficina/v1/pendientes`
   - Clave: la que pusiste en el snippet.
   - Paquete Android de ZapIA: búscalo en la Play Store, abre la página de ZapIA y copia lo que va después de `id=` en el enlace. Con eso, en el APK, **Conversar abre la app directo**. (Sin paquete abre el enlace que pongas.)

## Paso 5 · Instalar

- **Teléfono (APK)**: en el teléfono abre `github.com/TU-USUARIO/vivereshop-oficina/releases` → descarga `VivereShop.apk` → ábrelo → permite *instalar apps de origen desconocido* → Instalar. Acepta las notificaciones (para el coach de tareas).
- **PC**: abre `https://TU-USUARIO.github.io/vivereshop-oficina/` en **Chrome o Edge** → ícono **Instalar** en la barra de direcciones. Queda como un programa en tu escritorio.
- En la laptop, si va lenta: **⚙️ Ajustes → Gráficos → ⚡ Ligero**.

## Paso 6 · Primera entrada y socias

1. Entra con tu correo de CEO. La primera vez te pregunta tu nombre y arma la oficina con los 4 agentes y tu dashboard.
2. **👑 Equipo → Crear usuario para socia** → crea a **Ada** y a **Yessy** (correo + contraseña temporal). Te sale un mensaje listo para mandarles con el enlace y sus datos. Ellas pueden cambiar la contraseña con *¿Olvidaste tu contraseña?*.
3. Las socias ven todo y usan todo. Solo tú (CEO) puedes cambiar las conexiones, despedir agentes y dar/quitar accesos.

---

## Qué hace cada cosa

- **Toca a un agente** (en la oficina o en la barra de abajo) → su panel: trabajo, ⚡ acciones (descanso, bailar, pagar, bono, conversar, despedir) y ⚙️ configuración (nombre, color, horario de trabajo y de descanso).
- **Zapi** ✅ trabaja si hay usuarios por aprobar; si no, café ☕ o sofá 🛋️.
- **Clau** 💬 deja listos los mensajes de los 8 grupos (buenos días, publicaciones, seguimiento, dudas, encuesta) + dinámicas semanales. Edita tus grupos en la pestaña 👥 Grupos y pega el enlace de invitación de cada grupo: el botón **Copiar y abrir grupo** copia el mensaje y abre ese grupo para que lo pegues.
- **Neto** 📺 revisa tu Sheet cada 10 minutos: clientes por vencer, vencidos, perfiles libres y tus cuentas por vencer. Con 📲 le escribes al cliente por WhatsApp con el mensaje ya hecho.
- **Profe Tito** ⏰ anotas tareas del día, semana o mes; cuando llega la hora te **insiste** cada X minutos (hasta 24 veces) y cada vez más intenso, hasta que la marques como hecha.
- **🖥️ Pantalla del CEO** → dashboard con las áreas de VivereShop. **✏️ Editar** para crear, editar o borrar áreas y sus enlaces.
- **🤝 Contratar** (kiosco verde de la oficina o botón de abajo): agente IA con tus instrucciones, vigilante de una URL, atajo a otra app, otra secretaria u otro coach.
- **💰 Billetera** (dinero ficticio): paga salarios, nómina completa, bonos. Si no les pagas, su ánimo baja 😤.
- **🎉 Celebrar**: todos van a la pista a bailar, con mensaje en pantalla para todos los conectados.

## Límites honestos

- **WhatsApp no deja** que una app gratis envíe sola a grupos. Los mensajes quedan listos y con un toque los copias o los abres en WhatsApp.
- La **IA gratis** de Gemini tiene límite diario; para esto alcanza de sobra. Google puede usar lo que se le manda en el plan gratis para mejorar sus modelos, por eso al Gemini **solo van los nombres y temas de tus grupos** y las instrucciones de tus agentes, nunca los datos de clientes del Sheet.
- Las **notificaciones con la app cerrada** funcionan en el APK. En la PC suenan mientras la oficina esté abierta (aunque esté minimizada).
- Zapi **no aprueba** dentro de la oficina: lo sigue haciendo ZapIA en su app; la oficina lo muestra y te lleva ahí.

## Probar en tu PC antes de subir (opcional)
Con Node.js 22 instalado: `npm install` y luego `npm run dev`. Sin la configuración de Firebase arranca en **modo demo** (datos de ejemplo guardados solo en ese navegador).
