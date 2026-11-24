// Applique backend/db/schema.sql au démarrage (tables en IF NOT EXISTS,
// donc rejouable sans risque). Utilisé en production où la base est
// gérée par Coolify : le script ne crée ni base ni utilisateur.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  // Retire les lignes CREATE DATABASE / USE : la base existe déjà (Coolify).
  const cleaned = sql
    .split('\n')
    .filter((l) => !/^\s*(CREATE DATABASE|USE)\b/i.test(l))
    .join('\n');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  await conn.query(cleaned);
  await conn.end();
  console.log('Base de données : schéma vérifié / appliqué.');
})().catch((e) => {
  console.error('Échec de l’initialisation de la base :', e.message);
  process.exit(1);
});
