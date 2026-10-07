# Le back-end de BLUSH

Le back-end vit dans ce projet Next.js. Il s’allume avec `NEXT_PUBLIC_BLUSH_BACKEND=1`. Sans cette variable, l’appli garde ses données de démo : le site de démo, la galerie des écrans et les captures ne changent pas.

## Ce qu’il fait

| Étape | Route | Où |
|---|---|---|
| Import d’un export WhatsApp (.zip ou .txt) en histoire brouillon, avant l’email | `POST /api/import` | `src/server/histoires.ts` |
| Code de connexion à 6 chiffres, session en cookie httpOnly | `POST /api/auth/code`, `/api/auth/verifier`, `/api/auth/deconnexion` | `src/server/auth.ts` |
| La lecture : le verdict, puis (avec l’accès) le plan du rapport, ses deux moitiés et la mémoire | `POST/GET /api/analyse` | `src/server/analyse.ts`, `src/server/taches.ts` |
| Le rapport (le verdict seul sans accès) | `GET /api/rapport` | `src/server/donnees.ts` |
| Débloquer (v1 sans paiement : les emails de `BLUSH_ACCES_LIBRE`) | `POST /api/debloquer` | |
| Le chat, d’après la mémoire ; l’historique ; la mise à jour de la mémoire | `POST/GET /api/chat` | `src/server/chat.ts` |
| Sa fiche, et les corrections de l’utilisateur | `GET/PUT /api/fiche` | |
| Le compte, la pause, les suppressions | `/api/compte`, `/api/histoire` | |
| La purge de nuit (Vercel Cron) | `GET /api/cron/purge` | `src/server/purge.ts` |

Les pages serveur lisent les données via `src/services/serveur.ts`, et le navigateur passe par `src/services/api.ts`, qui appelle `src/services/reel.ts`.

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
  - une conv qui n’est pas allée jusqu’au rapport est effacée au bout de 30 jours.
- **Les suppressions effacent vraiment tout,** en cascade.
- **Les logs ne contiennent aucun contenu,** seulement des codes d’erreur et les coûts (`ai_usage`).
- **Les cookies sont httpOnly,** et toute requête qui modifie quelque chose doit venir de l’appli elle-même (contrôle d’origine).
- **Des limites anti-abus** (`src/server/limites.ts`) bornent les codes, les imports et le chat.

## Variables d’environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_BLUSH_BACKEND` | `1` allume le back-end |
| `DATABASE_URL` | Postgres. En production, l’URL **avec pooler** de Neon |
| `BLUSH_CLE` | La clé de chiffrement : `openssl rand -base64 32`. **À garder précieusement** : la perdre rend les données illisibles |
| `ANTHROPIC_API_KEY` | La clé de l’API Claude. `ANTHROPIC_WORKSPACE_ID` si la clé n’a pas de workspace |
| `RESEND_API_KEY`, `BLUSH_EMAIL_FROM` | L’envoi des codes. Il faut un domaine vérifié chez Resend |
| `BLUSH_ACCES_LIBRE` | La bêta sans paiement : des emails séparés par des virgules, ou `*` |
| `CRON_SECRET` | Le secret de la purge de nuit (16 caractères au moins) |
| `BLUSH_IA_FACTICE` | `1` en dev et en tests : un modèle factice, sans aucun coût |

## En local

```bash
createdb blush_dev && DATABASE_URL=postgres://localhost:5432/blush_dev npm run db:migrer
```

```bash
NEXT_PUBLIC_BLUSH_BACKEND=1 DATABASE_URL=postgres://localhost:5432/blush_dev BLUSH_CLE=$(openssl rand -base64 32) BLUSH_IA_FACTICE=1 BLUSH_ACCES_LIBRE='*' npm run dev
```

En dev, le code de connexion s’affiche dans les logs du serveur.

Les tests tournent sur la base `blush_test` : `createdb blush_test`, puis les migrations, puis `npm test`.

## Mise en ligne

1. **La base :** créer une base Neon (Vercel, onglet Storage, région Francfort), puis lancer les migrations :
   ```bash
   DATABASE_URL=<url Neon> npm run db:migrer
   ```
2. **Les variables :** les mettre sur Vercel, en production.
3. **Le déploiement :** depuis un dossier où le sous-module `prompts/` est présent :
   ```bash
   vercel deploy --prod
   ```
4. **Donner l’accès à un ami pendant la bêta :**
   ```bash
   DATABASE_URL=<url> npm run acces -- ami@exemple.fr blushplus
   ```
