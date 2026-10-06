# CRUSH — front

Front du SaaS CRUSH : Next.js 16 (App Router), TypeScript et Tailwind v4. Il tourne entièrement sur des données factices : pas de back-end, pas de réseau.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Où sont les choses

| Dossier | Rôle |
|---|---|
| `src/app/` | La landing (`/`), une route par écran (01 à 20), plus `/styleguide`. L'écran 14 (son message) vit désormais dans le chat de l'accueil (`/app`) ; l'écran 15 (relire ma réponse) a été retiré ; l'écran 17 (ajouter à sa fiche) se fait dans la fiche elle-même (`/app/fiche`), où CRUSH range tout seul ce qu'il trouve. Chaque `page.tsx` charge ses données via la couche de service, puis affiche l'écran client (`*Screen.tsx`). |
| `src/components/ui/` | Composants du design system : Button, Chip, Segmented, Switch, tuiles, cartes, Bubble, ProofCard, Tag, ScoreBar, LevelPath, ProgressDots, LockRow, blocs du rapport, Sheet, Toast, EmailField. |
| `src/components/brand/` | Logo et objets 3D en SVG, portés depuis `maquettes/objets-3d-source.py` : bulle, sphères nacre et opale, cadenas, cloche, coche. |
| `src/components/landing/` | La landing : le titre en bulles, les convs qui défilent (on en touche une, son verdict s’ouvre), CRUSH+ en bloc noir (avec la grosse main en guise de curseur), les avis, les faits. Ses textes et ses convs d’exemple sont dans `src/mocks/landing.ts`. |
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
- `?plan=gratuit|rapport|crushplus` : donne les droits d'accès correspondants.
- `/rapport?paiement=1` : ouvre directement le panneau de paiement (écran 10).
- `/lecture?relance=1` : relance la lecture simulée.
- `/?apercu=avis` : montre les emplacements des avis sur la landing (la section n’apparaît qu’avec de vrais avis, dans `TESTIMONIALS`).

Ces états restent en mémoire pendant la session. Pour tout remettre à zéro, fermer l'onglet ou vider le `sessionStorage`.

## Brancher le back-end

Il suffit de remplacer le corps des fonctions de `src/services/api.ts` : `uploadExport`, `uploadScreenshots`, `getStory`, `startAnalysis`, `getAnalysisProgress`, `getReport`, `unlock`, `sendToCrush`, `analyzeMessage`, `askQuestion`, `getFiche`, `updateFiche`, `addToFiche`, `sendLoginCode`, `verifyLoginCode`, `getAccount`, `deleteStory`, etc. Leurs signatures sont déjà typées.

`getReport()` renvoie déjà les chapitres non payés verrouillés et sans contenu (`locked: true`) : l'interface sait les afficher. `mocks/server.ts` et `state/DemoParams.tsx` ne servent qu'à la démo.
