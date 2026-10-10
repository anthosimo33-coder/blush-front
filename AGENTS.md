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
- Une base à soi par dossier de travail : `DATABASE_URL=postgres://localhost:5432/blush_dev_<nom> npm run dev`, `DATABASE_URL_TEST=…/blush_test_<nom> npm run check`, `E2E_PORT=<port> E2E_DB=blush_e2e_<nom> npm run e2e` (la galerie et le banc de fluidité : `E2E_DB=blush_e2e_galerie_<nom>`). On efface ses bases à la fin.
- Un état à montrer (un compte gratuit, BLUSH+, le mode sobre, plusieurs convs) se prépare comme dans les tests de bout en bout, par les routes `/api` et `tests/e2e/aide` : la galerie des écrans le fait pour chaque état (`npm run e2e:build && npm run galerie`, README « La galerie »).
- Le contenu du produit vit dans `src/contenu` (dont la règle des chapitres offerts, `chapitres.ts`). Les données fictives ne servent qu’aux tests, à la galerie et aux aperçus locaux (`/apercu`, 404 en production).

# Conventions BLUSH

- Tout en français : les noms du code, les commentaires (aussi denses que ceux d’à côté), les messages de commit (avec la ligne `Co-Authored-By` de l’agent) et les textes de l’appli.
- Les textes affichés : une insécable U+00A0 (`\u00a0` dans une chaîne) avant ? ! : ; » et après «, des apostrophes courbes (’), et aucun nom d’IA ni de prestataire (Claude, Anthropic, ElevenLabs, Mistral…), page de confidentialité comprise : « une IA », « notre prestataire de voix ».
- Le dépôt est public : ni vraie conv, ni vrai prénom, ni texte de prompt. Les exemples sont inventés, et les prompts restent dans le sous-module privé `prompts/`.
- Une refonte est une proposition : l’ancienne version reste en place (ou à côté, sur une route à part) jusqu’à la décision de l’utilisateur, et la galerie montre les deux.
- `/apercu` et `/styleguide` sont des outils de l’équipe : jamais en ligne.
- Avant d’utiliser une API de Next : son guide dans `node_modules/next/dist/docs/` (voir le bloc du haut).
- Un `/** */` documente la déclaration collée sous lui, et elle seule : c’est lui que montre le survol de l’éditeur. Un en-tête de fichier ou une remarque s’écrit en `/* */`.
- Une décision produit en attente s’écrit `TODO(produit): …` dans le code ; `npm run todo` les liste.
- Une route `/api` ou une variable d’environnement arrive avec sa ligne dans BACKEND.md : `tests/documentation.test.ts` échoue sinon.
- Avant de rendre la main : `npm run check`.

## Le glossaire du code

- **conv** dans le code, « histoire » seulement dans les textes affichés ; la table reste `stories`. Le code dit encore `story`, `histoire` ou `conv` pour la même chose : les renommages se feront d’un bloc, pas au passage.
- Les types du front sont en anglais (`Story`, `Report`, `Chapter`, dans `src/types`), le domaine du serveur en français (`histoire`, `tache`, `memoire`, dans `src/server`).
- Le suffixe d’un schéma de sortie est le numéro de son prompt : `Sortie04` (le verdict), `Etape05` et `Sortie05` (le rapport), `Sortie07` et `Maj07` (la mémoire).
- « elle » désigne l’autre personne, quel que soit son pronom (à l’écran, « il » ou « elle » d’après `pronom`).
- **moi** / **autre** : celui qui importe sa conv, et la personne dont il parle.
- **plan** / **offre** : ce que le compte a (`gratuit`, `rapport`, `blushplus`), et ce qu’on achète pour l’avoir (`src/contenu/offres.ts`). Le plan du rapport (prompt 05) est un autre sens du mot.
- **tâche** / **étape** : une ligne de la table `tasks`, avec ses essais, et le travail qu’elle fait (son genre : `verdict`, `rapport_plan`…, voir BACKEND.md, « Les tâches »).
