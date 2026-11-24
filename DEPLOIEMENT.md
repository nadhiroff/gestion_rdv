# Déploiement sur Coolify (VPS Hostinger)

Le dépôt contient un `Dockerfile` et un `docker-compose.yml` : Coolify construit l'image et
démarre **un seul service `api`** (Node.js) qui sert l'API `/api/*` **et** le site statique
(`frontend/index.html`) sur le port 4000.

Au démarrage du conteneur, `backend/db-init.js` applique le schéma SQL
(`backend/db/schema.sql`, idempotent) puis lance l'API. Les redéploiements ne cassent rien.

## 1. La base MySQL

Dans Coolify : **+ New › Database › MySQL**. À la création, remplissez
« Normal user », « Normal user password » et « Initial database », puis ne plus y toucher.

La base n'a pas besoin d'être exposée sur Internet : l'application la joint par le réseau
interne de Coolify. Activez les **sauvegardes programmées** de cette base.

| Variable | Champ dans la fiche de la base Coolify |
|---|---|
| `DB_HOST` | nom du conteneur MySQL (dans l'URL interne, entre `@` et `:3306`) |
| `DB_USER` | Normal user |
| `DB_PASSWORD` | Normal user password |
| `DB_NAME` | Initial database |
| `DB_PORT` | `3306` (ou laisser vide : la valeur par défaut est 3306) |

## 2. L'application

**+ New › Resource › Docker Compose** (ou **Private Repository (GitHub App)** →
dépôt `nadhiroff/gestion_rdv`, branche `main`, Build Pack : *Docker Compose*,
fichier : `docker-compose.yml`).

| Réglage | Valeur |
|---|---|
| Domaine | par exemple `https://rdv.votre-domaine.com` |
| Service | `api` |
| Port | `4000` |
| Auto deploy | activé (chaque push sur `main` redéploie) |

## 3. Les variables d'environnement

Onglet **Environment Variables**, mode **Bulk Editor**, collez le contenu de `.env.example`
puis remplacez les valeurs :

- `DB_*` : repris depuis la fiche de la base MySQL (§1) ;
- `ADMIN_CODE` : code d'accès à l'espace Administration ;
- `JWT_SECRET` : générer une fois avec
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, ne plus changer ;
- `SMTP_*` / `MAIL_FROM` : voir §4.

## 4. Emails (SMTP)

Les emails (confirmation de rendez-vous, notifications admin) exigent un vrai SMTP.

- **Gmail** : activer la 2FA puis créer un **mot de passe d'application** sur
  https://myaccount.google.com/apppasswords — 16 caractères, **sans espaces**.
  Le port 587 / `secure=false` est déjà configuré dans le compose.
- **Autre fournisseur** (OVH, o2switch, etc.) : adaptez `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASSWORD` dans les variables d'environnement.

Pour vérifier : espace **Administration → Responsable & capacité → « Tester l'envoi d'email »**.

## 5. Premier déploiement

Cliquez sur **Deploy**, puis vérifiez dans l'onglet **Logs** :

- `Base de données : schéma vérifié / appliqué.` ;
- `SMTP OK : connexion au serveur mail établie` (ou `SMTP INDISPONIBLE` avec le détail) ;
- `API démarrée sur le port 4000`.

Ouvrez ensuite `https://votre-domaine` : le calendrier s'affiche.
Le code admin (`ADMIN_CODE`) donne accès à l'espace **Administration**.

## 6. Mises à jour

Envoyer les changements sur `main` : Coolify reconstruit et redémarre automatiquement.
Le schéma SQL est rejoué à chaque démarrage (`IF NOT EXISTS` : sans effet de bord).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `Échec de l’initialisation de la base` | `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` incorrects → recopier depuis la fiche de la base Coolify |
| Site OK mais calendrier vide / erreur API | conteneur pas encore démarré ou base injoignable — vérifier les logs |
| Emails non reçus | `SMTP_*` invalides → tester avec « Tester l'envoi d'email » dans l'admin |
| Erreur CORS dans la console navigateur |rare : `FRONTEND_ORIGIN` — remettre `*` dans le compose |
