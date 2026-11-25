# Application de prise de rendez-vous

Application complète : calendrier public de réservation + espace administrateur protégé par code,
notifications email automatiques (Nodemailer), base de données MySQL, à déployer derrière Apache.

## Règles de fonctionnement

> Cette section décrit, sans termes techniques, comment fonctionne le service de prise de
> rendez-vous. Elle peut être lue ou transmise telle quelle à la direction.
>
> - Site public : https://meet.rgzsarl.tech
> - Espace d'administration : https://meet.rgzsarl.tech/admin

### 1. Le principe

1. Le visiteur choisit un **jour disponible** dans le calendrier et remplit un formulaire
   (nom, prénom, téléphone, email).
2. Il envoie une **demande**. Ce n'est pas encore un rendez-vous confirmé.
3. Le responsable reçoit un email, puis **accepte** ou **refuse** la demande depuis l'espace
   d'administration.
4. Le visiteur reçoit un email dans les deux cas. En cas d'acceptation, l'email indique
   **l'heure**, la **durée** et le **responsable** du rendez-vous.

Le visiteur ne choisit donc qu'un **jour**. C'est le responsable qui fixe l'heure au moment
d'accepter.

### 2. Les places disponibles

| Règle | Détail |
|---|---|
| **Nombre maximum par jour** | Fixé dans *Réglages généraux* (3 par défaut). Il s'applique à tous les jours ouverts. |
| **Une place est prise dès la demande** | Une demande **en attente** occupe déjà sa place, sans attendre qu'elle soit acceptée. Avec un maximum de 4, la 5ᵉ personne ne peut plus demander ce jour-là, même si aucune demande n'a encore été acceptée. |
| **Une place se libère** | Quand le responsable **refuse** la demande, quand le visiteur **annule** lui-même, ou quand la demande est **supprimée**. |
| **Jour « Complet »** | Le jour ne peut plus être demandé. Le calendrier public affiche le nombre de **places restantes** (« 2 places », « 1 place » en orange, « Complet »). |
| **Demandes simultanées** | Si plusieurs personnes valident au même instant pour la dernière place, **une seule** l'obtient. Les autres reçoivent « Journée complète ». |
| **Dates passées** | Impossible de demander une date passée. Le jour même reste possible tant qu'il reste de la place. |
| **Heure de référence** | Heure du Bénin pour toutes les dates et tous les délais. |

### 3. Jours fermés et exceptions

| Réglage (espace admin) | Effet |
|---|---|
| **Jours fermés récurrents** (*Réglages généraux*) | Ces jours de la semaine ne sont jamais ouverts (par défaut : le dimanche). |
| **Bloquer une période** (*Congés & exceptions*) | Aucune demande possible sur ces dates (congés, jour férié, déplacement…). Pour un seul jour, laisser la date de fin vide. Le **motif** est une note interne : il n'est **jamais montré** au public. |
| **Règle spéciale par date** (*Congés & exceptions*) | Les jours restent ouverts, mais avec un **autre maximum** et/ou un **autre responsable**, qui recevra alors les emails de ces jours-là. Sans règle spéciale, le réglage général s'applique. |

Bloquer une période n'annule pas les demandes déjà reçues pour ces dates : il faut les refuser
une par une si nécessaire.

### 4. Une seule demande à la fois par personne

Pour éviter qu'une même personne bloque plusieurs places ou plusieurs jours :

- une personne ne peut avoir **qu'une seule demande active** à la fois (en attente ou acceptée,
  pour une date à venir) ;
- une « même personne », c'est le **même email** ou le **même numéro de téléphone**, quelle que soit
  la façon de l'écrire (`+229 01 11 22 33 44`, `0111223344`… sont reconnus comme identiques) ;
- elle pourra refaire une demande quand la précédente sera **passée**, **refusée** ou **annulée**.

Le message affiché au visiteur lui indique la date de sa demande en cours.

### 5. Annulation par le visiteur

- Chaque email **« Demande reçue »** et **« Rendez-vous confirmé »** contient un bouton
  **« Annuler mon rendez-vous »**, avec un lien personnel et secret, impossible à deviner.
- Ce lien ouvre une page qui affiche le rendez-vous. L'annulation ne se fait qu'après un clic sur
  **« Confirmer l'annulation »** : ouvrir le lien seul n'annule rien.
- **Délai** : annulation en ligne possible jusqu'à **24 h avant** le rendez-vous. Pour une demande
  encore en attente (sans heure fixée), c'est jusqu'à **la veille à minuit**. Passé ce délai, la
  page invite le visiteur à contacter l'entreprise par email ou par téléphone.
- L'annulation est **définitive**. La place est **libérée immédiatement** pour quelqu'un d'autre.
- **Limite** : après **2 annulations en 30 jours**, la réservation en ligne est **suspendue** pour
  cette personne (même email ou même téléphone). Elle doit alors contacter l'entreprise. La
  suspension se lève d'elle-même quand ses annulations ont plus de 30 jours.
- Les demandes faites **avant la mise en place de l'annulation en ligne** (25 novembre 2026)
  n'ont pas de lien : ces visiteurs doivent contacter l'entreprise.

**Pour la direction : aucune action à faire.** Le responsable reçoit un email d'information, et la
demande apparaît dans l'admin avec le statut **« Annulé par le client »**. Un rendez-vous annulé
ne peut plus être accepté par erreur.

### 6. Le travail du responsable (espace admin)

| Action | Ce qui se passe |
|---|---|
| **Accepter** | Cliquer sur « Accepter » ouvre un formulaire au nom du visiteur : choisir l'**heure de début** (une heure déjà passée est refusée), la **durée** (15 min à 2 h) et le **responsable**. Par défaut, c'est le responsable de la **règle spéciale** du jour s'il y en a une, sinon le **responsable général**. Le visiteur reçoit par email la date, l'heure, la durée et le nom du responsable. |
| **Conflit d'horaire** | Si le responsable choisi a déjà un rendez-vous accepté qui **chevauche** ce créneau, l'acceptation est refusée. Exemple : 9 h 00–10 h 00 déjà pris, alors 9 h 30 est refusé, mais 10 h 00 est accepté. |
| **Refuser** | Le visiteur reçoit un email de refus, et la place se libère. |
| **Rétablir** | Sur une demande **refusée** ou **annulée par le client** (refus par erreur, client qui rappelle…) : elle redevient **« En attente »** et l'admin l'accepte ensuite normalement (l'heure et la durée déjà connues sont reproposées). C'est refusé si la date est passée, si le jour est désormais fermé ou bloqué, si la journée est complète (place reprise entre-temps) ou si la personne a déjà une autre demande en cours. Une annulation rétablie ne compte plus dans la limite des 2 annulations du client. Aucun email n'est envoyé au rétablissement ; le client reçoit la confirmation habituelle quand la demande est acceptée. |
| **Supprimer** | La demande est effacée définitivement (après confirmation). La place se libère. |
| **Suivre** | La colonne **Créneau** du tableau affiche l'horaire et le responsable de chaque rendez-vous accepté (ex. « 09:00–09:30 · Nadhir »). Une **pastille rouge** sur l'onglet *Rendez-vous* indique le nombre de demandes en attente. **La page se met à jour toute seule** (toutes les 20 secondes, et dès qu'on revient sur l'onglet) : une nouvelle demande apparaît sans actualiser, avec une notification et le nombre de demandes en attente dans le titre de l'onglet du navigateur (« (2) Admin… »). Ce qui est en cours de saisie n'est jamais effacé. Le bloc **Activité** (*Réglages généraux*) résume : demandes à traiter, rendez-vous à venir, annulations des 30 derniers jours, remplissage des 7 prochains jours. |
| **Filtrer** | Cliquer sur un jour du calendrier affiche ses rendez-vous (recliquer pour tout réafficher). Filtre par statut : en attente, acceptés, refusés, annulés par le client. |

Sur téléphone, les rubriques de l'admin sont regroupées dans un **menu ☰**.

### 7. Emails envoyés automatiquement

| Événement | Le visiteur reçoit | Le responsable reçoit |
|---|---|---|
| Nouvelle demande | Accusé de réception + lien d'annulation | « Nouvelle demande » avec les coordonnées du visiteur |
| Demande acceptée | Confirmation : date, heure, durée, responsable + lien d'annulation | Récapitulatif du rendez-vous accepté |
| Demande refusée | Email de refus, avec invitation à choisir une autre date | — |
| Annulation par le visiteur | Confirmation de l'annulation | Information « aucune action nécessaire » |

Le **responsable** qui reçoit les emails est celui de la **règle spéciale** du jour s'il y en a
une, sinon le **responsable général** (*Réglages généraux*). **Si aucun email de responsable
n'est renseigné, personne n'est prévenu des nouvelles demandes.**

### 8. Accès à l'administration

- L'espace admin est protégé par un **code d'accès**.
- Le code se change dans *Réglages généraux* › **Code d'accès admin**. Le **code actuel** est
  demandé.
- Une connexion reste valable **12 heures**, après quoi il faut ressaisir le code.
- Après **10 codes erronés en 15 minutes**, les tentatives sont bloquées temporairement.

### 9. Protections du formulaire public

- Les champs sont vérifiés : email valide, numéro de téléphone valide, nom et prénom de 80
  caractères maximum.
- Une même connexion internet est limitée à **20 demandes par heure**, contre les envois en masse.
- Le texte saisi par les visiteurs est toujours affiché comme du texte simple : il ne peut pas
  exécuter de code dans l'espace admin ni dans les emails.

### 10. Données personnelles

- Données collectées : nom, prénom, téléphone, email et date souhaitée. Rien d'autre (pas de
  cookie publicitaire ni de suivi).
- Elles ne servent qu'à traiter les demandes de rendez-vous.
- Une **politique de confidentialité** et des **conditions d'utilisation** sont accessibles en bas
  de chaque page. Elles citent la loi n° 2017-20 (Code du numérique du Bénin) et l'APDP.

> **À valider par la direction :** la politique de confidentialité annonce une conservation des
> données de **12 mois après le rendez-vous** et mentionne **RGZ SARL** comme responsable. La
> suppression automatique après 12 mois **n'est pas encore en place** : à ajouter, ou bien la
> durée annoncée est à modifier.

## Fonctionnalités
- Calendrier responsive (mobile / tablette / desktop)
- Blocage de journées fixes de la semaine (ex: dimanche)
- Blocage d'une **période** précise (date début → date fin) ou d'une **journée unique**, avec motif
- **Règles spéciales par date ou période** : sur une date ou une période précise, définir un nombre
  max de rendez-vous différent du réglage global, et/ou un **responsable dédié** (nom + email) qui
  recevra les notifications pour ces jours-là. Si rien n'est défini, le réglage global s'applique.
- Accès admin protégé par **code secret** (hashé en bcrypt, jamais stocké en clair), avec bouton pour
  quitter l'écran de connexion sans se connecter
- Boîtes de confirmation avant toute suppression (rendez-vous, période bloquée, règle spéciale) et
  avant la déconnexion, plus des notifications de succès à la connexion / déconnexion
- Envoi automatique d'email au responsable à chaque demande + accusé de réception au client
- L'admin peut **accepter** ou **refuser** une demande → email automatique envoyé au client
- Changement du code d'accès admin depuis l'espace admin (Réglages généraux), code actuel exigé
- **Annulation en ligne par le client** (lien personnel dans les emails, jusqu'à 24 h avant), place libérée automatiquement
- **Règles anti-abus** : une seule demande active par personne (email ou téléphone), suspension après 2 annulations en 30 jours
- Politique de confidentialité et conditions d'utilisation (pied de page)
- Voir **Règles de fonctionnement** ci-dessus pour le détail complet
- Filtrage des rendez-vous par jour précis, par période, par statut, avec un bouton "Aujourd'hui"
- Stockage MySQL (aucune donnée en localStorage côté client, tout passe par l'API)

## 1. Base de données MySQL

```bash
mysql -u root -p < backend/db/schema.sql
# créez un utilisateur dédié (recommandé) :
mysql -u root -p -e "CREATE USER 'rdv_user'@'localhost' IDENTIFIED BY 'un_mot_de_passe_fort';
GRANT ALL PRIVILEGES ON rdv_app.* TO 'rdv_user'@'localhost'; FLUSH PRIVILEGES;"
```

Si votre base existe déjà (mise à jour d'une installation précédente), `schema.sql` peut être rejoué
sans risque : toutes les tables utilisent `CREATE TABLE IF NOT EXISTS`, y compris la nouvelle table
`date_overrides` qui sera simplement ajoutée sans toucher aux données existantes.

## 2. Backend (API Node/Express)

```bash
cd backend
cp .env.example .env
# éditez .env : identifiants MySQL, SMTP, ADMIN_CODE (code admin initial), JWT_SECRET
npm install
npm start        # ou: npm run dev pendant le développement
```

Au tout premier démarrage, si `admin_code_hash` est vide en base, le serveur hache automatiquement
la valeur de `ADMIN_CODE` et l'enregistre. C'est ce code que vous utiliserez pour accéder à
l'espace Administration. Pour le changer ensuite, appelez (une fois connecté) :
`POST /api/admin/change-code` avec `{ "newCode": "..." }`.

### SMTP
Renseignez un compte SMTP réel dans `.env` (ex: un compte dédié, ou un service comme celui de votre
hébergeur/registrar). Sans SMTP valide, les emails échoueront **silencieusement côté client/serveur**
(l'erreur est juste loguée côté serveur avec `console.error`, ça ne bloque jamais une réservation).

**Erreur `Invalid login: 535-5.7.8 Username and Password not accepted` (Gmail) :**
C'est presque toujours l'une de ces deux causes, dans cet ordre de fréquence :
1. **Le mot de passe d'application contient encore des espaces.** Google l'affiche en 4 groupes de
   4 caractères (ex. `abcd efgh ijkl mnop`) pour la lisibilité, mais si vous le recopiez tel quel
   (avec les espaces, éventuellement entre guillemets) dans `SMTP_PASSWORD`, Gmail le refuse. Le
   serveur nettoie maintenant automatiquement les guillemets et les espaces de `SMTP_USER` /
   `SMTP_PASSWORD` avant de s'en servir (voir `cleanEnv()` dans `server.js`), donc ce cas précis est
   corrigé même si vous ne changez rien au `.env` — mais il est plus propre de le corriger directement :
   `SMTP_PASSWORD=abcdefghijklmnop` (sans espaces, sans guillemets).
2. **Le mot de passe d'application n'est plus valide** (révoqué, mal copié, ou la validation en 2
   étapes n'est pas activée sur le compte Gmail — les mots de passe d'application n'existent que si
   la 2FA est active). Retournez sur https://myaccount.google.com/apppasswords, supprimez l'ancien et
   regénérez-en un nouveau spécifiquement pour "Mail", puis recollez-le dans `.env`.

**Pour vérifier que c'est résolu, dans cet ordre :**
1. **Au redémarrage du serveur**, un message `SMTP OK : connexion...` ou `SMTP INDISPONIBLE : ...`
   s'affiche automatiquement dans les logs (`npm start` / `journalctl -u rdv-api -f` en systemd).
2. Faites une demande de rendez-vous de test : le responsable et le client doivent recevoir un email.
   En cas d'échec, l'erreur exacte est écrite dans les journaux du serveur (l'API ne plante jamais).
3. **L'email du responsable doit être renseigné** dans Administration → Responsable & capacité. S'il
   est vide, aucun email de nouvelle demande n'est envoyé — c'est la cause la plus fréquente d'un
   "responsable qui ne reçoit rien" une fois le SMTP réparé.
4. Vérifiez que `SMTP_PORT=465` va avec `SMTP_SECURE=true`, et `SMTP_PORT=587` avec `SMTP_SECURE=false`
   (mélanger les deux est une autre source classique d'échec de connexion).

## 3. Frontend

`frontend/index.html` est un fichier statique, sans build. Servez-le simplement avec Apache :

```apache
# /etc/apache2/sites-available/rdv.conf
<VirtualHost *:80>
    ServerName rdv.votre-domaine.tld
    DocumentRoot /var/www/rdv-app/frontend

    <Directory /var/www/rdv-app/frontend>
        AllowOverride All
        Require all granted
    </Directory>

    # Reverse proxy vers l'API Node (doit tourner sur 127.0.0.1:4000)
    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:4000/api
    ProxyPassReverse /api http://127.0.0.1:4000/api
</VirtualHost>
```

Activez les modules nécessaires puis rechargez Apache :
```bash
sudo a2enmod proxy proxy_http
sudo a2ensite rdv.conf
sudo systemctl reload apache2
```

Pensez au HTTPS (ex: `certbot --apache`) pour protéger le code admin en transit.

## 4. Garder l'API en vie (systemd)

```ini
# /etc/systemd/system/rdv-api.service
[Unit]
Description=API prise de rendez-vous
After=network.target mysql.service

[Service]
WorkingDirectory=/var/www/rdv-app/backend
ExecStart=/usr/bin/node server.js
Restart=always
EnvironmentFile=/var/www/rdv-app/backend/.env
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rdv-api
```

## Sécurité
- Le code admin n'est jamais stocké en clair (bcrypt).
- Les routes `/api/admin/*` exigent un token JWT valide (12h), obtenu via `/api/admin/login`.
- Limitation de débit (`express-rate-limit`) sur la connexion admin et sur la création de rendez-vous
  pour limiter les abus / brute-force.
- Pensez à mettre `FRONTEND_ORIGIN` dans `.env` à l'URL exacte de votre site en production (CORS).

## Pistes d'amélioration possibles
- Rappel automatique par email 24h avant un rendez-vous accepté (via une tâche cron qui interroge `/api/admin/bookings`)
- Export CSV des rendez-vous depuis l'espace admin
- Plusieurs comptes admin nominatifs (au lieu d'un code partagé) si plusieurs personnes gèrent l'agenda
- SMS de rappel (Twilio ou autre) en plus de l'email# gestion_rdv
# gestion_rdv
