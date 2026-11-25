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

Dans la fiche de la base, copiez **« MySQL URL (internal) »** et collez-la telle quelle dans la
variable `DATABASE_URL` de l'application (§3). C'est la seule variable nécessaire pour la base :

```
DATABASE_URL=mysql://utilisateur:mot_de_passe@nom-du-conteneur:3306/nom_de_la_base
```

> Cette URL contient le mot de passe : elle se met **uniquement** dans Coolify, jamais dans un
> fichier du dépôt.

> En local (sans Docker), `backend/.env` peut toujours utiliser `DB_HOST`, `DB_USER`,
> `DB_PASSWORD`, `DB_NAME` séparément : voir `backend/.env.example`.

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

- `DATABASE_URL` : l’URL interne de la base MySQL (§1) ;
- `ADMIN_CODE` : code d'accès à l'espace Administration ;
- `JWT_SECRET` : générer une fois avec
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, ne plus changer ;
- `SMTP_*` / `MAIL_FROM` : voir §4.

## 4. Emails (SMTP)

Les emails (confirmation de rendez-vous, notifications admin) exigent un vrai SMTP.

- **Gmail** : activer la 2FA puis créer un **mot de passe d'application** sur
  https://myaccount.google.com/apppasswords — 16 caractères, **sans espaces**.
  Le port 587 / `secure=false` est la valeur par défaut du serveur : rien à configurer.
- **Autre fournisseur** (OVH, o2switch, etc.) : adaptez `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASSWORD` dans les variables d'environnement.

Pour vérifier : au démarrage, les journaux d'exécution affichent `SMTP OK` ou `SMTP INDISPONIBLE` avec le détail de l'erreur.

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
| `Échec de l’initialisation de la base` | `DATABASE_URL` incorrecte → recopier « MySQL URL (internal) » depuis la fiche de la base Coolify |
| Site OK mais calendrier vide / erreur API | conteneur pas encore démarré ou base injoignable — vérifier les logs |
| Emails non reçus | `SMTP_*` invalides → regarder la ligne `SMTP OK` / `SMTP INDISPONIBLE` dans les journaux d'exécution |
| Erreur CORS dans la console navigateur | rare : une variable `FRONTEND_ORIGIN` a été ajoutée dans Coolify — la supprimer (par défaut : `*`) |
| Redémarrage en boucle, `getaddrinfo EAI_AGAIN <hôte>` | l'appli n'est pas sur le réseau de la base : vérifier `networks: [coolify]` dans `docker-compose.yml` |
| « Bad Gateway » alors que les logs sont bons | mauvais port : *Domains* › « Internal port » doit valoir **4000** (Coolify met 3000 par défaut) |
