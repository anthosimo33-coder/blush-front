# Le back-end de BLUSH

Le back-end vit dans ce projet Next.js : les routes `/api`, Postgres (Drizzle) et le modèle. L’appli tourne toujours avec lui, en local comme en production.

## Les routes /api

Le navigateur passe par `src/services/api.ts`, qui appelle ces routes ; les pages serveur lisent les mêmes données par `src/services/serveur.ts`. Les gardes, dans l’ordre où une route les vérifie :

- **origine** : une requête qui modifie quelque chose vient de l’appli elle-même (`memeOrigine`, `src/server/http.ts`), sinon 403 `origine`.
- **session** : un compte connecté (le cookie de session, httpOnly), sinon 401 `connexion`.
- **conv** : la conv ouverte, sinon 404 `aucune`. Un appel du navigateur désigne la conv de sa page (l’en-tête `x-blush-conv`, `src/services/session.ts`) ; sans lui, le brouillon du parcours d’import, la conv choisie dans « Tes convs » (`/app/convs`) ou « Tes histoires » (Mon compte), ou la dernière lue (`histoireOuverte`, `src/server/histoires.ts`).
- **plan** : ce que le compte a débloqué (`gratuit`, `rapport`, `blushplus`), sinon 402.
- **limite `x`** : `LIMITES.x` (`src/server/limites.ts`), par adresse IP, par compte ou par email, sinon 429 `trop`.
- **bêta** : en bêta fermée, BLUSH ne lit des captures que pour un compte connecté (`lecturePermise`, `src/server/captures.ts`), sinon 401 `connexion`.

Une erreur répond `{ erreur: <code> }`, avec le statut que lui donne la liste des codes (`ERREURS_API`, `src/types/erreurs-api.ts`) ; les écrans en tirent leur texte (`src/lib/messages-erreur.ts`). D’une étape du modèle, le chat et la fiche ne disent que `refus`, `transcription` ou `panne` (`codePublic`) : son code interne (`refus:cyber`, `sortie_illisible`) reste dans l’alerte. Seule exception d’une route d’action : un mauvais code de connexion répond 200 `{ ok: false }`, la même réponse pour tous. Hors de ce contrat, `/api/reveil` (un réveil, sans code) répond 503 `{ ok: false }` quand la base ne répond pas.

| Route | Méthodes | Rôle | Garde | Module |
|---|---|---|---|---|
| `/api/import` | POST | Un export (WhatsApp .zip ou .txt, Instagram message_1.html ou .json) devient une histoire brouillon, avant l’email. Le navigateur n’envoie que le texte de la conv, compressé (`src/services/preparer-export.ts`) ; un fichier brut passe aussi, sous la limite de taille de Vercel | origine, limite `importParIp` | `src/server/histoires.ts`, `prompts/lib/export.ts`, `prompts/lib/instagram.ts` |
| `/api/captures` | POST | Des captures d’écran (20 au plus, réduites par le navigateur), lues par le prompt 01, deviennent une histoire brouillon. Un nouvel essai du même envoi (`cle`, après une coupure du réseau) rend la lecture déjà faite | origine, limite `importParIp`, bêta, limite `capturesAnonymesParJour` (sans compte) ou `capturesParCompte` | `src/server/captures.ts`, `src/server/histoires.ts`, `prompts/lib/captures.ts` |
| `/api/captures/lot` | POST | Un lot de six images tirées d’un enregistrement d’écran (dans le navigateur), lu par le prompt 01 : la route rend la lecture brute, et ne garde rien | origine, limite `lotParIp`, bêta, limite `lotsAnonymesParJour` (sans compte) ou `lotsParCompte` | `src/server/captures.ts` |
| `/api/captures/video` | POST | Les lots lus, rassemblés en une seule lecture (sans les messages vus deux fois au bord de deux lots), deviennent une histoire brouillon | origine, limite `importParIp`, bêta | `src/server/video.ts`, `src/server/captures.ts`, `src/server/histoires.ts` |
| `/api/histoire` | GET, DELETE | GET : l’histoire du parcours (la conv qu’on importe, sinon celle qui est ouverte). DELETE : « Supprimer l’histoire » ouverte, et tout ce qui en vient, en cascade | origine (DELETE), conv | `src/server/histoires.ts`, `src/server/donnees.ts` |
| `/api/auth/code` | POST | Le code de connexion à 6 chiffres, par email. En bêta fermée, la même réponse pour tous : un email hors de la liste reçoit le mail de la liste d’attente, et la conv importée sur ce navigateur est effacée | origine, limites `codeParIp` et `codeParEmail` | `src/server/auth.ts`, `src/server/attente.ts` |
| `/api/auth/verifier` | POST | Le code reçu : bon, il ouvre la session et rattache au compte la conv importée sur ce navigateur s’il n’en a encore lu aucune (sinon elle reste un brouillon, que la lecture rattachera : `POST /api/analyse`) ; mauvais, la réponse est `{ ok: false }` (200), la même pour tous | origine, limite `verificationParIp` | `src/server/auth.ts`, `src/server/histoires.ts` |
| `/api/auth/deconnexion` | POST | Ferme la session, et oublie ce qui désigne une conv sur cet appareil (le brouillon, la conv choisie) | origine | `src/server/auth.ts`, `src/server/cookies.ts` |
| `/api/attente` | POST | S’inscrire sur la liste d’attente de la bêta fermée (l’email chiffré, et son empreinte) | origine, limite `attenteParIp` | `src/server/attente.ts` |
| `/api/attente/retrait` | POST | Se retirer de la liste, depuis le lien signé de son mail | origine, le lien (`id` et `cle`) | `src/server/attente.ts` |
| `/api/analyse` | POST, GET | POST : lance la lecture (« Qui es-tu ? » rempli) ; le verdict part après la réponse, et relancer ne refait rien de ce qui est fait. GET : la progression de la lecture, relue chaque seconde par l’écran de lecture ; relance au passage une tâche abandonnée | origine (POST), session, conv, limite `analyseParCompte` (une nouvelle conv) ou `relanceParCompte` (après un échec) | `src/server/analyse.ts`, `src/server/taches.ts`, `src/server/donnees.ts` |
| `/api/rapport` | GET, POST | GET : le rapport ; sans accès, seul le chapitre 1 (le verdict) est offert, les autres arrivent fermés et vides (le mode sobre s’ouvre sans paiement). Relu toutes les 2 s pendant l’écriture, il relance les tâches coupées. POST : « Relancer l’écriture » après une panne | origine (POST), session, conv, limite `relanceParCompte` (POST) | `src/server/donnees.ts`, `src/contenu/chapitres.ts`, `src/server/taches.ts` |
| `/api/debloquer` | POST | Débloquer le rapport. v1 sans paiement : un compte gratuit passe à BLUSH+ s’il est dans `BLUSH_ACCES_LIBRE` (sinon 402 `bientot`), puis ce qui manque (le rapport, la mémoire) s’écrit après la réponse | origine, session | `src/server/donnees.ts`, `src/server/env.ts` |
| `/api/partage` | GET, POST, DELETE | Le lien public du verdict (`/v/<id>`, le prénom de l’autre masqué) : le lire, le créer (toujours le même), le désactiver | origine (POST, DELETE), session, conv | `src/server/partages.ts`, `src/server/compteurs.ts` |
| `/api/partage/image` | POST | « Partager en image » : une réponse du chat ou la chute d’un chapitre, dessinée en story d’après le compte (jamais d’après la requête), le prénom de l’autre masqué | origine, session, conv, limite `imageParCompte` | `src/server/carte-partage.tsx`, `src/server/partages.ts` |
| `/api/partage/compte` | POST | Compte une image vraiment partagée ou enregistrée, pas seulement préparée | origine, session, limite `imageParCompte` (au-delà, rien n’est compté) | `src/server/compteurs.ts` |
| `/api/chat` | POST, GET | POST : un message à BLUSH (du texte, des captures de leur conv ou de son profil, un nouvel export, ou un vocal transcrit) ; la réponse part en flux, une ligne JSON par événement, puis la mémoire se met à jour. GET : l’historique (`?avant=<id>` : les échanges d’avant) | origine (POST), session, plan `blushplus` (POST), conv, la mémoire faite (POST, sinon 409 `pas_pret`), limites `chatParCompte` et `ajoutParCompte` (avec des fichiers) | `src/server/chat.ts`, `src/server/ajouts.ts`, `src/server/historique.ts`, `src/server/ia/transcription.ts` |
| `/api/chat/vocal` | POST | Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit ») | origine, session, conv | la route (`stories.chat_vocal`) |
| `/api/vocal/audio` | GET | L’audio du vocal du rapport (MP3), déchiffré à la volée. `?conv=<id>` désigne sa conv : un lecteur audio n’envoie pas d’en-tête | session, une conv du compte | `src/server/vocal.ts`, `src/server/http.ts` |
| `/api/vocal/chat/[id]` | GET | L’audio d’une réponse du chat dite en vocal | session, une conv du compte | la route, `src/server/chiffrement.ts` |
| `/api/vocal/ecoute` | POST | Un moment de l’écoute du vocal (début, fin, réécoute, fermé avant la fin), pour comparer les deux voix | origine, session, conv, limite `ecouteParCompte` (au-delà, ignoré) | `src/server/vocal.ts` |
| `/api/fiche` | GET, PUT, POST | GET : sa fiche, et si la mémoire se met à jour (l’écran la relit alors toutes les 3 s). PUT : la fiche corrigée par l’utilisateur (la liste entière). POST : des captures ou un export pour sa fiche, lus tout de suite ; la mémoire se met à jour après la réponse | origine (PUT, POST), session, plan `blushplus` (POST), conv, limites `ficheParCompte` (PUT) et `ajoutParCompte` (POST) | `src/server/ajouts.ts`, `src/server/donnees.ts` |
| `/api/compte` | GET, POST, DELETE | GET : le compte (son email, son abonnement). POST : mettre BLUSH en pause, ou le reprendre. DELETE : « Tout effacer », le compte, ses sessions et ses histoires, en cascade | origine (POST, DELETE), session (GET, POST) | `src/server/donnees.ts` |
| `/api/reveil` | GET | Le réveil : démarre une instance et réveille la base (`select 1`), sans rien lire ni écrire. Le navigateur l’appelle sans attendre (`src/components/shell/Reveil.tsx`) | aucune | la route |
| `/api/cron/purge` | GET | La purge de nuit (Vercel Cron, `vercel.json`), puis le résumé de la veille à l’équipe | l’en-tête `Authorization: Bearer <CRON_SECRET>`, sinon 401 | `src/server/purge.ts`, `src/server/alertes.ts` |

Hors de `/api`, trois routes répondent sans page : `/ouvrir/[id]` (le lien du mail « ton rapport est prêt »), `/v/[id]/image` (l’image d’un verdict partagé) et `/v/[id]/essayer` (« Analyser ma conv » depuis un verdict partagé). Celles de `/apercu` ne servent qu’à l’équipe : jamais sur Vercel, où `src/proxy.ts` sert à leur place la page introuvable, en 404 (comme pour `/styleguide`).

## Les tâches

Ce qui fait travailler le modèle longtemps (de 20 s à 2 min par étape) passe par une file en base, la table `tasks` (`src/server/taches.ts`). La route répond tout de suite, puis `after()` (`next/server`) garde la fonction en vie le temps d’enchaîner les tâches (`executerChaine`, `src/server/analyse.ts`).

- **Les genres** : `verdict` (prompt 04), `rapport_plan` et `rapport_chapitres` (prompt 05), `vocal` (prompt 06, puis la voix), `memoire` et `memoire_maj` (prompt 07). L’entrée d’une tâche (l’échange, pour `memoire_maj`) est chiffrée ; `progress` et `detail` donnent son avancée aux écrans.
- **Les états** :
  ```
  attente ──prendre──▶ en_cours ──finir──▶ fini
     ▲                    │
     └────── echouer ─────┤  (il reste des essais)
                          └── echouer ──▶ echec  (le 3e essai, ou un refus du modèle)
  ```
  Un refus du modèle reviendrait à chaque essai : il passe tout de suite en échec. Chaque échec définitif prévient l’équipe (`BLUSH_ALERTES`), avec le code et la tâche, jamais de contenu.
- **Le battement** : une tâche en cours bat toutes les 20 s (`heartbeat_at`). Sans battement depuis 90 s (`PERIME_S`), elle est abandonnée (l’instance arrêtée, la fonction coupée) : `prendre` la reprend comme une tâche en attente ; coupée à son troisième essai, `clore` la passe en échec (`coupee`).
- **Une étape à la fois** : `prendre` est atomique, et ne prend rien tant qu’une autre tâche de la même histoire bat encore. Un index unique ne garde qu’une tâche de chaque genre de la chaîne en attente ou en cours par histoire : planifiée deux fois (deux onglets, deux déblocages), c’est la même qui revient.
- **La chaîne** : `verdict` planifie `rapport_plan`, avec l’accès (un plan autre que `gratuit`) ou en mode sobre (une alerte de danger) ; `rapport_plan` planifie `rapport_chapitres` et, s’il y a une voix (`voixDisponible`), `vocal` ; `rapport_chapitres` planifie `memoire`. Les tâches en attente partent dans l’ordre où elles ont été planifiées (`aRelancer`) : le vocal passe donc entre les chapitres et la mémoire. Il s’enregistre d’habitude pendant les chapitres, et sa tâche ne sert que s’il n’a pas pu s’y faire. En mode sobre, `rapport_plan` écrit tout le rapport doux, offert, en un appel, puis planifie `memoire` si le compte a l’accès ; jamais de vocal sur une alerte. Une fois la mémoire faite, la conv brute est effacée. Ensuite, chaque ajout à la fiche, et chaque échange du chat qui apporte du neuf, planifie un `memoire_maj`.
- **L’échéance** : une fonction Vercel vit 300 s au plus. `executerChaine` enchaîne les tâches de l’histoire tant qu’il en reste, et tant que la suivante a le temps de finir avant l’échéance, 15 s avant la coupure (`echeancePour`, `src/server/echeance.ts` : 285 s), avec sa durée habituelle plus 30 % ; sinon elle s’arrête, et la tâche attend en base. Une autre exécution qui tient déjà l’histoire est laissée faire.
- **La relance par sondage** : ce qui attend repart quand un écran revient le chercher. `GET /api/analyse` et `GET /api/rapport` relancent les tâches en attente ou abandonnées (`relancer`, `src/server/donnees.ts`), `GET /api/fiche` une mise à jour de la mémoire restée en plan. Ouvrir le rapport planifie aussi ce qui n’a jamais été lancé : le rapport et la mémoire d’un accès donné après coup (`assurerLaSuite`), le vocal d’un rapport écrit avant lui. « Relancer l’écriture » (`POST /api/rapport`) remet en attente, avec trois nouveaux essais, les étapes du rapport en échec (`reprendre`).

## Les paramètres d’URL

Ce qui relie les écrans par l’adresse :

- `?suite=<chemin>` sur `/connexion`, `/connexion/code` et `/rapport/debloque` : la page où reprendre ensuite. Seulement une adresse de l’appli (`suiteSure`, `src/lib/suite.ts`). Les pages qui demandent une session le posent, en général par `connexionPuis(chemin)` : le lien d’un mail ouvert ailleurs (`/ouvrir/<id>`), Mon compte, l’écran de lecture, les captures en bêta fermée.
- `?erreur=<code>` : l’écran d’erreur du parcours d’import, par-dessus n’importe quelle route (`src/components/screens/ErreurDeParcours.tsx`, les codes dans `ERREURS_PARCOURS`). L’écran de l’export et celui des captures le posent eux-mêmes (`fichier`, `groupe`, `courte`, `capture`, `video`, `longue`) ; aucun écran ne pose plus `lecture` : on n’y arrive qu’en tapant l’adresse.
- `?app=` : l’appli de la conv, sur `/importer/export` (`whatsapp` ou `instagram`) et `/importer/captures` (`instagram`, `hinge`, `imessage`, `whatsapp` ou `autre` : `src/app/importer/captures/adresse.ts`). `/importer/export?app=imessage` mène aux captures (`next.config.ts`) : iMessage ne s’exporte pas, on filme son écran.
- `?mode=ajout` sur `/importer/captures` : des captures ajoutées à un export, puis `/importer/histoire`. En sommeil : seul `/importer/histoire` y mène, et `/api/captures` refuse ces captures, en attendant la fusion d’un export et de captures.
- `/rapport?paiement=1` : ouvre directement le panneau de paiement (écran 10), comme « Lire la suite » dans Mon compte.
- `/rapport/debloque?offre=rapport` ou `?offre=blushplus` : « C’est débloqué », après le panneau de paiement (avec `&suite=` quand il s’est ouvert sur un autre écran que le rapport : on y revient ensuite).
- `/app?depuis=rapport` : l’accueil ouvert depuis le rapport (sa bulle de chat, ou le bouton du chat).
- `/attente/retirer?id=…&cle=…` : le lien signé du mail de la liste d’attente.
- `/admin?p=1`, `?p=7` (par défaut) ou `?p=30` : la période du tableau de bord.

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

Le schéma `Env` (`src/server/env.ts`) les vérifie au premier usage, pas au build : une variable manquante ou mal formée fait échouer la requête, avec un message clair dans les logs, jamais dans la réponse. Les listes d’emails y sont lues une fois (sans espaces, en minuscules).

En production (`VERCEL_ENV=production`, pas les préversions), `env()` refuse aussi de tourner, et dit pourquoi dans les logs, si `BLUSH_BETA_FERMEE` n’est pas écrite, si `CRON_SECRET` manque, ou si `BLUSH_ACCES_LIBRE` vaut `*` : une variable oubliée lors d’un ménage ne doit ni ouvrir la bêta ou BLUSH+ à tous, ni arrêter la purge sans bruit. À vérifier avant une mise en ligne : `vercel env ls production` montre les noms, sans les valeurs.

| Variable | Rôle | Par défaut | En production |
|---|---|---|---|
| `DATABASE_URL` | Postgres : celui de la machine en dev, Neon en production | aucun, exigée | L’URL **avec pooler** de Neon, ajoutée par Vercel. Les migrations du build prennent `DATABASE_URL_UNPOOLED` quand elle est là |
| `BLUSH_CLE` | La clé de chiffrement du contenu, 32 octets en base64 (`openssl rand -base64 32`), jamais dans la base. **À garder précieusement** : la perdre rend les données illisibles | aucun, exigée | Sa propre clé, dont une copie reste hors de Vercel (voir « Mise en ligne ») |
| `ANTHROPIC_API_KEY` | La clé de l’API du modèle | aucun | Exigée : sans elle (et sans le modèle factice, toujours éteint sur Vercel), `env()` échoue, et toute route avec. Une clé à part, avec un plafond de dépenses |
| `ANTHROPIC_WORKSPACE_ID` | Le workspace, quand la clé n’est rattachée à aucun | aucun | Seulement si la clé le demande |
| `MISTRAL_API_KEY` | La transcription des vocaux du chat (Voxtral, serveurs en Europe), prioritaire quand elle est là | aucune | Sans elle, ElevenLabs transcrit ; sans aucune des deux clés, le chat répond que les vocaux arrivent bientôt |
| `ELEVENLABS_API_KEY` | La voix de BLUSH (le vocal du rapport, les réponses dites en vocal), et la transcription sans clé Mistral | aucune | Sans elle, ou sans `BLUSH_VOIX_A`, pas de vocal |
| `BLUSH_VOIX_A`, `BLUSH_VOIX_B` | Les identifiants ElevenLabs des deux voix de l’A/B test : chaque compte garde toujours la même | aucune | Sans voix B, tout le monde a la A |
| `RESEND_API_KEY` | L’envoi des mails (les codes, la liste d’attente, « ton rapport est prêt », les alertes) | aucune : en dev, le code s’affiche dans les logs | Exigée (`NODE_ENV=production`), sauf pour la boîte à mails des tests de bout en bout |
| `BLUSH_EMAIL_FROM` | L’expéditeur des mails, sur un domaine vérifié chez Resend | `BLUSH <bonjour@askblush.com>` | Le défaut (aussi écrite dans Vercel) |
| `BLUSH_URL` | L’adresse du site : les images et les liens des mails, et l’adresse de base des pages sur Vercel (`layout.tsx`, par `URL_SITE`) | `https://www.askblush.com` | Le défaut |
| `BLUSH_ACCES_LIBRE` | La bêta sans paiement : les emails qui ont BLUSH+ d’office, séparés par des virgules, ou `*` pour tout le monde (en dev) | vide : personne | Les emails des testeurs. `*` y est refusée : le plan donné n’est jamais repris |
| `BLUSH_BETA_FERMEE` | `1` : la bêta fermée. Seuls les emails de `BLUSH_ACCES_LIBRE` se connectent (et lancent une lecture) ; les autres rejoignent la liste d’attente. Lue à l’exécution, par `src/proxy.ts` aussi (`src/server/drapeaux.ts`) : un même build sert la bêta ouverte ou fermée | `0` : ouverte | Exigée, écrite exprès (`1` ou `0`) : son défaut ouvrirait la bêta |
| `BLUSH_ALERTES` | Qui reçoit les alertes (un échec définitif) et le résumé de chaque nuit : un ou des emails, séparés par des virgules | aucune : pas d’alerte | À écrire, sinon un échec ne prévient personne |
| `BLUSH_ADMINS` | Qui peut ouvrir le tableau de bord (`/admin`) : un ou des emails, séparés par des virgules | ceux de `BLUSH_ALERTES` | Pour tous les autres, `/admin` n’existe pas (404) |
| `CRON_SECRET` | Le secret que Vercel Cron envoie à `/api/cron/purge` (16 caractères au moins) | aucun | Exigé : sans lui, la purge de nuit répondrait 401 et ne tournerait jamais |
| `BLUSH_IA_FACTICE` | `1` en dev et en tests : le modèle rejoue des sorties enregistrées, sans aucun coût (`src/server/ia/factice.ts`) | `0` | Ignorée sur Vercel, avec un avertissement dans les logs : la production appelle toujours le vrai modèle |
| `BLUSH_BOITE_MAILS` | Tests de bout en bout : le dossier où les mails sont écrits au lieu de partir. Avec le modèle factice seulement | aucune | Ignorée sur Vercel : les mails partent toujours par Resend |

`tests/documentation.test.ts` échoue si une variable du schéma manque à ce tableau, ou si ce tableau en cite une qu’il ne connaît pas.

Lues hors du schéma, par `src/server/drapeaux.ts` (sans `server-only` : le proxy et les pages rendues au build le lisent) : `VERCEL` (posée par Vercel : le modèle factice et la boîte à mails y sont ignorés, et les outils de l’équipe, `/apercu` et `/styleguide`, y répondent 404), `VERCEL_ENV` (`production` : les garde-fous ci-dessus), `BLUSH_BETA_FERMEE` pour le proxy et la page des captures de la bêta fermée, et hors de Vercel seulement `BLUSH_APERCU` et `BLUSH_DEMANDER` (les aperçus de `/apercu`). Ailleurs : `NODE_ENV`, `DATABASE_URL_UNPOOLED` (les migrations du build, `scripts/migrer.mjs`), `DATABASE_URL_TEST` et les `E2E_*` des tests. ESLint refuse `process.env` dans le reste de `src`, sauf pour `NODE_ENV`.

## En local

```bash
cp .env.example .env.development.local   # une fois : la configuration de dev, fictive
npm run dev
```

`npm run dev` (`scripts/developper.mjs`) lit les fichiers `.env` comme `next dev`, crée la base `blush_dev` si elle manque (sans jamais l’effacer), y applique les migrations, puis lance `next dev`. Ce qu’on lui donne dans le shell l’emporte (`DATABASE_URL=postgres://localhost:5432/blush_dev_<nom> npm run dev`). Avec le modèle factice (`BLUSH_IA_FACTICE=1`), il refuse les clés d’API : une vraie clé ferait partir de vrais appels. Seul `next dev` lit `.env.development.local` : ni `npm run build`, ni les tests de bout en bout ne le voient.

En dev, le code de connexion s’affiche dans les logs du serveur.

Les tests vitest forment deux projets (`vitest.config.mts`) : `unit`, sans base (les règles pures de `tests/unit`, et les fichiers de `tests/` que la config liste), que `npm run test:unit` lance seul, sans Postgres ; et `db`, tout le reste. Ceux-ci tournent sur la base `blush_test`, ou celle de `DATABASE_URL_TEST` : `npm test` la crée si elle manque et la migre (`tests/preparer-la-base.ts`), sans jamais l’effacer. `blush_test` sert à tous les dossiers du projet sur la machine : sans `DATABASE_URL_TEST`, elle n’est migrée que si elle vient d’être créée, et une migration qui lui manque arrête les tests (prendre alors `DATABASE_URL_TEST=postgres://localhost:5432/blush_test_<nom>`). `npm run check` lance tout ce que la CI vérifie avant le build : les types, le lint, la cohérence des migrations (`scripts/verifier-migrations.mjs` : le journal de `drizzle/`, `drizzle-kit check`, puis `drizzle-kit generate` sur une copie, qui ne doit rien trouver à migrer) et les tests.

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
- La référence visuelle des écrans de la production (`tests/e2e/visuel.spec.ts`, voir son en-tête) : `E2E_VISUEL_DIR=<dossier hors du dépôt> npm run e2e:visuel -- --update-snapshots` pose les captures avant un changement, puis `E2E_VISUEL_DIR=<le même dossier> npm run e2e:visuel` compare après, au pixel près (même machine). Ni `npm run e2e` ni la CI ne la lancent.

La galerie des écrans (`npm run galerie`) et le banc de fluidité de l’accueil (`npm run fluidite`) tournent sur ce même build et ce même serveur, avec leur propre base et des comptes semés par les aides des tests (README, « La galerie »).

Pour mesurer les prompts avec le vrai modèle, il y a aussi `scripts/essai-memoire.mts` (les mises à jour de la mémoire, échange par échange), `scripts/essai-captures.mts` (la lecture des captures, comparée mot pour mot aux captures fabriquées par `prompts/evals/captures/fabriquer.mjs` ; un profil fictif avec `prompts/evals/captures/profil.mjs`) et `scripts/essai-ajouts.mts` (des messages et un profil envoyés après l’import : la réponse du chat, puis la mise à jour de la mémoire).

Les messages ajoutés après l’import prennent des numéros à la suite de la conv (`stories.next_message`, réservés d’un coup), et `context.dernier` garde l’heure du dernier message lu : un export renvoyé n’apporte que ce qui est nouveau.

Avant une mise en ligne, un test de fumée avec le **vrai** modèle (environ 1 $). Une conv de test courte traverse tout le back-end, puis tout est effacé. Mesuré le 7 octobre : 194 s et 1,07 $ pour les 6 appels.

```bash
NODE_OPTIONS=--conditions=react-server DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npx tsx scripts/essai-vrai-modele.mts
```

## Mise en ligne

Déjà fait (production, sur Vercel) : `BLUSH_CLE` (une copie locale dans `~/.blush/BLUSH_CLE`, à ranger dans un gestionnaire de mots de passe : la perdre rend les données illisibles), `CRON_SECRET`, `BLUSH_EMAIL_FROM` (`BLUSH <bonjour@askblush.com>`, aussi le défaut). Les variables sont « sensibles » : Vercel ne les rend plus, même à nous.

1. **La base :** créer une base Neon depuis Vercel (projet blush-front, onglet Storage, région Francfort, « Connect »). Vercel ajoute `DATABASE_URL` tout seul. Les tables se créent au build (`scripts/migrer.mjs`, lancé par `prebuild` sur Vercel) : pas besoin de l’URL en local.
2. **Les variables qui restent :** `RESEND_API_KEY`, `ANTHROPIC_API_KEY` (une clé à part, avec un plafond de dépenses), `BLUSH_ACCES_LIBRE` (les emails des testeurs).
3. **Le déploiement :** par la CI seulement, et toujours à la main : « Run workflow » sur `main` (onglet Actions de `blush-front`), ou `gh workflow run CI --ref main`. Ce lancement refait les vérifications et les tests de bout en bout sur la tête de `main`, puis `vercel deploy --prod` depuis GitHub (le sous-module `prompts/` compris ; `.vercelignore` garde `prompts/evals` hors de Vercel). Un push sur `main` ne déploie rien. Plus jamais `vercel deploy` depuis un dossier local. Pas d’intégration Git côté Vercel : `vercel.json` coupe ses déploiements automatiques, au cas où le dépôt y serait relié un jour.
4. **Donner l’accès à un ami pendant la bêta :** ajouter son email à `BLUSH_ACCES_LIBRE`, puis relancer la mise en production (un nouveau « Run workflow » sur `main` : un « Re-run » d’un ancien lancement s’arrête si `main` a avancé depuis), ou, avec l’URL de la base :
   ```bash
   DATABASE_URL=<url> npm run acces -- ami@exemple.fr blushplus
   ```
