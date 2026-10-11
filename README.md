# BLUSH — front

Le SaaS BLUSH : une appli Next.js 16 (App Router), TypeScript et Tailwind v4, avec son back-end (les routes `/api`, Postgres et Drizzle, le modèle). En local, elle tourne sur le Postgres de la machine et le modèle factice, sans aucun appel payé (voir BACKEND.md).

```bash
brew services start postgresql@16         # le Postgres de la machine (Homebrew), s’il ne tourne pas déjà
nvm use                                   # Node 24, celui de Vercel (.nvmrc)
git submodule update --init               # les prompts (dépôt privé blush-prompts) : sans eux, npm run dev s’arrête
npm install
cp .env.example .env.development.local   # une fois : la configuration de dev, fictive
npm run dev                               # http://localhost:3000, ce poste seulement (crée et migre la base blush_dev au besoin)
```

Le code de connexion s’affiche dans le terminal (pas de Resend en local). Pour un téléphone du réseau : `npm run dev -- -H 0.0.0.0`, sans `BLUSH_APERCU` ni `BLUSH_DEMANDER` (BACKEND.md, « En local »). Avec `BLUSH_ACCES_LIBRE=*` (le réglage de `.env.example`), chaque compte a BLUSH+ : pour voir l’appli d’un compte gratuit, enlever la ligne ou la limiter à quelques emails.

## Développer, vérifier, mettre en ligne

GitHub (`blush-front`) est la seule source : on travaille sur une branche, on pousse, et la CI vérifie chaque pull request, et chaque push sur `main`.

```bash
nvm use                                 # Node 24, celui de Vercel (.nvmrc, et `engines` de package.json, que Vercel lit aussi)
git submodule update --init             # les prompts (dépôt privé blush-prompts)
npm ci
npm run check                           # types, lint, migrations, typographie, code mort (knip), tests (Postgres local : blush_test, créée au besoin)
npm run test:unit                       # seulement les tests sans base (les projets vitest « unit » et « client ») : une boucle rapide, sans Postgres
npm run e2e:build && npm run e2e        # les parcours dans Chromium et WebKit (voir BACKEND.md)
npm run todo                            # les décisions produit en attente (les TODO(produit) du code), sans rien faire échouer
```

`blush_test` sert à tous les dossiers du projet sur la machine : les tests ne la migrent que s’ils viennent de la créer. Un dossier qui ajoute une migration prend sa propre base : `DATABASE_URL_TEST=postgres://localhost:5432/blush_test_<nom> npm run check`. Une base à soi est migrée et remise à zéro à chaque lancement : ses limites et ses compteurs du jour (`rate_limits`, `counters`). Ses autres tables gardent ce que les tests y laissent : les comptes et les brouillons des fixtures (`tests/aide/fixtures.ts`) sont effacés à la fin de chaque fichier, un test qui écrit autrement efface lui-même ce qu’il crée. Les fichiers de tests avec la base passent un par un (`fileParallelism: false`).

La CI (`.github/workflows/ci.yml`), à chaque pull request et à chaque push sur `main` :

1. **Vérifications et build** : `npm run check` (dont la cohérence des migrations, `scripts/verifier-migrations.mjs`), puis le build du back-end et sa vérification qu’aucun prompt n’arrive au navigateur (`scripts/verifier-fuite.mjs` : aucune suite de 10 mots des prompts dans ce qu’il envoie, quelle que soit sa forme, échappée ou en entités HTML, et un canari qui prouve qu’elle la verrait).
2. **E2E (chromium)** et **E2E (webkit)** : chacun refait le build, puis les tests de bout en bout avec un Postgres neuf. En cas d’échec, le rapport et les traces (données de test inventées, jamais les prompts) sont dans les artefacts du run.

Les dépendances : chaque lundi, Dependabot (`.github/dependabot.yml`) ouvre une pull request pour les versions mineures et correctives des paquets npm, une par version majeure, et une pour les actions de la CI ; la CI les vérifie comme les autres. Elle lit le sous-module privé : `PROMPTS_TOKEN` doit aussi être un secret de Dependabot (Settings › Secrets and variables › Dependabot).

**La mise en production est un geste, jamais l’effet d’un push** : sur `main`, « Run workflow » dans l’onglet Actions (ou `gh workflow run CI --ref main`). Ce lancement refait les vérifications et les tests de bout en bout sur la tête de `main`, puis lance `vercel deploy --prod` : Vercel construit sur ses serveurs avec ses variables, et y migre la base. Relancer un ancien run ne redéploie pas une version passée : seule la tête de `main` part. On ne déploie plus depuis un dossier local.

Le dépôt `blush-front` est public : tout ce qu’on y commite (le code, les tests, l’historique) se lit par n’importe qui, donc rien de sensible n’y entre (ni vraie conv, ni texte des prompts). Seuls les prompts restent privés, dans le sous-module `blush-prompts`, un dépôt à part. Pas de règle de branche ni de relecteur obligatoire, et les secrets sont ceux du dépôt. La CI en lit deux, `PROMPTS_TOKEN` (un jeton GitHub qui lit `blush-front` et le sous-module privé `blush-prompts`) et `VERCEL_TOKEN`. Le build contient les prompts (côté serveur) : il ne sort jamais d’un job, aucun artefact ne le transporte, puisque les artefacts se téléchargent par quiconque lit le dépôt.

## Où sont les choses

| Dossier | Rôle |
|---|---|
| `src/app/` | Une route par écran : la landing (`/`, et `/retour`, servie à sa place quand on revient connecté), le parcours d’import (`/commencer`, `/importer`, `/qui`, `/email`), la connexion (`/connexion`), la liste d’attente de la bêta fermée (`/attente`), la lecture (`/lecture`), le verdict et le rapport (`/rapport`), l’accueil et son chat (`/app`), la fiche (`/app/fiche`), Mon compte (`/compte`), la confidentialité (`/confidentialite`), la page publique d’un verdict partagé (`/v/[id]`), et le tableau de bord de l’équipe (`/admin`, une 404 pour qui n’est pas dans `BLUSH_ADMINS`). Chaque `page.tsx` lit ses données côté serveur (`src/services/serveur.ts`), puis affiche l’écran client (`*Screen.tsx`). Les outils de l’équipe, `/styleguide` et `/apercu`, ne sont jamais en ligne. |
| `src/app/api/` | Le back-end : les routes `/api`, décrites une à une dans BACKEND.md (méthode, rôle, garde, module). |
| `src/proxy.ts` | Le proxy de Next (l’ancien middleware) : en bêta fermée, il sert à leur adresse les variantes « fermee » des pages du parcours d’arrivée. Les autres variantes (connecté ou non) sont des réécritures de `next.config.ts`. |
| `src/server/` | Le métier du back-end : la base (`db/`), ses lectures et écritures partagées (`depot.ts` : les routes et les pages ne lisent jamais la base elles-mêmes), les comptes (`comptes.ts` : le passage à BLUSH+, la pause, l’effacement), le chiffrement (`coffre.ts`, ce que garde chaque colonne chiffrée), la file des tâches (`taches.ts`, son moteur `pipeline.ts`, ses règles `chaine.ts` et ses étapes `analyse.ts`), ce que voient les écrans, en deux temps : une sortie du modèle traduite dans les types du front, sans base ni modèle (`ecrans/`, au moment où la chaîne l’écrit), puis le rapport assemblé pour l’écran d’après ce qui est lu en base, l’accès et les tâches (`presentation/`), le modèle et la voix (`ia/`), les mails, les limites (voir BACKEND.md). |
| `src/services/` | `api.ts`, le seul point de contact du navigateur avec les données (les appels aux routes `/api`) ; `serveur.ts`, les données des pages serveur, lues en base d’après les cookies de la requête ; `session.ts`, le cookie et l’en-tête qui désignent la conv ; `preparer-*.ts`, ce que le navigateur prépare avant un envoi (l’export réduit à sa conv, les captures réduites, les images d’un enregistrement d’écran). |
| `src/components/` | Le design system (`ui/`, montré sur `/styleguide`), le logo et les objets 3D en SVG (`brand/`), la coque des écrans (`shell/` : barre du haut mobile, en-tête desktop, colonne d’appoint, zone du bouton principal), la landing (`landing/`, ses textes dans `src/contenu/landing.ts`) et les écrans partagés (`screens/` : le paiement, les erreurs). |
| `src/contenu/` | Le contenu du produit : offres et prix, la règle des chapitres offerts (seul le chapitre 1, le verdict) et leurs titres (`chapitres.ts`), les libellés que le rapport pose autour des textes du modèle (`rapport.ts`), étapes de l’export et de la lecture, rubriques de la fiche, landing. Les seules données fictives de l’appli servent aux aperçus de l’équipe (`src/app/apercu`, jamais sur Vercel : `src/proxy.ts`) : ESLint refuse qu’un autre fichier les importe (et `@/mocks`, pour qu’il ne revienne pas). |
| `src/types/` | Les types du front : `Story`, `Source`, `Report`, `Chapter`, `FicheFact`, `Subscription`…, le vocabulaire du domaine (`APPLIS`, `PLANS`, `GUESSES`, `PRONOMS`…) et les codes d’erreur de l’API (`erreurs-api.ts`) |
| `src/state/` | État du parcours (choix, fichiers, devinette) gardé dans `sessionStorage`, ses règles sans React (`parcours.ts` : quand « Qui es-tu ? » est complet, ce qu’il envoie pour lancer la lecture), et les clés du navigateur que lisent aussi les aides des tests et la galerie (`cles.ts`). |
| `src/lib/` | Les petits outils des écrans : les sons, les mouvements, le cache des requêtes (`query.ts`, et ce qu’un changement de conv y relit : `requetes.ts`), les textes des erreurs (`messages-erreur.ts`), la garde de `?suite=` (`suite.ts`), l’écriture des nombres (`format.ts`)… Et les règles métier partagées avec le serveur, en modules purs (ni `server-only`, ni `client-only`) : ce que chaque plan ouvre (`acces.ts`), les tailles et bornes que le navigateur et le serveur mesurent pareil (`limites.ts`, à ne pas confondre avec les quotas anti-abus de `src/server/limites.ts`), qui est qui dans une conv (`participants.ts`, `pronom.ts`), les noms des cookies du back-end, que lisent aussi `src/proxy.ts` et `next.config.ts` (`noms-cookies.ts`). |
| `prompts/` | Le sous-module privé `blush-prompts` : les textes des prompts, leur logique partagée (`prompts/lib`, importée en `@prompts/…`) et leur banc d’essai (`prompts/evals`). Voir BACKEND.md, « Les prompts ». |
| `drizzle/` | Les migrations SQL de la base et leur journal (`meta/`). Le schéma est `src/server/db/schema.ts`, et les valeurs fermées de ses colonnes `src/server/db/enums.ts` (celles que le navigateur lit aussi : `src/types`) ; `npm run db:generer` écrit la migration qui va avec, et le build s’arrête sans elle. `npm run dev`, les tests et le build de la production (après `next build`) les appliquent d’eux-mêmes ; `npm run db:migrer` à la main, sur une autre base. |
| `tests/` | Les tests vitest (`npm test`, dans `npm run check`), en trois projets (`vitest.config.mts`) : `unit`, sans base (`tests/unit`, et les fichiers purs que la config liste), `client`, les hooks et les composants des écrans dans un DOM simulé (`tests/client`, happy-dom et @testing-library/react), et `db`, sur la base de test. Dont `documentation.test.ts` : chaque route `/api` et chaque variable d’environnement a sa ligne dans BACKEND.md. |
| `tests/e2e/` | Les tests de bout en bout (Playwright, Chromium et WebKit) et leurs aides (`tests/e2e/aide`) : voir BACKEND.md, « Les tests de bout en bout ». |
| `scripts/` | Les commandes du dépôt : `npm run dev` (`developper.mjs`), la copie des prompts côté serveur (`prompts.mjs`), les vérifications (`verifier-*.mjs` : les migrations et la typographie dans `npm run check`, la fuite des prompts après le build), les migrations du build de la production et de `npm run db:migrer` (`migrer.mjs`), l’accès donné à un compte sans paiement (`npm run acces`, `acces.mts`), la galerie (`galerie/`), le banc de fluidité de l’accueil (`fluidite/`), les essais avec le vrai modèle (`npm run essai:*`, `essai-*.mts`, et leurs outils partagés avec les tests : `tests/aide/essai.ts`), et la CLI Vercel de la mise en production, aux versions figées (`deployer/`). |

Le back-end en détail (les routes et leurs gardes, la file des tâches, les variables d’environnement, les paramètres d’URL qui relient les écrans) : BACKEND.md.

## Mise en page

- **Moins de 1024 px :** mise en page mobile. Elle est fluide sous 768 px, puis centrée sur 560 px de large au maximum.
- **À partir de 1024 px :** mise en page desktop, avec la colonne d'appoint (étapes, état de la relation ou sommaire du rapport).

## La galerie

La galerie des écrans (`scripts/galerie`) montre chaque état de chaque écran, en mobile et en ordinateur, pour les relire d’un coup (et les commenter, une fois publiée en artefact). Elle tourne sur le vrai back-end, comme les tests de bout en bout : leur build, leur serveur, une base neuve (`blush_e2e_galerie`, effacée à la fin), le modèle factice et aucune clé d’API. Chaque état prépare son propre compte par les routes `/api` et les aides des tests : une conv importée sans compte, un compte gratuit, le plan « rapport », BLUSH+, le mode sobre (une alerte dans la conv), trois convs, une conv lue « En couple ».

```bash
npm run e2e:build && npm run galerie   # .galerie/galerie.html, les captures dans .galerie/img
ONLY=13b,16d npm run galerie           # ces états seulement, les autres captures restent
npm run fluidite                       # le banc de fluidité de l’accueil (dont un vocal au micro factice) et du rapport, sur un compte BLUSH+ semé de la même façon
```

Les états sont dans `scripts/galerie/screens.mjs` : la route, le compte, les gestes, les notes à valider, et ce qui a changé depuis l’ancienne galerie ; les états retirés y sont listés, avec leur raison. Les maquettes (`../maquettes/png`, ou `MAQUETTES=<dossier>`) s’affichent à côté quand elles sont là. `E2E_PORT` (3480 par défaut, et le port suivant) et `E2E_DB` changent le port et la base : la galerie et le banc de fluidité n’acceptent qu’une base dont le nom commence par `blush_e2e_galerie` (celle qu’ils effacent à la fin), une par dossier de travail (`E2E_PORT=3700 E2E_DB=blush_e2e_galerie_<nom> npm run galerie`). Les captures se prennent dans Chromium, dans les projets `galerie-*` de `playwright.config.ts`, que seul `BLUSH_GALERIE=1` (posé par la commande) fait apparaître : `npm run e2e` et la CI ne les voient pas.

Le banc de fluidité lance le Chromium de Playwright, le navigateur complet (`npx playwright install chromium`), sur n’importe quel poste. Ses chiffres ne valent que sur une machine au repos : une autre suite de tests ou un build en parallèle les fausse (la charge se lit dans `uptime`, à comparer au nombre de cœurs).

## Les essais avec le vrai modèle

Ils paient de vrais appels (de quelques centimes à 1 $ l’essai), avec une vraie clé, sur la base de `DATABASE_URL` : une base à soi, jamais celle de la production. Avec `BLUSH_IA_FACTICE=1` à la place de la clé, ils tournent à blanc sur le modèle factice, pour vérifier un script. Les chemins se lisent depuis le dossier où la commande est tapée ; les convs et les cas, dans le banc d’essai du sous-module (`prompts/evals`).

```bash
DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:vrai-modele   # une conv courte de bout en bout (verdict, rapport, mémoire, chat), puis tout s’efface, même après une erreur
npm run essai:memoire -- <résultat 07 .json> <echanges .json> <cas .json>     # les mises à jour de la mémoire, échange par échange, et leur coût
npm run essai:ajouts -- <résultat 07 .json> <suite .txt> [ligne de profil…]   # des messages ajoutés après l’import : la réponse du chat, puis la mémoire
npm run essai:captures -- <dossier des captures> [ordre]                        # la lecture des captures (prompt 01), comparée à sa vérité s’il y en a une
```
