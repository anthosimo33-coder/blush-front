<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mise en production : seulement par la CI

- Ne jamais lancer `vercel deploy` (ni `vercel --prod`) depuis un dossier local. GitHub est la seule source : on pousse une branche, la CI (`.github/workflows/ci.yml`) la vérifie.
- Un push sur `main` ne déploie rien. La mise en production se lance à la main, avec l’accord de l’utilisateur : « Run workflow » sur `main`, ou `gh workflow run CI --ref main`. La CI refait alors toutes les vérifications sur la tête de `main`, puis déploie.
- Avant de pousser : `npm run check` (types, lint, mise en forme, migrations, typographie, code mort, tests et leur couverture), puis `npm run e2e:build && npm run e2e` si l’appli a changé. Un code mal mis en forme : `npm run forme:ecrire`.

# En local : le vrai back-end, le modèle factice

- L’appli a toujours son back-end : en local, le Postgres de la machine et le modèle factice (`BLUSH_IA_FACTICE=1`), jamais une vraie clé d’API ni la base de la production. `cp .env.example .env.development.local` une fois, puis `npm run dev` (README, BACKEND.md).
- Une base à soi par dossier de travail : `DATABASE_URL=postgres://localhost:5432/blush_dev_<nom> npm run dev`, `DATABASE_URL_TEST=…/blush_test_<nom> npm run check`, `E2E_PORT=<port> E2E_DB=blush_e2e_<nom> npm run e2e` (la galerie et le banc de fluidité : `E2E_DB=blush_e2e_galerie_<nom>`). On efface ses bases à la fin.
- Un état à montrer (un compte gratuit, un rapport débloqué, le mode sobre, plusieurs convs) se prépare comme dans les tests de bout en bout, par les routes `/api` et `tests/e2e/aide` : la galerie des écrans le fait pour chaque état (`npm run e2e:build && npm run galerie`, README « La galerie »).
- Un test avec la base (le projet `db` de `vitest.config.mts`) crée ses comptes et ses convs par `tests/aide/fixtures.ts` (`compteDeTest`, `histoireLue`… : effacés à la fin du fichier, sans `afterAll` à écrire), change le modèle factice par `facticePourChaqueTest` ou `avecFactice` (jamais `definirFactice` à la main), lit ce qu’il écrit et ses déclencheurs dans `FACTICE` (`src/server/ia/factice-valeurs.ts`, jamais recopiés), et fabrique les sorties des prompts par `tests/aide/fabriques.ts`, sans cast. Il passe seul (`-t`) comme dans n’importe quel ordre (`--sequence.shuffle.tests`) : ce qu’il change en route (un plafond, un cookie, un `fetch` simulé), il le pose lui-même et le retire même s’il échoue. Le vrai chemin d’un appel au modèle (hors du mode factice, sans base) se teste en changeant de prestataire par `definirFournisseur`, ou par le vrai client du SDK sur un faux `fetch` (`tests/unit/claude.test.ts`).
- Le contenu du produit vit dans `src/contenu` (dont la règle des chapitres offerts, `chapitres.ts`). Les données fictives ne servent qu’aux tests, à la galerie et aux aperçus de l’équipe (`/apercu`, jamais sur Vercel : `src/proxy.ts`).

# Conventions BLUSH

- Tout en français : les noms du code, les commentaires (aussi denses que ceux d’à côté), les messages de commit (avec la ligne `Co-Authored-By` de l’agent) et les textes de l’appli.
- Les textes affichés, dans l’appli comme dans ses mails : une insécable U+00A0 avant ? ! : ; » et après «, écrite `{NBSP}` (`src/lib/format.ts`) entre deux morceaux du JSX et `\u00a0` dans une chaîne ou un gabarit (jamais en clair, ni `&nbsp;`, ni une constante à soi) ; des apostrophes courbes (’), et aucun nom d’IA ni de prestataire d’IA ou de voix (Claude, Anthropic, ElevenLabs, Mistral…), page de confidentialité comprise : « une IA », « notre prestataire de voix ». Seul le tableau de bord `/admin`, réservé à l’équipe, peut les nommer. Les autres prestataires (l’hébergement, la base, les mails : Vercel, Neon, Resend) sont nommés sur la page de confidentialité.
- Le dépôt est public : ni vraie conv, ni vrai prénom, ni texte de prompt. Les exemples sont inventés, et les prompts restent dans le sous-module privé `prompts/`.
- Une refonte est une proposition : l’ancienne version reste en place (ou à côté, sur une route à part) jusqu’à la décision de l’utilisateur, et la galerie montre les deux.
- `/apercu` et `/styleguide` sont des outils de l’équipe : jamais en ligne.
- Avant d’utiliser une API de Next : son guide dans `node_modules/next/dist/docs/` (voir le bloc du haut).
- Un `/** */` documente la déclaration collée sous lui, et elle seule : c’est lui que montre le survol de l’éditeur. Un en-tête de fichier ou une remarque s’écrit en `/* */`.
- Une décision produit en attente s’écrit `TODO(produit): …` dans le code ; `npm run todo` les liste.
- Une route `/api` ou une variable d’environnement arrive avec sa ligne dans BACKEND.md : `tests/documentation.test.ts` échoue sinon.
- Une route ou une page ne lit pas la base elle-même : elle passe par `src/server` (le dépôt `depot.ts`, les comptes `comptes.ts`, ou le module de son domaine). ESLint refuse `src/server/db` et `drizzle-orm` dans `src/app`.
- Une migration s’écrit par `npm run db:generer`, jamais à la main, et se régénère après un rebase (ou une fusion) qui en apporte d’autres : sinon la production la sauterait (BACKEND.md, « Les migrations »).
- Avant de rendre la main : `npm run check`. Il lance aussi les insécables et les caractères invisibles (`scripts/verifier-typo.mjs`), et le code mort (`npm run mort`, knip, `knip.jsonc`).

## Le glossaire du code

- **conv** dans le code, « histoire » seulement dans les textes affichés ; la table reste `stories`. Le code dit encore `story`, `histoire` ou `conv` pour la même chose : les renommages se feront d’un bloc, pas au passage.
- Les types du front sont en anglais (`Story`, `Report`, `Chapter`, dans `src/types`), le domaine du serveur en français (`conv`, `tache`, `memoire`, `verdict`, dans `src/server`). Les `histoire` du serveur (`histoires.ts`, `histoireOuverte`) font partie des renommages à venir.
- Le suffixe d’un schéma de sortie est le numéro de son prompt : `Sortie04` (le verdict), `Etape05` et `Sortie05` (le rapport), `Sortie07` et `Maj07` (la mémoire).
- « elle » désigne l’autre personne, quel que soit son pronom (à l’écran, « il » ou « elle » d’après `pronom`).
- **moi** / **autre** : celui qui importe sa conv, et la personne dont il parle.
- **offre** / **achat** / **bulle** : ce qu’on achète une fois (le catalogue, `src/contenu/offres.ts`), sa commande payée (`achats`), et ce que coûte une réponse de BLUSH (`src/server/bulles.ts`). Plus de plan : le rapport se débloque conv par conv (`stories.debloque_le`), les droits se lisent dans `src/server/droits.ts`. Le plan du rapport (prompt 05) est le seul sens du mot qui reste.
- **tâche** / **étape** : une ligne de la table `tasks`, avec ses essais, et le travail qu’elle fait (son genre : `verdict`, `rapport_plan`…, voir BACKEND.md, « Les tâches »).
