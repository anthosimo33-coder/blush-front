# Le back-end de BLUSH

Le back-end vit dans ce projet Next.js : les routes `/api`, Postgres (Drizzle) et le modèle. L’appli tourne toujours avec lui, en local comme en production.

## Ce qu’il fait

| Étape | Route | Où |
|---|---|---|
| Import d’un export (WhatsApp .zip ou .txt, Instagram message_1.html ou .json) en histoire brouillon, avant l’email. Le navigateur n’envoie que le texte de la conv, compressé (`src/services/preparer-export.ts`) | `POST /api/import` | `src/server/histoires.ts`, `prompts/lib/export.ts`, `prompts/lib/instagram.ts` |
| Des captures d’écran, réduites par le navigateur puis lues par le prompt 01, en histoire brouillon | `POST /api/captures` | `src/server/captures.ts`, `prompts/lib/captures.ts` |
| Code de connexion à 6 chiffres, session en cookie httpOnly | `POST /api/auth/code`, `/api/auth/verifier`, `/api/auth/deconnexion` | `src/server/auth.ts` |
| La lecture : le verdict, puis (avec l’accès) le plan du rapport, ses deux moitiés et la mémoire | `POST/GET /api/analyse` | `src/server/analyse.ts`, `src/server/taches.ts` |
| Le rapport : sans accès, seul le chapitre 1 (le verdict) est offert, les autres arrivent fermés et vides (le mode sobre s’ouvre sans paiement) | `GET /api/rapport` | `src/server/donnees.ts`, `src/contenu/chapitres.ts` |
| Débloquer (v1 sans paiement : les emails de `BLUSH_ACCES_LIBRE`) | `POST /api/debloquer` | |
| Le chat, d’après la mémoire ; l’historique ; la mise à jour de la mémoire. On y envoie du texte, des captures (leur conv ou son profil), un nouvel export, ou un vocal (transcrit par Mistral) | `POST/GET /api/chat` | `src/server/chat.ts`, `src/server/ajouts.ts`, `src/server/ia/transcription.ts` |
| Sa fiche, et les corrections de l’utilisateur | `GET/PUT /api/fiche` | |
| Des captures ou un export ajoutés à sa fiche : lus, puis la mémoire mise à jour tout de suite | `POST /api/fiche` | `src/server/ajouts.ts` |
| Le compte, la pause, les suppressions | `/api/compte`, `/api/histoire` | |
| La purge de nuit (Vercel Cron) | `GET /api/cron/purge` | `src/server/purge.ts` |

Les pages serveur lisent les données via `src/services/serveur.ts`, et le navigateur passe par `src/services/api.ts`, qui appelle les routes `/api`.

## Les prompts

- **Où ils sont :** dans le sous-module `prompts/`, le dépôt privé `blush-prompts`. Après un clone, il faut lancer :
  ```bash
  git submodule update --init
  ```
- **La logique partagée :** `prompts/lib/` contient la lecture des exports, les chiffres, le contexte de chaque tâche, les formats de sortie et l’affichage. Le banc de test l’utilise aussi : l’appli envoie au modèle exactement ce qui a été testé.
- **Ils ne quittent pas le serveur :** `scripts/prompts.mjs` (lancé avant `dev`, `build` et `test`) copie les textes dans `src/server/ia/textes.generated.ts`. Ce module n’est importé que côté serveur, et il n’est pas commité.
- **Le contrôle de fuite :** après chaque build, `scripts/verifier-fuite.mjs` cherche des phrases des prompts dans ce que reçoit le navigateur. S’il en trouve une, le build échoue.
- **Le garde-fou du chat :** une réponse qui recopie un prompt est remplacée (`src/server/ia/garde.ts`).

## Confidentialité

- **Chiffrement :** tout ce qui vient de la conv est chiffré en AES-256-GCM (`src/server/chiffrement.ts`), avec `BLUSH_CLE`, qui n’est jamais dans la base.
- **La conv brute ne reste pas :**
  - elle est effacée dès le rapport et la mémoire faits ;
  - un brouillon jamais rattaché à un compte est effacé au bout de 24 h ;
  - une conv sans rapport reste gardée (chiffrée) jusqu’au déblocage ; une conv dont le rapport est écrit mais la mémoire jamais faite est effacée au bout de 30 jours.
- **Les suppressions effacent vraiment tout,** en cascade.
- **Les logs ne contiennent aucun contenu,** seulement des codes d’erreur et les coûts (`ai_usage`).
- **Les cookies sont httpOnly,** et toute requête qui modifie quelque chose doit venir de l’appli elle-même (contrôle d’origine).
- **Des limites anti-abus** (`src/server/limites.ts`) bornent les codes, les imports et le chat.

## Variables d’environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres. En production, l’URL **avec pooler** de Neon |
| `BLUSH_CLE` | La clé de chiffrement : `openssl rand -base64 32`. **À garder précieusement** : la perdre rend les données illisibles |
| `ANTHROPIC_API_KEY` | La clé de l’API Claude. `ANTHROPIC_WORKSPACE_ID` si la clé n’a pas de workspace |
| `RESEND_API_KEY`, `BLUSH_EMAIL_FROM` | L’envoi des codes. Il faut un domaine vérifié chez Resend |
| `MISTRAL_API_KEY` | La transcription des vocaux (Mistral, Voxtral). Sans elle, le chat répond que les vocaux arrivent bientôt |
| `BLUSH_ACCES_LIBRE` | La bêta sans paiement : des emails séparés par des virgules, ou `*` |
| `CRON_SECRET` | Le secret de la purge de nuit (16 caractères au moins) |
| `BLUSH_IA_FACTICE` | `1` en dev et en tests : un modèle factice, sans aucun coût |

## En local

```bash
cp .env.example .env.development.local   # une fois : la configuration de dev, fictive
npm run dev
```

`npm run dev` (`scripts/developper.mjs`) lit les fichiers `.env` comme `next dev`, crée la base `blush_dev` si elle manque (sans jamais l’effacer), y applique les migrations, puis lance `next dev`. Ce qu’on lui donne dans le shell l’emporte (`DATABASE_URL=postgres://localhost:5432/blush_dev_<nom> npm run dev`). Avec le modèle factice (`BLUSH_IA_FACTICE=1`), il refuse les clés d’API : une vraie clé ferait partir de vrais appels. Seul `next dev` lit `.env.development.local` : ni `npm run build`, ni les tests de bout en bout ne le voient.

En dev, le code de connexion s’affiche dans les logs du serveur.

Les tests tournent sur la base `blush_test`, ou celle de `DATABASE_URL_TEST` : `npm test` la crée si elle manque et la migre (`tests/preparer-la-base.ts`), sans jamais l’effacer. `blush_test` sert à tous les dossiers du projet sur la machine : sans `DATABASE_URL_TEST`, elle n’est migrée que si elle vient d’être créée, et une migration qui lui manque arrête les tests (prendre alors `DATABASE_URL_TEST=postgres://localhost:5432/blush_test_<nom>`). `npm run check` lance tout ce que la CI vérifie avant le build : les types, le lint, la cohérence des migrations (`scripts/verifier-migrations.mjs` : le journal de `drizzle/`, puis `drizzle-kit check`) et les tests.

### Les tests de bout en bout

Les vrais parcours, dans Chromium (ordinateur) et WebKit (iPhone), contre le back-end et le modèle factice, sur une base recréée à chaque lancement (`blush_e2e`). Sans Resend, le serveur des tests écrit chaque mail en JSON dans `test-results/boite-mails-<port>` (`BLUSH_BOITE_MAILS`, ignorée sur Vercel) : les tests y lisent les codes.

```bash
npx playwright install chromium webkit   # une fois
npm run e2e:build                        # le build des tests, après chaque changement de l’appli
npm run e2e                              # ou : npm run e2e -- --project=webkit-iphone, npm run e2e:ui
```

- Plusieurs suites en même temps : `E2E_PORT=3500 E2E_DB=blush_e2e_b npm run e2e` (le port suivant sert la bêta fermée). `E2E_WORKERS` change le nombre de workers (3 en local, 2 en CI).
- Les fichiers `*.beta.spec.ts` tournent sur ce second serveur, en bêta fermée (`BLUSH_BETA_FERMEE=1`).
- Les tests s’écrivent avec `tests/e2e/aide`, et importent tout de `./aide` (`test`, `expect` et les réglages des serveurs compris) : des exports fictifs, la boîte à mails, les gestes du parcours (`jusquAuCode`, `seConnecter`, `saisirLeCodeRecu`), la base. Jamais une vraie conv.
- Le décor d’un test (un compte, sa conv lue) se prépare par les routes /api : `lectureFaite` (un compte gratuit), `lectureBlushPlus` (un invité, toute la chaîne écrite). Le parcours à l’écran a ses propres tests (`parcours-temoin`, `import*`).
- Le modèle factice a des déclencheurs, des marqueurs inventés à glisser dans une conv (`exportWhatsApp(testInfo, { ajout })`) : `ALERTE_FACTICE` (le mode sobre), `REFUS_FACTICE` (un refus du modèle), et dans le chat « je lui envoie quoi », « on est ensemble », « parle-moi en vocal » (`src/server/ia/factice.ts`).
- Une page chargée en entier ne répond aux gestes qu’une fois hydratée : `goto`, `reload`, `goBack` et `goForward` l’attendent d’eux-mêmes (`aide/page.ts`). Après un geste qui recharge toute la page (le verdict, qui part par `window.location`), `pagePrete(page)` ; sur une page qui lit le compte, `ouvrir(page, adresse)`. Jamais de nouvel essai : un test qui ne passe qu’une fois sur deux attend le mauvais signal.
- Une requête attendue part avec son geste : `reponseAuGeste(page, { chemin }, geste)`. Aucune attente des aides ne dure plus que `RESEAU` (30 s, celle d’un `expect`), sauf le dessin d’une image (`DESSIN`) et la lecture de captures (`LECTURE_DES_CAPTURES`) ; `test.slow()` seulement pour un test qui enchaîne plusieurs parcours. Une attente fixe seulement pour dire que rien n’arrive (`DEFILEMENT_DOUX`, la relecture des compteurs du partage).
- Un autre appareil (un pote, le mail ouvert ailleurs) : la fixture `autreAppareil`, refermée à la fin du test. Chromium a un micro factice, autorisé d’office (`playwright.config.ts`).
- Un invité (`nouvelInvite`) repart d’un compte et d’une boîte à mails vides ; un email libre (`emailLibre`) est neuf à chaque test.
- Dans Chromium, `response.json()` n’aboutit jamais quand la page ne lit pas elle-même le corps de sa requête : vérifier alors `status()`.
- Après un échec : la trace et la capture dans `test-results/<port>`, le rapport avec `npx playwright show-report`.

La galerie des écrans (`npm run galerie`) et le banc de fluidité de l’accueil (`npm run fluidite`) tournent sur ce même build et ce même serveur, avec leur propre base et des comptes semés par les aides des tests (README, « La galerie »).

Pour mesurer les prompts avec le vrai modèle, il y a aussi `scripts/essai-memoire.mts` (les mises à jour de la mémoire, échange par échange), `scripts/essai-captures.mts` (la lecture des captures, comparée mot pour mot aux captures fabriquées par `prompts/evals/captures/fabriquer.mjs` ; un profil fictif avec `prompts/evals/captures/profil.mjs`) et `scripts/essai-ajouts.mts` (des messages et un profil envoyés après l’import : la réponse du chat, puis la mise à jour de la mémoire).

Les messages ajoutés après l’import prennent des numéros à la suite de la conv (`stories.next_message`, réservés d’un coup), et `context.dernier` garde l’heure du dernier message lu : un export renvoyé n’apporte que ce qui est nouveau.

Avant une mise en ligne, un test de fumée avec le **vrai** modèle (environ 1 $). Une conv de test courte traverse tout le back-end, puis tout est effacé. Mesuré le 7 octobre : 194 s et 1,07 $ pour les 6 appels.

```bash
NODE_OPTIONS=--conditions=react-server DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npx tsx scripts/essai-vrai-modele.mts
```

## Mise en ligne

Déjà fait (production, sur Vercel) : `BLUSH_CLE` (une copie locale dans `~/.blush/BLUSH_CLE`, à ranger dans un gestionnaire de mots de passe : la perdre rend les données illisibles), `CRON_SECRET`, `BLUSH_EMAIL_FROM` (`BLUSH <bonjour@askblush.com>`). Les variables sont « sensibles » : Vercel ne les rend plus, même à nous.

1. **La base :** créer une base Neon depuis Vercel (projet blush-front, onglet Storage, région Francfort, « Connect »). Vercel ajoute `DATABASE_URL` tout seul. Les tables se créent au build (`scripts/migrer.mjs`, lancé par `prebuild` sur Vercel) : pas besoin de l’URL en local.
2. **Les variables qui restent :** `RESEND_API_KEY`, `ANTHROPIC_API_KEY` (une clé à part, avec un plafond de dépenses), `BLUSH_ACCES_LIBRE` (les emails des testeurs).
3. **Le déploiement :** par la CI seulement, et toujours à la main : « Run workflow » sur `main` (onglet Actions de `blush-front`), ou `gh workflow run CI --ref main`. Ce lancement refait les vérifications et les tests de bout en bout sur la tête de `main`, puis `vercel deploy --prod` depuis GitHub (le sous-module `prompts/` compris ; `.vercelignore` garde `prompts/evals` hors de Vercel). Un push sur `main` ne déploie rien. Plus jamais `vercel deploy` depuis un dossier local. Pas d’intégration Git côté Vercel : `vercel.json` coupe ses déploiements automatiques, au cas où le dépôt y serait relié un jour.
4. **Donner l’accès à un ami pendant la bêta :** ajouter son email à `BLUSH_ACCES_LIBRE`, puis relancer la mise en production (un nouveau « Run workflow » sur `main` : un « Re-run » d’un ancien lancement s’arrête si `main` a avancé depuis), ou, avec l’URL de la base :
   ```bash
   DATABASE_URL=<url> npm run acces -- ami@exemple.fr blushplus
   ```
