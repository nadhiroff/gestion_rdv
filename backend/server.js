require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

// Nettoie une variable d'environnement : enlève les espaces avant/après, et retire
// des guillemets simples ou doubles si l'utilisateur les a mis autour de la valeur
// dans le .env (ex: SMTP_PASSWORD='abcd efgh' -> abcd efgh, PAS "'abcd efgh'").
// C'est une cause très fréquente d'échec d'authentification SMTP : dotenv ne retire
// PAS toujours les guillemets, et une valeur littérale avec des guillemets ou des
// espaces en trop n'est plus le bon mot de passe pour Gmail.
function cleanEnv(name, { stripSpaces = false } = {}) {
  let v = process.env[name];
  if (v === undefined || v === null) return '';
  v = String(v).trim();
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    v = v.slice(1, -1).trim();
  }
  if (stripSpaces) v = v.replace(/\s+/g, '');
  return v;
}

const app = express();
// Derrière un proxy HTTPS (Coolify, Nginx, Apache...) : fait confiance à
// X-Forwarded-Proto pour que req.protocol soit https et que le contrôle
// same-origin CORS fonctionne sans rien configurer.
app.set('trust proxy', 1);
app.use(express.json());

// Empêche qu'une erreur dans une route async ne fasse planter tout le serveur :
// chaque route est enveloppée, toute exception est transformée en réponse 500
// au lieu de faire planter le process Node (cause de vos "ERR_CONNECTION_REFUSED").
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
// Filet de sécurité supplémentaire : si jamais une promesse rejetée s'échappe
// quand même, on la log au lieu de laisser Node tuer le process.
process.on('unhandledRejection', (err) => {
  console.error('Rejet de promesse non géré (le serveur continue de tourner):', err);
});
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors((req, callback) => {
  if (allowedOrigins.includes('*')) return callback(null, { origin: '*' });
  const origin = req.header('Origin');
  // Toujours autoriser : requêtes sans origine (curl, Postman) et la page servie
  // par ce même serveur (ex: http://localhost:4000 -> http://localhost:4000/api).
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (!origin || sameOrigin || allowedOrigins.includes(origin)) return callback(null, { origin: true });
  console.warn('Origine refusée par CORS:', origin, '(ajoutez-la à FRONTEND_ORIGIN dans .env)');
  callback(null, { origin: false });
}));

// ---------- MySQL ----------
// DATABASE_URL (une seule variable) ou DB_HOST/DB_USER/... : voir db-config.js
const pool = mysql.createPool({
  ...require('./db-config').dbConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // renvoie les colonnes DATE en 'YYYY-MM-DD' plutôt qu'en objets Date
});

// ---------- Email ----------
// SMTP_PASSWORD : les mots de passe d'application Gmail sont composés de 16 caractères
// sans espace ; Google les AFFICHE en 4 groupes de 4 séparés par des espaces pour la
// lisibilité, mais si vous les recopiez avec les espaces (ou entre guillemets) dans le
// .env, l'authentification échoue avec "Invalid login: 535-5.7.8 ...". On nettoie donc
// systématiquement le mot de passe (guillemets retirés + espaces retirés) avant de
// l'utiliser, en plus de recommander de le corriger directement dans le .env.
const SMTP_HOST = cleanEnv('SMTP_HOST');
const SMTP_PORT = Number(cleanEnv('SMTP_PORT') || 587);
const SMTP_SECURE = cleanEnv('SMTP_SECURE') === 'true';
const SMTP_USER = cleanEnv('SMTP_USER');
const SMTP_PASSWORD = cleanEnv('SMTP_PASSWORD', { stripSpaces: true });
const MAIL_FROM = cleanEnv('MAIL_FROM') || SMTP_USER;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
});

async function sendMail(to, subject, html, text) {
  if (!to) {
    console.warn(`Email non envoyé ("${subject}") : aucune adresse destinataire renseignée.`);
    return { ok: false, error: 'Aucune adresse destinataire' };
  }
  try {
    await transporter.sendMail({ from: MAIL_FROM, to, subject, html, text });
    return { ok: true };
  } catch (err) {
    console.error(`Erreur envoi email à ${to} ("${subject}"):`, err.message);
    return { ok: false, error: err.message };
  }
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function htmlTemplate(title, content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .content h2 { color: #667eea; margin-top: 0; font-size: 20px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-box strong { color: #667eea; }
    .info-row { display: flex; margin: 10px 0; }
    .info-label { font-weight: 600; color: #555; min-width: 120px; }
    .info-value { color: #333; }
    .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: 600; }
    .btn:hover { background: #5568d3; }
    @media only screen and (max-width: 600px) { .container { padding: 10px; } .header, .content { padding: 20px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Prise de rendez-vous</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
    </div>
  </div>
</body>
</html>`;
}

// Vérifie la connexion SMTP au démarrage : affiche clairement en console si les
// identifiants SMTP du .env sont valides, pour diagnostiquer rapidement pourquoi
// les emails ne partent pas (au lieu de le découvrir après une demande manquée).
async function verifySmtp() {
  try {
    await transporter.verify();
    console.log('SMTP OK : connexion au serveur mail établie (', SMTP_HOST, ').');
  } catch (err) {
    console.error(
      'SMTP INDISPONIBLE : les emails ne partiront pas tant que ce problème n\'est pas résolu.\n' +
      "  -> Vérifiez SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASSWORD dans .env\n" +
      "  -> Avec Gmail : utilisez un \"mot de passe d'application\", pas le mot de passe du compte.\n" +
      '  Détail :', err.message
    );
  }
}

// ---------- Auth admin (JWT) ----------
function signAdminToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
}
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('role');
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide, reconnectez-vous' });
  }
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Trop de tentatives, réessayez plus tard' } });
const bookingLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Trop de demandes, réessayez plus tard' } });

// ---------- Helpers ----------
async function getSettings() {
  const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
  return rows[0];
}

// initialise le code admin au premier démarrage si la base ne contient pas encore de hash
async function ensureAdminCode() {
  const settings = await getSettings();
  if (settings && !settings.admin_code_hash) {
    const hash = await bcrypt.hash(process.env.ADMIN_CODE || '0000', 10);
    await pool.query('UPDATE settings SET admin_code_hash = ? WHERE id = 1', [hash]);
    console.log('Code admin initialisé depuis ADMIN_CODE (changez-le si besoin).');
  }
}

function weekdayIndex(dateStr) {
  // dateStr = 'YYYY-MM-DD' ; renvoie 0=Lundi ... 6=Dimanche
  const d = new Date(dateStr + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}
// Date du jour à l'heure du Bénin (UTC+1), pas en UTC : sinon, entre minuit et 1h,
// le serveur considère encore qu'on est la veille.
const APP_TZ = process.env.APP_TZ || 'Africa/Porto-Novo';
function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Échappe le texte saisi par les visiteurs avant de l'insérer dans un email HTML
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// "HH:MM" + durée (minutes) -> "HH:MM:SS" de fin
function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = h * 60 + m + Number(minutes);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`;
}
// Nombre de demandes qui occupent une place ce jour-là (en attente + acceptées)
async function countTaken(conn, date) {
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM bookings WHERE date = ? AND status != 'rejected'", [date]);
  return Number(n);
}

async function isDateBlocked(dateStr) {
  const [rows] = await pool.query(
    'SELECT id FROM blocked_dates WHERE ? BETWEEN date_debut AND date_fin LIMIT 1',
    [dateStr]
  );
  return rows.length > 0;
}

// Renvoie la surcharge (max_par_jour / responsable) applicable à une date donnée,
// si plusieurs périodes se chevauchent, on prend la plus "précise" (la plus courte),
// et à égalité la plus récemment créée.
async function getOverrideForDate(dateStr) {
  const [rows] = await pool.query(
    `SELECT * FROM date_overrides
     WHERE ? BETWEEN date_debut AND date_fin
     ORDER BY DATEDIFF(date_fin, date_debut) ASC, id DESC
     LIMIT 1`,
    [dateStr]
  );
  return rows[0] || null;
}

// Récupère en une seule requête toutes les surcharges qui touchent une plage de dates
// (utile pour calculer un mois entier sans faire une requête par jour).
async function getOverridesInRange(fromStr, toStr) {
  const [rows] = await pool.query(
    `SELECT * FROM date_overrides WHERE date_debut <= ? AND date_fin >= ? ORDER BY DATEDIFF(date_fin, date_debut) ASC, id DESC`,
    [toStr, fromStr]
  );
  return rows;
}
function pickOverrideForDate(overrides, dateStr) {
  return overrides.find((o) => dateStr >= o.date_debut && dateStr <= o.date_fin) || null;
}
// Valeurs effectives (max / nom responsable / email responsable) pour une date,
// en combinant réglage global + surcharge éventuelle.
function effectiveForDate(settings, override) {
  return {
    max: override && override.max_par_jour != null ? override.max_par_jour : settings.max_par_jour,
    responsable_nom: override && override.responsable_nom ? override.responsable_nom : settings.responsable_nom,
    responsable_email: override && override.responsable_email ? override.responsable_email : settings.responsable_email,
  };
}

// ---------- Routes publiques ----------

// Statut d'un mois entier (pour affichage du calendrier)
app.get('/api/public/month', async (req, res) => {
  try {
    const { year, month } = req.query; // month: 0-11
    if (year === undefined || month === undefined) return res.status(400).json({ error: 'year et month requis' });
    const y = Number(year), m = Number(month);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const settings = await getSettings();
    const joursFermes = (settings.jours_fermes || '').split(',').filter(Boolean).map(Number);

    const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [counts] = await pool.query(
      `SELECT date, COUNT(*) as n FROM bookings
       WHERE date BETWEEN ? AND ? AND status != 'rejected'
       GROUP BY date`,
      [first, last]
    );
    const countMap = Object.fromEntries(counts.map((c) => [c.date, c.n]));

    const [blocked] = await pool.query(
      `SELECT date_debut, date_fin FROM blocked_dates WHERE date_debut <= ? AND date_fin >= ?`,
      [last, first]
    );
    const overrides = await getOverridesInRange(first, last);

    const today = todayIso();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const override = pickOverrideForDate(overrides, iso);
      const eff = effectiveForDate(settings, override);
      let status;
      if (iso < today) status = 'passe';
      else if (joursFermes.includes(weekdayIndex(iso))) status = 'ferme';
      else if (blocked.some((b) => iso >= b.date_debut && iso <= b.date_fin)) status = 'ferme';
      else {
        const n = countMap[iso] || 0;
        status = n >= eff.max ? 'complet' : 'disponible';
      }
      days.push({
        date: iso,
        status,
        max: eff.max,
        restant: Math.max(0, eff.max - (countMap[iso] || 0)),
        surcharge: !!override,
      });
    }
    res.json({ days, maxParJour: settings.max_par_jour });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une demande de rendez-vous
app.post('/api/bookings', bookingLimiter, async (req, res) => {
  try {
    const clean = (v) => String(v ?? '').trim();
    const date = clean(req.body.date), nom = clean(req.body.nom), prenom = clean(req.body.prenom), tel = clean(req.body.tel), email = clean(req.body.email).toLowerCase();
    if (!date || !nom || !prenom || !tel || !email) return res.status(400).json({ error: 'Merci de remplir tous les champs.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date invalide' });
    if (nom.length > 80 || prenom.length > 80) return res.status(400).json({ error: 'Nom ou prénom trop long (80 caractères max).' });
    if (!/^[+0-9 ().-]{6,25}$/.test(tel)) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
    if (date < todayIso()) return res.status(400).json({ error: 'Date passée' });

    const settings = await getSettings();
    const joursFermes = (settings.jours_fermes || '').split(',').filter(Boolean).map(Number);
    if (joursFermes.includes(weekdayIndex(date))) return res.status(409).json({ error: 'Jour fermé' });
    if (await isDateBlocked(date)) return res.status(409).json({ error: 'Date indisponible' });

    const override = await getOverrideForDate(date);
    const eff = effectiveForDate(settings, override);

    // Verrou par date : deux demandes simultanées pour le même jour passent l'une après
    // l'autre, sinon les deux pourraient lire « il reste 1 place » et dépasser le maximum.
    const conn = await pool.getConnection();
    let result;
    try {
      const [[{ ok }]] = await conn.query('SELECT GET_LOCK(?, 10) AS ok', [`rdv_booking_${date}`]);
      if (ok !== 1) return res.status(503).json({ error: 'Serveur occupé, réessayez dans un instant.' });
      try {
        if ((await countTaken(conn, date)) >= eff.max) return res.status(409).json({ error: 'Journée complète' });
        [result] = await conn.query(
          'INSERT INTO bookings (date, nom, prenom, tel, email, status) VALUES (?, ?, ?, ?, ?, "pending")',
          [date, nom, prenom, tel, email]
        );
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [`rdv_booking_${date}`]);
      }
    } finally {
      conn.release();
    }

    const dateLabel = formatDate(date);
    // Versions échappées pour les emails HTML (le texte brut garde les valeurs telles quelles)
    const h = { nom: escHtml(nom), prenom: escHtml(prenom), tel: escHtml(tel), email: escHtml(email) };

    // Email automatique au responsable (celui du jour si une surcharge en définit un, sinon le responsable global)
    let responsableMail = { ok: false, error: 'Aucun responsable renseigné pour cette date' };
    if (eff.responsable_email) {
      const htmlContent = htmlTemplate('Nouvelle demande de rendez-vous', `
        <h2>🔔 Nouvelle demande de rendez-vous</h2>
        <p>Une nouvelle demande de rendez-vous a été enregistrée et nécessite votre attention.</p>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Date :</span><span class="info-value"><strong>${dateLabel}</strong></span></div>
          <div class="info-row"><span class="info-label">Nom :</span><span class="info-value">${h.nom} ${h.prenom}</span></div>
          <div class="info-row"><span class="info-label">Téléphone :</span><span class="info-value">${h.tel}</span></div>
          <div class="info-row"><span class="info-label">Email :</span><span class="info-value">${h.email}</span></div>
        </div>
        <p>Connectez-vous à l'espace administrateur pour accepter ou refuser cette demande.</p>
      `);
      responsableMail = await sendMail(
        eff.responsable_email,
        `Nouvelle demande de rendez-vous - ${dateLabel}`,
        htmlContent,
        `Une nouvelle demande a été enregistrée.\n\nDate : ${dateLabel}\nNom : ${nom} ${prenom}\nTéléphone : ${tel}\nEmail : ${email}\n\nConnectez-vous à l'espace administrateur pour l'accepter ou la refuser.`
      );
    } else {
      console.warn(`Aucun email responsable configuré pour le ${dateLabel} (ni surcharge ni réglage global) : notification non envoyée.`);
    }
    // Accusé de réception au client
    const clientHtml = htmlTemplate('Demande de rendez-vous reçue', `
      <h2>✅ Votre demande a bien été enregistrée</h2>
      <p>Bonjour <strong>${h.prenom}</strong>,</p>
      <p>Votre demande de rendez-vous pour le <strong>${dateLabel}</strong> a bien été enregistrée et est en attente de confirmation.</p>
      <div class="info-box">
        <p>Vous recevrez un email dès que votre demande sera <strong>acceptée</strong> ou <strong>refusée</strong>.</p>
      </div>
      <p>Merci de votre confiance.</p>
    `);
    const clientMail = await sendMail(
      email,
      `Demande de rendez-vous reçue - ${dateLabel}`,
      clientHtml,
      `Bonjour ${prenom},\n\nVotre demande de rendez-vous pour le ${dateLabel} a bien été enregistrée et est en attente de confirmation.\nVous recevrez un email dès qu'elle sera acceptée ou refusée.\n\nMerci.`
    );

    res.status(201).json({
      id: result.insertId, date, nom, prenom, tel, email, status: 'pending',
      emailClientEnvoye: clientMail.ok,
      emailResponsableEnvoye: responsableMail.ok,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Auth admin ----------
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    // String() : un code envoyé comme nombre (ex: 9865) faisait planter bcrypt -> "Erreur serveur"
    const code = req.body && req.body.code != null ? String(req.body.code).trim() : '';
    if (!code) return res.status(400).json({ error: 'Code requis' });
    const settings = await getSettings();
    if (!settings) return res.status(500).json({ error: 'Table settings vide : rejouez backend/db/schema.sql' });
    const ok = settings.admin_code_hash && (await bcrypt.compare(code, settings.admin_code_hash));
    if (!ok) return res.status(401).json({ error: 'Code incorrect' });
    res.json({ token: signAdminToken() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Routes admin (protégées) ----------
app.use('/api/admin', requireAdmin);

app.get('/api/admin/settings', asyncHandler(async (req, res) => {
  const s = await getSettings();
  delete s.admin_code_hash;
  res.json(s);
}));

app.put('/api/admin/settings', asyncHandler(async (req, res) => {
  const { responsable_nom, responsable_email, max_par_jour, jours_fermes } = req.body;
  const joursFermesStr = Array.isArray(jours_fermes) ? jours_fermes.join(',') : (jours_fermes || '');
  await pool.query(
    'UPDATE settings SET responsable_nom=?, responsable_email=?, max_par_jour=?, jours_fermes=? WHERE id=1',
    [responsable_nom || '', responsable_email || '', Number(max_par_jour) || 1, joursFermesStr]
  );
  res.json({ ok: true });
}));

app.post('/api/admin/change-code', asyncHandler(async (req, res) => {
  const currentCode = String(req.body.currentCode ?? '').trim();
  const newCode = String(req.body.newCode ?? '').trim();
  // Le code actuel est exigé : une session restée ouverte ne suffit pas pour changer le code
  const s = await getSettings();
  if (!currentCode || !(s.admin_code_hash && (await bcrypt.compare(currentCode, s.admin_code_hash)))) {
    return res.status(400).json({ error: 'Code actuel incorrect' });
  }
  if (newCode.length < 4) return res.status(400).json({ error: 'Nouveau code trop court (4 caractères min)' });
  const hash = await bcrypt.hash(newCode, 10);
  await pool.query('UPDATE settings SET admin_code_hash=? WHERE id=1', [hash]);
  res.json({ ok: true });
}));

// Liste des rendez-vous avec filtres (date précise, plage, statut)
app.get('/api/admin/bookings', asyncHandler(async (req, res) => {
  const { date, from, to, status } = req.query;
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (date) { sql += ' AND date = ?'; params.push(date); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY date ASC, created_at ASC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

// Accepter / refuser un rendez-vous
app.patch('/api/admin/bookings/:id', asyncHandler(async (req, res) => {
  const { status, heure_debut, duree, responsable_id } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const [[booking]] = await pool.query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Introuvable' });

  // Une demande refusée ne compte plus dans les places : la ré-accepter ne doit pas faire dépasser le maximum
  if (status === 'accepted' && booking.status === 'rejected') {
    const eff = effectiveForDate(await getSettings(), await getOverrideForDate(booking.date));
    if ((await countTaken(pool, booking.date)) >= eff.max) {
      return res.status(409).json({ error: 'Journée complète : impossible de ré-accepter cette demande sans dépasser le maximum.' });
    }
  }

  // Initialiser les variables pour le responsable
  let finalResponsableId = null;
  let finalResponsableNom = null;
  let finalResponsableEmail = null;

  if (status === 'accepted') {
    // Validation des champs de créneau
    if (!heure_debut || !duree) {
      return res.status(400).json({ error: 'Heure de début et durée requis pour accepter un rendez-vous' });
    }
    
    // Détecter automatiquement le responsable depuis date_overrides si non spécifié
    finalResponsableId = responsable_id || null;
    
    if (!finalResponsableId) {
      // Chercher une règle de surcharge pour cette date
      console.log(`Recherche override pour date: ${booking.date}`);
      const [overrides] = await pool.query(
        'SELECT responsable_nom, responsable_email FROM date_overrides WHERE date_debut <= ? AND date_fin >= ? AND responsable_nom IS NOT NULL AND responsable_nom != ""',
        [booking.date, booking.date]
      );
      console.log('Overrides trouvés:', overrides);
      
      if (overrides && overrides.length > 0) {
        const override = overrides[0];
        console.log('Override utilisé:', override);
        
        // Chercher le responsable correspondant par email exact (priorité)
        let existingResp = null;
        if (override.responsable_email) {
          const [respByEmail] = await pool.query(
            'SELECT id, nom, email FROM responsables WHERE email = ? LIMIT 1',
            [override.responsable_email]
          );
          if (respByEmail.length > 0) {
            existingResp = respByEmail[0];
            console.log('Responsable trouvé par email:', existingResp);
          }
        }
        
        // Si pas trouvé par email, chercher par nom exact
        if (!existingResp) {
          const [respByName] = await pool.query(
            'SELECT id, nom, email FROM responsables WHERE nom = ? LIMIT 1',
            [override.responsable_nom]
          );
          if (respByName.length > 0) {
            existingResp = respByName[0];
            console.log('Responsable trouvé par nom:', existingResp);
          }
        }
        
        if (existingResp) {
          finalResponsableId = existingResp.id;
          finalResponsableNom = existingResp.nom;
          finalResponsableEmail = existingResp.email;
          console.log('Responsable existant utilisé:', finalResponsableId);
        } else {
          // Créer le responsable depuis date_overrides
          const [result] = await pool.query(
            'INSERT INTO responsables (nom, email, actif) VALUES (?, ?, TRUE)',
            [override.responsable_nom, override.responsable_email || '']
          );
          finalResponsableId = result.insertId;
          finalResponsableNom = override.responsable_nom;
          finalResponsableEmail = override.responsable_email;
          console.log('Nouveau responsable créé:', finalResponsableId);
        }
      }
    }
    
    // Récupérer les infos du responsable final
    if (finalResponsableId && !finalResponsableNom) {
      const [[resp]] = await pool.query('SELECT nom, email FROM responsables WHERE id = ?', [finalResponsableId]);
      if (resp) {
        finalResponsableNom = resp.nom;
        finalResponsableEmail = resp.email;
      }
    }
    
    // Vérification des conflits d'agenda pour le même responsable
    if (finalResponsableId) {
      // Chevauchement : un rendez-vous existant commence avant notre fin ET finit après notre début
      const debutStr = `${String(heure_debut).slice(0, 5)}:00`;
      const finStr = addMinutes(String(heure_debut).slice(0, 5), duree);
      const [conflicts] = await pool.query(
        `SELECT * FROM bookings 
         WHERE id != ? 
         AND date = ? 
         AND status = 'accepted'
         AND responsable_id = ?
         AND heure_debut IS NOT NULL 
         AND duree IS NOT NULL
         AND heure_debut < ?
         AND ADDTIME(heure_debut, SEC_TO_TIME(duree * 60)) > ?`,
        [req.params.id, booking.date, finalResponsableId, finStr, debutStr]
      );
      
      if (conflicts.length > 0) {
        return res.status(409).json({ 
          error: 'Conflit d\'agenda détecté : ce responsable a déjà un rendez-vous sur ce créneau' 
        });
      }
    }
    
    await pool.query(
      'UPDATE bookings SET status = ?, heure_debut = ?, duree = ?, responsable_id = ? WHERE id = ?',
      [status, heure_debut, duree, finalResponsableId, req.params.id]
    );
  } else {
    await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
  }

  const dateLabel = formatDate(booking.date);
  const hb = { nom: escHtml(booking.nom), prenom: escHtml(booking.prenom), tel: escHtml(booking.tel), email: escHtml(booking.email) };
  const subject = status === 'accepted' ? `Rendez-vous confirmé - ${dateLabel}` : `Rendez-vous refusé - ${dateLabel}`;
  
  // Récupérer les infos du responsable final
  let responsableInfo = '';
  let responsableNom = '';
  if (status === 'accepted' && finalResponsableId) {
    const [[resp]] = await pool.query('SELECT nom, email FROM responsables WHERE id = ?', [finalResponsableId]);
    if (resp) {
      responsableInfo = `<div class="info-row"><span class="info-label">Responsable :</span><span class="info-value">${escHtml(resp.nom)}</span></div>`;
      responsableNom = resp.nom;
    }
  }
  
  let htmlContent, textContent;
  if (status === 'accepted') {
    const heureLabel = heure_debut ? heure_debut.substring(0, 5) : '';
    const dureeLabel = duree ? `${duree} min` : '';
    
    htmlContent = htmlTemplate('Rendez-vous confirmé', `
      <h2>✅ Votre rendez-vous est confirmé</h2>
      <p>Bonjour <strong>${hb.prenom}</strong>,</p>
      <p>Nous avons le plaisir de vous confirmer votre rendez-vous prévu le <strong>${dateLabel}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Date :</span><span class="info-value">${dateLabel}</span></div>
        ${heureLabel ? `<div class="info-row"><span class="info-label">Heure :</span><span class="info-value">${heureLabel}</span></div>` : ''}
        ${dureeLabel ? `<div class="info-row"><span class="info-label">Durée :</span><span class="info-value">${dureeLabel}</span></div>` : ''}
        ${responsableInfo}
      </div>
      <p>Nous vous remercions de votre confiance et nous attendons avec plaisir.</p>
      <p>À très bientôt !</p>
    `);
    textContent = `Bonjour ${booking.prenom},\n\nVotre rendez-vous du ${dateLabel}${heureLabel ? ` à ${heureLabel}` : ''}${dureeLabel ? ` (${dureeLabel})` : ''}${responsableNom ? ` avec ${responsableNom}` : ''} est confirmé. À bientôt.`;
    
    // Envoyer un email à l'administrateur avec les données finales
    const effJour = effectiveForDate(await getSettings(), await getOverrideForDate(booking.date));
    if (effJour.responsable_email) {
      const adminHtml = htmlTemplate('Nouveau rendez-vous accepté', `
        <h2>📅 Nouveau rendez-vous accepté</h2>
        <p>Un rendez-vous a été accepté avec les détails suivants :</p>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Client :</span><span class="info-value">${hb.prenom} ${hb.nom}</span></div>
          <div class="info-row"><span class="info-label">Téléphone :</span><span class="info-value">${hb.tel}</span></div>
          <div class="info-row"><span class="info-label">Email :</span><span class="info-value">${hb.email}</span></div>
          <div class="info-row"><span class="info-label">Date :</span><span class="info-value">${dateLabel}</span></div>
          ${heureLabel ? `<div class="info-row"><span class="info-label">Heure :</span><span class="info-value">${heureLabel}</span></div>` : ''}
          ${dureeLabel ? `<div class="info-row"><span class="info-label">Durée :</span><span class="info-value">${dureeLabel}</span></div>` : ''}
          ${responsableNom ? `<div class="info-row"><span class="info-label">Responsable :</span><span class="info-value">${escHtml(responsableNom)}</span></div>` : ''}
        </div>
      `);
      const adminText = `Nouveau rendez-vous accepté :\nClient: ${booking.prenom} ${booking.nom}\nTel: ${booking.tel}\nEmail: ${booking.email}\nDate: ${dateLabel}${heureLabel ? `\nHeure: ${heureLabel}` : ''}${dureeLabel ? `\nDurée: ${dureeLabel}` : ''}${responsableNom ? `\nResponsable: ${responsableNom}` : ''}`;
      await sendMail(effJour.responsable_email, `Rendez-vous accepté - ${booking.prenom} ${booking.nom}`, adminHtml, adminText);
    }
  } else {
    htmlContent = htmlTemplate('Rendez-vous refusé', `
      <h2>❌ Votre demande de rendez-vous n'a pas pu être acceptée</h2>
      <p>Bonjour <strong>${hb.prenom}</strong>,</p>
      <p>Nous sommes désolés de vous informer que votre demande de rendez-vous pour le <strong>${dateLabel}</strong> n'a pas pu être acceptée.</p>
      <div class="info-box">
        <p>Cette décision peut être due à un agenda complet ou à une indisponibilité.</p>
      </div>
      <p>N'hésitez pas à choisir une autre date disponible dans notre calendrier.</p>
      <p>Nous restons à votre disposition.</p>
    `);
    textContent = `Bonjour ${booking.prenom},\n\nNous sommes désolés, votre demande de rendez-vous du ${dateLabel} n'a pas pu être acceptée. N'hésitez pas à choisir une autre date.`;
  }
  
  await sendMail(booking.email, subject, htmlContent, textContent);

  res.json({ ok: true });
}));

app.delete('/api/admin/bookings/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Blocage de périodes / dates précises
app.get('/api/admin/blocked-dates', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM blocked_dates ORDER BY date_debut ASC');
  res.json(rows);
}));

//_route publique pour les périodes bloquées (affichage client)
app.get('/api/public/blocked-dates', asyncHandler(async (req, res) => {
  // Seulement les dates : le motif est une note interne, visible uniquement dans l'admin
  const [rows] = await pool.query('SELECT id, date_debut, date_fin FROM blocked_dates ORDER BY date_debut ASC');
  res.json(rows);
}));

// Route pour récupérer les responsables (avec synchronisation depuis date_overrides et settings)
app.get('/api/admin/responsables', asyncHandler(async (req, res) => {
  // Synchroniser les responsables depuis date_overrides
  const [overrides] = await pool.query(
    'SELECT DISTINCT responsable_nom, responsable_email FROM date_overrides WHERE responsable_nom IS NOT NULL AND responsable_nom != ""'
  );
  
  for (const override of overrides) {
    // Chercher si le responsable existe déjà
    const [existing] = await pool.query(
      'SELECT id FROM responsables WHERE email = ? OR nom = ? LIMIT 1',
      [override.responsable_email || '', override.responsable_nom]
    );
    
    if (existing.length === 0) {
      // Créer le responsable s'il n'existe pas
      await pool.query(
        'INSERT INTO responsables (nom, email, actif) VALUES (?, ?, TRUE)',
        [override.responsable_nom, override.responsable_email || '']
      );
    }
  }
  
  // Synchroniser aussi le responsable par défaut depuis settings
  const [[settings]] = await pool.query('SELECT * FROM settings WHERE id = 1');
  if (settings && settings.responsable_nom) {
    const [existing] = await pool.query(
      'SELECT id FROM responsables WHERE email = ? OR nom = ? LIMIT 1',
      [settings.responsable_email || '', settings.responsable_nom]
    );
    
    if (existing.length === 0) {
      // Créer le responsable par défaut s'il n'existe pas
      await pool.query(
        'INSERT INTO responsables (nom, email, actif) VALUES (?, ?, TRUE)',
        [settings.responsable_nom, settings.responsable_email || '']
      );
    }
  }
  
  const [rows] = await pool.query('SELECT * FROM responsables WHERE actif = TRUE ORDER BY nom ASC');
  res.json(rows);
}));

app.post('/api/admin/blocked-dates', asyncHandler(async (req, res) => {
  const { date_debut, date_fin, motif } = req.body;
  if (!date_debut) return res.status(400).json({ error: 'date_debut requise' });
  const fin = date_fin || date_debut; // permet de bloquer une seule journée
  const [result] = await pool.query(
    'INSERT INTO blocked_dates (date_debut, date_fin, motif) VALUES (?, ?, ?)',
    [date_debut, fin, motif || '']
  );
  res.status(201).json({ id: result.insertId, date_debut, date_fin: fin, motif: motif || '' });
}));

// Modifier une période bloquée existante (édition depuis la liste)
app.put('/api/admin/blocked-dates/:id', asyncHandler(async (req, res) => {
  const { date_debut, date_fin, motif } = req.body;
  if (!date_debut) return res.status(400).json({ error: 'date_debut requise' });
  const fin = date_fin || date_debut;
  const [result] = await pool.query(
    'UPDATE blocked_dates SET date_debut=?, date_fin=?, motif=? WHERE id=?',
    [date_debut, fin, motif || '', req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Introuvable' });
  res.json({ id: Number(req.params.id), date_debut, date_fin: fin, motif: motif || '' });
}));

app.delete('/api/admin/blocked-dates/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM blocked_dates WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Surcharges par date / période (max par jour + responsable dédié) ----------
app.get('/api/admin/date-overrides', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM date_overrides ORDER BY date_debut ASC');
  res.json(rows);
}));

app.post('/api/admin/date-overrides', asyncHandler(async (req, res) => {
  const { date_debut, date_fin, max_par_jour, responsable_nom, responsable_email, motif } = req.body;
  if (!date_debut) return res.status(400).json({ error: 'date_debut requise' });
  const fin = date_fin || date_debut; // pas de date_fin => une seule journée
  const max = max_par_jour === '' || max_par_jour === undefined || max_par_jour === null ? null : Number(max_par_jour);
  const [result] = await pool.query(
    'INSERT INTO date_overrides (date_debut, date_fin, max_par_jour, responsable_nom, responsable_email, motif) VALUES (?, ?, ?, ?, ?, ?)',
    [date_debut, fin, max, responsable_nom || null, responsable_email || null, motif || '']
  );
  res.status(201).json({ id: result.insertId, date_debut, date_fin: fin, max_par_jour: max, responsable_nom: responsable_nom || null, responsable_email: responsable_email || null, motif: motif || '' });
}));

app.put('/api/admin/date-overrides/:id', asyncHandler(async (req, res) => {
  const { date_debut, date_fin, max_par_jour, responsable_nom, responsable_email, motif } = req.body;
  if (!date_debut) return res.status(400).json({ error: 'date_debut requise' });
  const fin = date_fin || date_debut;
  const max = max_par_jour === '' || max_par_jour === undefined || max_par_jour === null ? null : Number(max_par_jour);
  const [result] = await pool.query(
    'UPDATE date_overrides SET date_debut=?, date_fin=?, max_par_jour=?, responsable_nom=?, responsable_email=?, motif=? WHERE id=?',
    [date_debut, fin, max, responsable_nom || null, responsable_email || null, motif || '', req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Introuvable' });
  res.json({ id: Number(req.params.id), date_debut, date_fin: fin, max_par_jour: max, responsable_nom: responsable_nom || null, responsable_email: responsable_email || null, motif: motif || '' });
}));

app.delete('/api/admin/date-overrides/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM date_overrides WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Sert le frontend (frontend/index.html) à la racine, pour pouvoir ouvrir
// directement http://localhost:4000 sans Apache en local.
const FRONTEND_DIR = require('path').join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
// Espace administrateur sur son propre lien : http://localhost:4000/admin
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(require('path').join(FRONTEND_DIR, 'index.html')));

// Middleware d'erreur global : capte tout ce qui n'a pas été géré plus haut
// et répond proprement au lieu de laisser la requête planter le serveur.
app.use((err, req, res, next) => {
  console.error('Erreur non gérée sur', req.method, req.path, ':', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// ---------- Démarrage ----------
const PORT = process.env.PORT || 4000;
ensureAdminCode()
  .then(() => verifySmtp())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API démarrée sur le port ${PORT}`);
      console.log(`Site disponible sur : http://localhost:${PORT}`);
      console.log(`Espace admin      : http://localhost:${PORT}/admin`);
    });
  })
  .catch((err) => {
    console.error('Impossible de se connecter à MySQL au démarrage:', err.message);
    process.exit(1);
  });