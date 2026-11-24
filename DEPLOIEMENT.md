# Déploiement sur Coolify (VPS Hostinger)

Le dépôt contient un `Dockerfile` **et** un `docker-compose.yml` : Coolify construit les images et
démarre deux services —

- **`api`** : Node.js, sert l'API `/api/*` **et** le site statique (`frontend/index.html`) sur le port 4000 ;
- **`db`** : MySQL 8.4, les tables sont créées automatiquement au premier démarrage
  (`backend/db/schema.sql`), les données persistent dans le volume `db_data`.

Les redémarrages et redéploiements ne recréent rien.

## 1. Créer l'application dans Coolify

**+ New › Resource › Docker Compose** (ou **Private Repository (GitHub App)** →
dépôt `nadhiroff/gestion_rdv`, branche `main`, Build Pack : *Docker Compose*,
fichier : `docker-compose.yml`).

| Réglage | Valeur |
|---|---|
| Domaine | par exemple `https://rdv.votre-domaine.com` |
| Service | `api` |
| Port | `4000` |
| Auto deploy | activé (chaque push sur `main` redéploie) |

Le service `db` n'a pas besoin de domaine : il reste sur le réseau interne de Coolify.

## 2. Les variables d'environnement

Onglet **Environment Variables**, mode **Bulk Editor**, collez le contenu de `.env.example`
puis remplacez les valeurs :

| Variable | Quoi mettre |
|---|---|
| `DB_USER` / `DB_NAME` | `rdv_user` / `rdv_app` (ou vos valeurs, identiques pour les deux services) |
| `DB_PASSWORD` | mot de passe fort — **le même** pour `api` et `db` |
| `DB_ROOT_PASSWORD` | mot de passe root MySQL, différent de `DB_PASSWORD` |
| `ADMIN_CODE` | votre code admin (ex: `0000` pour débuter, à changer ensuite) |
| `JWT_SECRET` | générer : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SMTP_HOST/PORT/SECURE/USER/PASSWORD` | votre SMTP (voir §3) |
| `MAIL_FROM` | expéditeur des emails |
| `FRONTEND_ORIGIN` | laisser `*` |

## 3. Emails (SMTP)

Les emails (confirmation de rendez-vous, notifications admin) exigent un vrai SMTP.

- **Gmail** : activer la 2FA puis créer un **mot de passe d'application** sur
  https://myaccount.google.com/apppasswords — 16 caractères, **sans espaces**.
  `SMTP_PORT=587` + `SMTP_SECURE=false` (ou `465` + `true`).
- **Autre fournisseur** (OVH, o2switch, etc.) : renseignez leurs paramètres SMTP.

Pour vérifier : espace **Administration → Responsable & capacité → « Tester l'envoi d'email »**.

## 4. Premier déploiement

Cliquez sur **Deploy**, puis vérifiez dans l'onglet **Logs** :

- `SMTP OK : connexion au serveur mail établie` (ou `SMTP INDISPONIBLE` avec le détail) ;
- `API démarrée sur le port 4000` ;
- le conteneur `db` passe **Healthy** et les tables sont créées (aucune action manuelle).

Ouvrez ensuite `https://votre-domaine` : le calendrier s'affiche.
Le code admin (`ADMIN_CODE`) donne accès à l'espace **Administration**.

## 5. Mises à jour

Envoyer les changements sur `main` : Coolify reconstruit et redémarre automatiquement.
La base `db_data` n'est jamais effacée par un redéploiement.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Site OK mais calendrier vide / erreur API | conteneur `api` pas encore `Healthy` ou `db` pas démarrée — vérifier les logs des deux services |
| Emails non reçus | `SMTP_*` invalides → tester avec le bouton « Tester l'envoi d'email » dans l'admin |
| `ECONNREFUSED` MySQL dans les logs | `DB_HOST` doit rester `db` (nom du service), ne pas le remplacer par une IP |
| Erreur CORS dans la console navigateur | `FRONTEND_ORIGIN` trop restrictif — remettre `*` |
