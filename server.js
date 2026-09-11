// ============================================================
//  Check-in de la fiesta — Backend seguro
//  Express + SQLite + JWT (tokens firmados)
//
//  Cómo funciona la seguridad:
//   1. Cada invitado tiene un "ticket" en la base de datos.
//   2. Su QR contiene un token FIRMADO con una clave secreta.
//      -> Nadie puede inventar un QR válido sin esa clave.
//   3. Al escanear, el servidor verifica la firma, busca el
//      ticket y lo marca como usado de forma ATÓMICA.
//      -> Imposible usar el mismo QR dos veces, ni en dos
//         puertas a la vez.
// ============================================================

import express from "express";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Configuración (viene de variables de entorno) ----
const PORT = process.env.PORT || 3000;
// Clave secreta que firma los QR. NUNCA la compartas.
const SECRET = process.env.QR_SECRET || "cambia-esta-clave-secreta-por-favor";
// Clave para administrar (crear invitados, ver la lista).
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-1234";
// Clave para el personal de la puerta (solo escanear).
const DOOR_KEY = process.env.DOOR_KEY || "puerta-5678";

// ---- Base de datos ----
const db = new Database(process.env.DB_PATH || "fiesta.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id         TEXT PRIMARY KEY,
    guest_name TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'valid',   -- 'valid' | 'used'
    used_at    INTEGER,
    created_at INTEGER NOT NULL
  );
`);

// ---- Utilidades de token ----
function makeTicketId() {
  return crypto.randomBytes(6).toString("hex"); // id aleatorio, difícil de adivinar
}
function signToken(tid) {
  // El QR llevará este string firmado
  return jwt.sign({ tid }, SECRET, { algorithm: "HS256" });
}
function readToken(token) {
  try {
    return jwt.verify(token, SECRET); // lanza error si la firma no es válida
  } catch {
    return null;
  }
}

// ---- App ----
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Middlewares de autenticación por clave
function requireAdmin(req, res, next) {
  if (req.get("x-admin-key") !== ADMIN_KEY)
    return res.status(401).json({ error: "Clave de administrador incorrecta" });
  next();
}
function requireDoor(req, res, next) {
  if (req.get("x-door-key") !== DOOR_KEY)
    return res.status(401).json({ error: "Clave de puerta incorrecta" });
  next();
}

// ============================================================
//  ADMIN — crear invitados y ver la lista
// ============================================================

// Crear uno o varios invitados. Devuelve su token para el QR.
app.post("/api/admin/guests", requireAdmin, (req, res) => {
  const names = (req.body.names || [])
    .map((n) => String(n).trim())
    .filter(Boolean);
  if (!names.length)
    return res.status(400).json({ error: "Manda al menos un nombre" });

  const insert = db.prepare(
    "INSERT INTO tickets (id, guest_name, status, created_at) VALUES (?, ?, 'valid', ?)"
  );
  const now = Date.now();
  const created = names.map((name) => {
    const id = makeTicketId();
    insert.run(id, name, now);
    return { id, name, token: signToken(id) };
  });
  res.json({ created });
});

// Listar todos los invitados con su estado y conteos.
app.get("/api/admin/guests", requireAdmin, (req, res) => {
  const rows = db
    .prepare("SELECT id, guest_name, status, used_at FROM tickets ORDER BY created_at")
    .all();
  const guests = rows.map((r) => ({
    id: r.id,
    name: r.guest_name,
    status: r.status,
    used_at: r.used_at,
    token: signToken(r.id), // para poder regenerar el QR cuando quieras
  }));
  const usedCount = guests.filter((g) => g.status === "used").length;
  res.json({ guests, total: guests.length, used: usedCount, pending: guests.length - usedCount });
});

// Deshacer un check-in manual (por si alguien se marcó por error).
app.post("/api/admin/undo", requireAdmin, (req, res) => {
  const id = String(req.body.id || "");
  const info = db
    .prepare("UPDATE tickets SET status='valid', used_at=NULL WHERE id=?")
    .run(id);
  res.json({ ok: info.changes === 1 });
});

// Borrar todo (peligroso: requiere clave de admin).
app.post("/api/admin/reset", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM tickets").run();
  res.json({ ok: true });
});

// ============================================================
//  PUERTA — verificar un QR (aquí está el corazón seguro)
// ============================================================
app.post("/api/verify", requireDoor, (req, res) => {
  const token = String(req.body.token || "");

  // 1) ¿La firma es válida? (rechaza QR inventados al instante)
  const data = readToken(token);
  if (!data || !data.tid)
    return res.json({ result: "invalid", reason: "QR no válido o falsificado" });

  // 2) ¿Existe el ticket?
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(data.tid);
  if (!ticket)
    return res.json({ result: "invalid", reason: "No está en la lista" });

  // 3) Marcar como usado DE FORMA ATÓMICA.
  //    El WHERE status='valid' garantiza que solo la PRIMERA
  //    persona que escanee gane. Si ya estaba usado, changes = 0.
  const now = Date.now();
  const info = db
    .prepare("UPDATE tickets SET status='used', used_at=? WHERE id=? AND status='valid'")
    .run(now, data.tid);

  if (info.changes === 1) {
    return res.json({ result: "ok", name: ticket.guest_name, used_at: now });
  } else {
    // Ya había entrado antes: leemos la hora real del primer ingreso
    const t2 = db.prepare("SELECT used_at FROM tickets WHERE id=?").get(data.tid);
    return res.json({ result: "used", name: ticket.guest_name, used_at: t2.used_at });
  }
});

// Página raíz -> panel de admin
app.get("/", (req, res) => res.redirect("/admin.html"));

app.listen(PORT, () => {
  console.log(`✦ Check-in de la fiesta corriendo en http://localhost:${PORT}`);
  console.log(`  Admin:  /admin.html`);
  console.log(`  Puerta: /scan.html`);
});
