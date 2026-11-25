// Paramètres de connexion MySQL, lus depuis l'environnement.
//
// Deux façons de configurer (au choix) :
//   1. DATABASE_URL=mysql://utilisateur:motdepasse@hote:3306/nom_base
//      -> une seule variable, copiée telle quelle depuis Coolify ("MySQL URL (internal)")
//   2. DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME séparément (développement local)
// Si DATABASE_URL est définie, elle est prioritaire.
function dbConfig() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (url) {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      throw new Error('DATABASE_URL invalide (format attendu : mysql://utilisateur:motdepasse@hote:3306/nom_base)');
    }
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      // decodeURIComponent : un mot de passe contenant @ : / # etc. doit être encodé dans l'URL
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    };
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

module.exports = { dbConfig };
