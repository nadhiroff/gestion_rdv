# Règles du projet

## Git

- **À chaque modification de fichier, faire `git add` + `git commit` + `git push` sur `main`** sans attendre qu'on le demande. Le dépôt GitHub (`nadhiroff/gestion_rdv`) doit toujours refléter l'état local.
- Avant de pousser, vérifier `git status` et `git pull --rebase` si le remote a avancé.
- Ne jamais commiter de secrets : `.env` et `backend/.env` sont dans `.gitignore`.

## Déploiement

- Production : Coolify (VPS Hostinger) via `docker-compose.yml` à la racine.
- Guide complet : `DEPLOIEMENT.md`. Variables : `.env.example` racine.
- Services : `api` (Node, port 4000, sert aussi le frontend) + `db` (MySQL 8.4).
