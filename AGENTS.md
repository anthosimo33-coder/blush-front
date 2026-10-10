<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mise en production : seulement par la CI

- Ne jamais lancer `vercel deploy` (ni `vercel --prod`) depuis un dossier local. GitHub est la seule source : on pousse une branche, la CI (`.github/workflows/ci.yml`) la vérifie.
- Un push sur `main` ne déploie rien. La mise en production se lance à la main, avec l’accord de l’utilisateur : « Run workflow » sur `main`, ou `gh workflow run CI --ref main`. La CI refait alors toutes les vérifications sur la tête de `main`, puis déploie.
- Avant de pousser : `npm run check` (types, lint, migrations, tests), puis `npm run e2e:build && npm run e2e` si l’appli a changé.

# En local : le vrai back-end, le modèle factice

- L’appli a toujours son back-end : en local, le Postgres de la machine et le modèle factice (`BLUSH_IA_FACTICE=1`), jamais une vraie clé d’API ni la base de la production. `cp .env.example .env.development.local` une fois, puis `npm run dev` (README, BACKEND.md).
- Une base à soi par dossier de travail : `DATABASE_URL=postgres://localhost:5432/blush_dev_<nom> npm run dev`, `DATABASE_URL_TEST=…/blush_test_<nom> npm run check`, `E2E_PORT=<port> E2E_DB=blush_e2e_<nom> npm run e2e`. On efface ses bases à la fin.
- Un état à montrer (un compte gratuit, BLUSH+, le mode sobre, plusieurs convs) se prépare comme dans les tests de bout en bout, par les routes `/api` et `tests/e2e/aide` : la galerie des écrans le fait pour chaque état (`npm run e2e:build && npm run galerie`, README « La galerie »).
- Le contenu du produit vit dans `src/contenu` (dont la règle des chapitres offerts, `chapitres.ts`). Les données fictives ne servent qu’aux tests, à la galerie et aux aperçus locaux (`/apercu`, 404 en production).
