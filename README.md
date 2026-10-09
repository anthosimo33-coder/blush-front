# BLUSH — front

Front du SaaS BLUSH : Next.js 16 (App Router), TypeScript et Tailwind v4. Il tourne entièrement sur des données factices : pas de back-end, pas de réseau.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Développer, vérifier, mettre en ligne

GitHub (`blush-front`) est la seule source : on travaille sur une branche, on pousse, et la CI vérifie chaque push.

```bash
nvm use                                 # Node 24, celui de Vercel (.nvmrc)
git submodule update --init             # les prompts (dépôt privé blush-prompts)
npm ci
npm run check                           # types, lint, migrations, tests (Postgres local : blush_test, créée au besoin)
npm run e2e:build && npm run e2e        # les parcours dans Chromium et WebKit (voir BACKEND.md)
```

`blush_test` sert à tous les dossiers du projet sur la machine : les tests ne la migrent que s’ils viennent de la créer. Un dossier qui ajoute une migration prend sa propre base : `DATABASE_URL_TEST=postgres://localhost:5432/blush_test_<nom> npm run check`.

La CI (`.github/workflows/ci.yml`), à chaque push et chaque pull request :

1. **Vérifications et build** : `npm run check` (dont la cohérence des migrations, `scripts/verifier-migrations.mjs`), puis le build du back-end et sa vérification qu’aucun prompt n’arrive au navigateur (`scripts/verifier-fuite.mjs`).
2. **E2E (chromium)** et **E2E (webkit)** : les tests de bout en bout sur ce build, avec un Postgres neuf. En cas d’échec, le rapport et les traces sont dans les artefacts du run.

**La mise en production est un geste, jamais l’effet d’un push** : sur `main`, « Run workflow » dans l’onglet Actions (ou `gh workflow run CI --ref main`). Ce lancement refait les vérifications et les tests de bout en bout sur la tête de `main`, puis lance `vercel deploy --prod` : Vercel construit sur ses serveurs avec ses variables, et y migre la base. Relancer un ancien run ne redéploie pas une version passée : seule la tête de `main` part. On ne déploie plus depuis un dossier local.

Le dépôt est privé, sur GitHub Free : pas de règle de branche ni de relecteur obligatoire, et les secrets sont ceux du dépôt. La CI en lit deux, `PROMPTS_TOKEN` (un jeton GitHub qui lit `blush-front` et `blush-prompts`) et `VERCEL_TOKEN`. L’artefact `build-e2e` d’un run (gardé un jour) contient les prompts, côté serveur : donner l’accès à `blush-front`, c’est donner les prompts. Si un collaborateur arrive un jour, chaque job E2E construira avec le sous-module au lieu de recevoir ce build.

## Où sont les choses

| Dossier | Rôle |
|---|---|
| `src/app/` | La landing (`/`), une route par écran (01 à 20), plus `/styleguide`. L'écran 14 (son message) vit désormais dans le chat de l'accueil (`/app`) ; l'écran 15 (relire ma réponse) a été retiré ; l'écran 17 (ajouter à sa fiche) se fait dans la fiche elle-même (`/app/fiche`), où BLUSH range tout seul ce qu'il trouve. Proposition : après l'analyse, `/rapport/verdict` révèle le verdict en cartes (comme des stories) avant le rapport, qui ne change pas. Proposition : « Ta question » (`/rapport/question`) se pose en conversation avec BLUSH, avec des idées tirées du rapport ; l'écran actuel reste sur `?version=actuelle`. Proposition : au-dessus du champ du chat (`/app`), les 4 questions que promet la landing ; le chat sans elles reste sur `?version=actuelle`. Chaque `page.tsx` charge ses données via la couche de service, puis affiche l'écran client (`*Screen.tsx`). |
| `src/components/ui/` | Composants du design system : Button, Chip, Segmented, Switch, tuiles, cartes, Bubble, ProofCard, Tag, ScoreBar, LevelPath, ProgressDots, LockRow, blocs du rapport, Sheet, Toast, EmailField. |
| `src/components/brand/` | Logo et objets 3D en SVG, portés depuis `maquettes/objets-3d-source.py` : bulle, sphères nacre et opale, cadenas, cloche, coche. |
| `src/components/landing/` | La landing : le titre en bulles, les convs qui défilent (on en touche une, son verdict s’ouvre), BLUSH+ en bloc noir (avec la grosse main en guise de curseur), les avis, les faits. Ses textes et ses convs d’exemple sont dans `src/mocks/landing.ts`. |
| `src/components/shell/` | Coque commune : barre du haut mobile, en-tête desktop, colonne d'appoint, zone du bouton principal. |
| `src/services/api.ts` | **Le seul point de branchement du futur back-end.** Toutes les données passent par ici. |
| `src/mocks/` | Données factices des maquettes (Hugo & Sophie, 8 chapitres, fiche…) et faux serveur (`server.ts`, dans `sessionStorage`). |
| `src/types/` | Types du domaine : `Story`, `Source`, `Report`, `Chapter`, `Reply`, `FicheFact`, `Subscription`… |
| `src/state/` | État du parcours (choix, fichiers, devinette) gardé dans `sessionStorage`, et paramètres de démo. |

## Mise en page

- **Moins de 1024 px :** mise en page mobile. Elle est fluide sous 768 px, puis centrée sur 560 px de large au maximum.
- **À partir de 1024 px :** mise en page desktop, avec la colonne d'appoint (étapes, état de la relation ou sommaire du rapport).

## États de démo (paramètres d'URL)

- `?verdict=difficile` : affiche le mode sobre à la place du rapport.
- `?erreur=fichier|groupe|courte|lecture|capture` : affiche l'écran d'erreur, sur n'importe quelle route.
- `?plan=gratuit|rapport|blushplus` : donne les droits d'accès correspondants.
- `/rapport?paiement=1` : ouvre directement le panneau de paiement (écran 10).
- `/lecture?relance=1` : relance la lecture simulée.
- `/?apercu=avis` : montre les emplacements des avis sur la landing (la section n’apparaît qu’avec de vrais avis, dans `TESTIMONIALS`).

Ces états restent en mémoire pendant la session. Pour tout remettre à zéro, fermer l'onglet ou vider le `sessionStorage`.

## Brancher le back-end

Il suffit de remplacer le corps des fonctions de `src/services/api.ts` : `uploadExport`, `uploadScreenshots`, `getStory`, `startAnalysis`, `getAnalysisProgress`, `getReport`, `unlock`, `sendToBlush`, `getQuickQuestions`, `analyzeMessage`, `askQuestion`, `getQuestionIdeas`, `getFiche`, `updateFiche`, `addToFiche`, `sendLoginCode`, `verifyLoginCode`, `getAccount`, `deleteStory`, etc. Leurs signatures sont déjà typées.

`getReport()` renvoie déjà les chapitres non payés verrouillés et sans contenu (`locked: true`) : l'interface sait les afficher. `mocks/server.ts` et `state/DemoParams.tsx` ne servent qu'à la démo.
