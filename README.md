# BLUSH — front

Le SaaS BLUSH : une appli Next.js 16 (App Router), TypeScript et Tailwind v4, avec son back-end (les routes `/api`, Postgres et Drizzle, le modèle). En local, elle tourne sur le Postgres de la machine et le modèle factice, sans aucun appel payé (voir BACKEND.md).

```bash
npm install
cp .env.example .env.development.local   # une fois : la configuration de dev, fictive
npm run dev                               # http://localhost:3000 (crée et migre la base blush_dev au besoin)
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

La CI (`.github/workflows/ci.yml`), à chaque pull request et à chaque push sur `main` :

1. **Vérifications et build** : `npm run check` (dont la cohérence des migrations, `scripts/verifier-migrations.mjs`), puis le build du back-end et sa vérification qu’aucun prompt n’arrive au navigateur (`scripts/verifier-fuite.mjs`).
2. **E2E (chromium)** et **E2E (webkit)** : chacun refait le build, puis les tests de bout en bout avec un Postgres neuf. En cas d’échec, le rapport et les traces (données de test inventées, jamais les prompts) sont dans les artefacts du run.

**La mise en production est un geste, jamais l’effet d’un push** : sur `main`, « Run workflow » dans l’onglet Actions (ou `gh workflow run CI --ref main`). Ce lancement refait les vérifications et les tests de bout en bout sur la tête de `main`, puis lance `vercel deploy --prod` : Vercel construit sur ses serveurs avec ses variables, et y migre la base. Relancer un ancien run ne redéploie pas une version passée : seule la tête de `main` part. On ne déploie plus depuis un dossier local.

Le dépôt est privé, sur GitHub Free : pas de règle de branche ni de relecteur obligatoire, et les secrets sont ceux du dépôt. La CI en lit deux, `PROMPTS_TOKEN` (un jeton GitHub qui lit `blush-front` et `blush-prompts`) et `VERCEL_TOKEN`. Le build contient les prompts (côté serveur) : il ne sort jamais d’un job, aucun artefact ne le transporte, puisque les artefacts se téléchargent par quiconque lit le dépôt.

## Où sont les choses

| Dossier | Rôle |
|---|---|
| `src/app/` | La landing (`/`), une route par écran (01 à 20), plus `/styleguide`. L'écran 14 (son message) vit désormais dans le chat de l'accueil (`/app`) ; l'écran 15 (relire ma réponse) a été retiré ; l'écran 17 (ajouter à sa fiche) se fait dans la fiche elle-même (`/app/fiche`), où BLUSH range tout seul ce qu'il trouve. Après l'analyse, `/rapport/verdict` révèle le verdict en cartes (comme des stories) avant le rapport. « Ta question » (`/rapport/question`) se pose en conversation avec BLUSH, avec des idées tirées du rapport. Au-dessus du champ du chat (`/app`), les questions toutes prêtes que promet la landing. Chaque `page.tsx` charge ses données côté serveur (`src/services/serveur.ts`), puis affiche l'écran client (`*Screen.tsx`). Les routes `/api` sont le back-end (voir BACKEND.md). |
| `src/components/ui/` | Composants du design system : Button, Chip, Segmented, Switch, tuiles, cartes, Bubble, ProofCard, Tag, ScoreBar, LevelPath, ProgressDots, LockRow, blocs du rapport, Sheet, Toast, EmailField. |
| `src/components/brand/` | Logo et objets 3D en SVG, portés depuis `maquettes/objets-3d-source.py` : bulle, sphères nacre et opale, cadenas, cloche, coche. |
| `src/components/landing/` | La landing : le titre en bulles, les convs qui défilent (on en touche une, son verdict s’ouvre), BLUSH+ en bloc noir (avec la grosse main en guise de curseur), les avis, les faits. Ses textes et ses convs d’exemple sont dans `src/contenu/landing.ts`. |
| `src/components/shell/` | Coque commune : barre du haut mobile, en-tête desktop, colonne d'appoint, zone du bouton principal. |
| `src/services/api.ts` | Dans le navigateur, le seul point de contact avec les données : les appels aux routes `/api`. |
| `src/services/serveur.ts` | Les données des pages serveur, lues en base d’après les cookies de la requête. |
| `src/server/` | Le back-end : la base, le chiffrement, le modèle, les mails (voir BACKEND.md). |
| `src/contenu/` | Les textes du produit : offres et prix, étapes de l’export et de la lecture, rubriques de la fiche, landing. |
| `src/types/` | Types du domaine : `Story`, `Source`, `Report`, `Chapter`, `FicheFact`, `Subscription`… |
| `src/state/` | État du parcours (choix, fichiers, devinette) gardé dans `sessionStorage`. |

## Mise en page

- **Moins de 1024 px :** mise en page mobile. Elle est fluide sous 768 px, puis centrée sur 560 px de large au maximum.
- **À partir de 1024 px :** mise en page desktop, avec la colonne d'appoint (étapes, état de la relation ou sommaire du rapport).

## Paramètres d'URL

- `?erreur=fichier|groupe|courte|lecture|capture|video|longue` : l'écran d'erreur du parcours d'import, par-dessus n'importe quelle route (`src/components/screens/ErreurDeParcours.tsx`). Les écrans de l'import le posent eux-mêmes.
- `/rapport?paiement=1` : ouvre directement le panneau de paiement (écran 10).
