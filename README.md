# Check-in de la fiesta — versión segura (backend + base de datos)

Verificación de entradas con QR "de la buena": los códigos van **firmados**,
la validación pasa **en el servidor** y los ingresos se marcan de forma
**atómica** en una base de datos. Sirve para **varias puertas a la vez**.

## Qué incluye

- `server.js` — el backend (Express + SQLite + JWT).
- `public/admin.html` — panel para crear invitados, ver estados y generar/imprimir los QR.
- `public/scan.html` — escáner para el personal de la puerta.
- `package.json` — dependencias.
- `.env.example` — plantilla de claves secretas.

## Cómo está protegido

1. **QR firmados**: cada entrada lleva un token firmado con `QR_SECRET`.
   Nadie puede inventar un QR válido sin esa clave secreta.
2. **Validación en el servidor**: el celular de la puerta solo *pregunta*.
   El servidor decide. Aunque hackeen la app del celular, no dejan entrar a nadie.
3. **Check-in atómico**: la base de datos marca "usado" con
   `UPDATE ... WHERE status='valid'`. Solo el primer escaneo gana,
   así que el mismo QR no sirve dos veces, ni en dos puertas simultáneas.
4. **Dos claves**: `ADMIN_KEY` (solo tú, para administrar) y
   `DOOR_KEY` (para el personal de la puerta, solo escanea).

## Probarlo en tu compu (local)

Necesitas tener Node.js instalado (versión 18 o mayor).

```bash
npm install
QR_SECRET=miclave ADMIN_KEY=admin123 DOOR_KEY=door123 npm start
```

Luego abre en tu navegador:
- Panel de admin: http://localhost:3000/admin.html
- Escáner: http://localhost:3000/scan.html

(En `localhost` la cámara sí funciona sin https.)

## Subirlo a internet para usarlo en la fiesta

La cámara de los celulares necesita un enlace **https**, así que hay que
desplegar el servidor. La opción más fácil es **Render** (tiene plan gratis):

1. Sube esta carpeta a un repositorio de GitHub.
2. En https://render.com crea un **New > Web Service** y conéctalo al repo.
3. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. En **Environment**, agrega tus variables secretas (¡inventa valores propios!):
   - `QR_SECRET` = una clave larga y aleatoria
   - `ADMIN_KEY` = tu clave de admin
   - `DOOR_KEY` = la clave para la puerta
5. Para que los datos no se borren al reiniciar, agrega un **Disk**
   (por ejemplo montado en `/data`) y pon `DB_PATH=/data/fiesta.db`.

Render te dará un link https tipo `https://tu-fiesta.onrender.com`.
- Tú entras a `.../admin.html` con tu `ADMIN_KEY`.
- El personal de puerta entra a `.../scan.html` con la `DOOR_KEY`.

## El día de la fiesta

1. En el panel de admin agrega a todos tus invitados.
2. Genera e imprime (o envía por WhatsApp) sus QR.
3. En la puerta, abre `scan.html`, pon la clave de puerta, inicia la cámara
   y a escanear. Verde = pasa, ámbar = ya había entrado, rojo = no válido.

## Si crece mucho (cientos de personas / muchas puertas)

SQLite aguanta perfecto una fiesta. Si algún día necesitas algo más grande,
solo se cambia la base de datos por PostgreSQL; la lógica de seguridad
(tokens firmados + check-in atómico) es exactamente la misma.
