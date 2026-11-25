// Migrations idempotentes : ajoutent ce qui manque à une base existante, sans rien casser.
// Appelé au démarrage par db-init.js (Docker/Coolify) ET par server.js (développement local).
// MySQL 8 ne connaît pas « ADD COLUMN IF NOT EXISTS » : on vérifie donc dans information_schema.

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return rows.length > 0;
}

async function migrate(conn) {
  const done = [];

  // 1. Statut « cancelled » (annulé par le client)
  const [[col]] = await conn.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'status'"
  );
  if (col && !String(col.t).includes("'cancelled'")) {
    await conn.query("ALTER TABLE bookings MODIFY status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending'");
    done.push('statut cancelled');
  }

  // 2. Code secret du lien d'annulation envoyé par email
  if (!(await columnExists(conn, 'bookings', 'cancel_token'))) {
    await conn.query('ALTER TABLE bookings ADD COLUMN cancel_token CHAR(64) NULL, ADD UNIQUE INDEX idx_cancel_token (cancel_token)');
    done.push('cancel_token');
  }

  // 3. Date d'annulation (sert à limiter le nombre d'annulations sur 30 jours)
  if (!(await columnExists(conn, 'bookings', 'cancelled_at'))) {
    await conn.query('ALTER TABLE bookings ADD COLUMN cancelled_at DATETIME NULL');
    done.push('cancelled_at');
  }

  if (done.length) console.log('Base de données : migration appliquée (' + done.join(', ') + ').');
}

module.exports = { migrate };
