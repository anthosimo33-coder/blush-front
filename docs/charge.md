# La mesure de charge (12 octobre 2026)

Ce que `npm run charge` (README, « Le test de charge ») a mesuré sur le build de production, avant l’ouverture : jusqu’où un seul processus `next start` tient des parcours complets en même temps, ce qui lâche en premier, et ce que ça veut dire pour Vercel et Neon. Les rapports bruts de chaque lancement s’écrivent dans `test-results/charge/` (hors du dépôt) ; ce fichier en garde les chiffres.

## Comment

- **Le parcours** : celui de l’appli, par ses routes `/api`, avec ses cookies et sa propre adresse IP. Le CAPTCHA (clés de test), l’import d’une conv inventée (avec la version de l’accord), le code lu dans la boîte à mails des tests, la connexion, « Qui es-tu ? », l’attente du verdict, la commande du rapport (13,90 €), le webhook signé du faux Whop, l’attente du rapport débloqué et écrit, trois messages au chat (trois bulles), puis le solde, qui doit valoir 7. Environ 17 requêtes par parcours.
- **Les paliers** : 25, 50, 100, puis 200 parcours, lancés sur une montée de 30 s (`--montee 30`), chacun une fois ; puis au-delà, jusqu’au palier qui décroche. Ensuite, la charge soutenue (`--duree 90` : chaque parcours fini en relance un, N à la fois pendant 90 s).
- **Le réseau jusqu’à la base** (`--latence 2`) : un relais TCP entre l’appli et Postgres ajoute 2 ms à chaque aller-retour, de l’ordre de ce qui sépare une fonction Vercel de `fra1` de Neon à Francfort, pooler compris. Le relais compte aussi les connexions prises vues de l’appli : la base les croit au repos pendant que les octets voyagent.
- **Le webhook rejoué** (`--rejeu`) : chaque webhook de paiement arrive deux fois en même temps, comme Whop peut le faire. Le solde de 7 bulles vérifie qu’un seul livre.
- **La machine** : macOS, 12 cœurs, 24 Go, Node 20, Postgres 16 (Homebrew, `max_connections` 100), le modèle factice (une réponse écrite d’avance, aussitôt), le faux Whop. **Deux autres agents tournaient en même temps sur la même machine et le même Postgres** (leurs builds, leurs tests de bout en bout) : la charge de la machine (`uptime`, sur une minute) est notée à chaque palier, et allait de 6 à 90. Les chiffres bougent avec elle : à code égal, le plafond d’un processus est passé de 480 à 340 requêtes par seconde entre le début et la fin de la soirée.

En tout : 53 lancements, 26 177 parcours, environ 500 000 requêtes. **Aucune erreur** (ni 500, ni délai dépassé), aucun solde de bulles faux, aucun interblocage, aucun webhook rejoué qui livre deux fois, aucune connexion jamais rendue (les connexions de l’appli restent 5, du début à la fin de chaque lancement).

## Les paliers demandés

Le code de départ (`72171dd`), sans réseau simulé. Le temps d’un parcours est surtout fait de deux attentes : l’écran relit le verdict, puis le rapport, chaque seconde (le modèle factice répond tout de suite) ; le serveur, lui, en prend environ 200 ms.

| Parcours (sur 30 s) | Charge de la machine | Réussis | Parcours p50 / p95 | Requêtes/s | Processeur (moy. / max) | Pool plein | Erreurs |
| ------------------- | -------------------- | ------- | ------------------ | ---------- | ----------------------- | ---------- | ------- |
| 25                  | 16 → 21              | 25      | 2,2 s / 2,4 s      | 14         | 10 % / 41 %             | 0 %        | 0       |
| 50                  | 17 → 14              | 50      | 2,2 s / 2,2 s      | 27         | 17 % / 31 %             | 0 %        | 0       |
| 100                 | 14 → 14              | 100     | 2,2 s / 2,3 s      | 53         | 30 % / 49 %             | 0 %        | 0       |
| 200                 | 14 → 11              | 200     | 2,2 s / 2,2 s      | 106        | 42 % / 67 %             | 0 %        | 0       |

Aucun ne casse : 200 parcours en 30 s, c’est 7 nouveaux parcours par seconde, que le processus sert à 40 % d’un cœur. On a donc continué.

| Parcours (sur 30 s) | Charge de la machine | Réussis | Parcours p50 / p95 | Requêtes/s | Processeur (moy. / max) | Pool plein |
| ------------------- | -------------------- | ------- | ------------------ | ---------- | ----------------------- | ---------- |
| 400                 | 10 → 11              | 400     | 2,2 s / 2,2 s      | 212        | 63 % / 89 %             | 0 %        |
| 800                 | 11 → 12              | 800     | 2,2 s / 2,3 s      | 423        | 97 % / 137 %            | 0 %        |
| **1 000**           | 14 → 16              | 1 000   | **9,0 s / 12,1 s** | 470        | 118 % / 142 %           | 0 %        |
| 1 200               | 10 → 14              | 1 200   | 23 s / 28 s        | 450        | 116 % / 143 %           | 1 %        |
| 1 600               | 12 → 10              | 1 600   | 40 s / 45 s        | 482        | 117 % / 151 %           | 1 %        |

**Le décrochage : entre 800 et 1 000 parcours sur 30 s** (27 à 33 nouveaux parcours par seconde), quand le processus plafonne vers 450 à 480 requêtes par seconde. Au-delà, rien n’échoue : les requêtes font la queue, et le p95 d’un parcours passe de 2,3 s à 12 s, puis 45 s. Plus tard dans la soirée (charge de 6 à 8, mais un plafond plus bas sur cette machine partagée), le même code et le code final décrochaient dès 800 parcours (p95 20 s, 340 requêtes par seconde, les deux à égalité : 338 et 339).

En charge soutenue (N parcours à la fois pendant 90 s, sans montée qui étale) :

| À la fois | Charge de la machine | Parcours faits | Débit          | Parcours p50 / p95 | Processeur (moy. / max) |
| --------- | -------------------- | -------------- | -------------- | ------------------ | ----------------------- |
| 50        | 14 → 19              | 1 738          | 1 132 par min. | 2,2 s / 2,3 s      | 72 % / 104 %            |
| 100       | 18 → 13              | 2 498          | 1 622 par min. | 3,1 s / 3,7 s      | 98 % / 131 %            |
| 200       | 12 → 16              | 2 491          | 1 542 par min. | 6,8 s / 9,3 s      | 110 % / 139 %           |

## Avec le réseau jusqu’à la base (2 ms par aller-retour)

Le même parcours, chaque webhook rejoué (`--latence 2 --rejeu`). Le pool de l’appli (5 connexions par processus au moment de ces mesures, 20 depuis le 13 octobre, `src/server/db/index.ts`) est jugé plein sur les connexions prises vues de l’appli.

| Parcours (sur 30 s) | Code   | Charge de la machine | Parcours p50 / p95 | Requêtes/s | Processeur (moy. / max) | Pool plein |
| ------------------- | ------ | -------------------- | ------------------ | ---------- | ----------------------- | ---------- |
| 25                  | départ | 26 → 21              | 2,5 s / 2,6 s      | 14         | 12 % / 53 %             | 2 %        |
| 50                  | départ | 20 → 19              | 2,6 s / 2,8 s      | 28         | 21 % / 36 %             | 4 %        |
| 100                 | départ | 18 → 16              | 2,6 s / 2,7 s      | 56         | 34 % / 54 %             | 9 %        |
| **200**             | départ | 15 → 17              | **4,4 s / 7,6 s**  | 105        | 48 % / 63 %             | **65 %**   |
| 400                 | départ | 18 → 14              | 52 s / 56 s        | 109        | 46 % / 72 %             | 69 %       |
| 200                 | final  | 9 → 8                | 4,1 s / 4,5 s      | 109        | 51 % / 75 %             | 56 %       |
| 400                 | final  | 8 → 7                | 45 s / 51 s        | 119        | 53 % / 84 %             | 63 %       |

**Le décrochage : dès 200 parcours sur 30 s**, quatre fois plus tôt que sans réseau, avec un processeur à moitié libre. Le plafond est celui du pool : 105 à 120 requêtes par seconde par processus.

Le même essai avec un pool de 15 connexions (un build fait pour la mesure, jamais commité) :

| Parcours (sur 30 s) | Code              | Charge de la machine | Parcours p50 / p95 | Requêtes/s | Processeur (moy. / max) | Pool plein | Attentes de verrou (max) |
| ------------------- | ----------------- | -------------------- | ------------------ | ---------- | ----------------------- | ---------- | ------------------------ |
| 400                 | départ            | 20 → 21              | 2,5 s / 2,6 s      | 222        | 74 % / 107 %            | 6 %        | 3                        |
| 800                 | départ            | 19 → 18              | 44 s / 51 s        | 220        | 99 % / 147 %            | 20 %       | 11                       |
| 800                 | le verrou du chat | 16 → 19              | 38 s / 43 s        | 259        | 109 % / 143 %           | 88 %       | 3                        |

Avec 15 connexions, le pool ne lâche plus en premier : le plafond double (220 à 260 requêtes par seconde), et c’est de nouveau le processeur, plus le verrou du chat (plus bas).

## Ce qui sature en premier

1. **Sans réseau : le processeur du processus Node.** Le JavaScript tourne sur un seul cœur : 340 à 480 requêtes par seconde selon l’état de la machine, soit 1 000 à 1 500 parcours par minute. La base ne limite jamais : pool plein dans 1 % des relevés au plus, aucune requête lente avant la saturation du processus, 0 interblocage. Elle valide environ 12 transactions par requête (chaque requête hors transaction en est une), jusqu’à 5 600 par seconde.
2. **Avec 2 ms de réseau : le pool de 5 connexions.** Une connexion reste prise pendant chaque aller-retour, et une route en enchaîne beaucoup, l’une après l’autre (mesuré par la différence entre 0 et 2 ms, à 25 et 50 parcours) : environ 18 pour un message du chat, 22 pour le webhook de paiement, 16 pour la connexion par code, 14 pour lancer la lecture, 8 ou 9 pour l’import et la commande, 4 à 7 pour les routes que l’écran relit (`GET /api/analyse`, `GET /api/rapport`, l’état d’un achat). Le plafond d’un processus vaut à peu près 5 connexions ÷ (aller-retour × allers-retours par requête) : il suit 1 ÷ l’aller-retour (à 10 ms, environ cinq fois moins qu’à 2 ms).
3. **Le verrou commun du chat** (corrigé ici). Chaque message prend ses deux identifiants (`reserverEchange`, `src/server/chat.ts`) sous un verrou consultatif unique, pour tous les comptes et toutes les instances. Pris dans une transaction (BEGIN, le verrou, les identifiants, COMMIT), il durait quatre allers-retours, et plus encore sur une instance occupée. À 800 parcours avec 2 ms de réseau, `select pg_advisory_xact_lock` sortait parmi les requêtes lentes (129 ms), avec jusqu’à 11 requêtes en attente de verrou. Il se prend maintenant en un seul message (deux instructions, une transaction implicite) : 3 attentes au plus, le débit passe de 220 à 259 requêtes par seconde (pool de 15), de 109 à 119 (pool de 5). Test : `tests/chat-echanges.test.ts`.

## Ce que ça veut dire pour Vercel et Neon

- **Aucun appel au modèle ne garde une connexion** : les transactions du serveur (bulles, achats, offres uniques, suppression du compte, identifiants du chat) n’attendent jamais l’IA. Les 10 à 60 s d’un verdict, d’un rapport ou d’une réponse du chat occupent la fonction, pas la base.
- **Le pool de 5 par instance sera la première limite d’une instance**, bien avant son processeur : avec 1 à 2 ms jusqu’à Neon, de l’ordre de 100 requêtes par seconde. Sous Fluid compute, une instance sert beaucoup de requêtes à la fois : celles qui attendent une connexion libre ne se voient ni dans la base, ni dans le processeur, seulement dans le temps des routes (et au bout de 30 s, `connectionTimeoutMillis`, une erreur 500).
- **Les connexions à Neon** : 5 par instance, toutes passées par le pooler de Neon (`DATABASE_URL` avec pooler), qui en accepte des milliers et les sert avec un petit nombre de vraies connexions, bornées par la taille du calcul de Neon (son `max_connections`). Vingt instances ouvrent 100 connexions au pooler, sans risque ; ce sont les vraies connexions derrière lui, et le temps de calcul de Neon, qu’il faut surveiller (console de Neon).
- **En vrai, les relectures pèsent plus que le parcours** : ici, le verdict et le rapport arrivent en 1 s, et l’écran ne relit chacun que deux fois. Avec le vrai modèle, il relit le verdict chaque seconde pendant 10 à 60 s et le rapport pendant une à deux minutes : de l’ordre de 50 à 150 relectures par parcours au lieu de 4, chacune de 4 à 7 allers-retours. C’est là que partira l’essentiel du temps de base.
- **Ce qui arrêtera l’ouverture bien avant** : le plafond des mails (`BLUSH_MAILS_PAR_JOUR`, 100 par défaut : 60 codes de connexion par jour, donc 60 nouveaux comptes au plus), le budget de l’IA par jour, les limites par adresse IP (20 lectures par jour, 20 codes par heure : un réseau mobile qui partage ses adresses IPv4 les atteint vite), et le plan de Vercel (le plan gratuit est réservé à un usage non commercial : à vérifier avant de vendre).

## Les réglages conseillés

- **Le pool : 10 à 15 connexions par instance** (`max` dans `src/server/db/index.ts`) : mesuré ici, 15 double le débit d’un processus avec 2 ms de réseau, sans erreur. Chaque instance de Vercel ouvre jusqu’à ce nombre de connexions au pooler de Neon. Décidé le 13 octobre : 20, avec Neon payant (Launch, sans mise en veille) : Vercel multiplie les instances, le pooler de Neon en accepte des milliers.
- **Garder Vercel en `fra1` et Neon à Francfort** (`vercel.json`, BACKEND.md) : chaque milliseconde de plus sur l’aller-retour se paie sur le débit du pool (il suit 1 ÷ l’aller-retour : passer de 2 à 3 ms en retire un tiers).
- **Relever `BLUSH_MAILS_PAR_JOUR` avec un plan payant de Resend** avant d’inviter la liste d’attente par lots : c’est la première limite qu’un afflux atteindra.
- **Espacer les relectures de l’écran** pendant que le rapport s’écrit (toutes les 2 à 3 s plutôt qu’une, avec un plafond) si la base de Neon chauffe : c’est la part de la charge qui grandit avec la durée des appels au modèle.
- **Surveiller** : les connexions et le temps de calcul dans la console de Neon, la durée des fonctions et les erreurs 500 dans Vercel, et la veille (`.github/workflows/veille.yml`).

## Ce qui reste à voir

- `prendre` (`src/server/taches.ts`) promet « jamais deux étapes d’une conv en même temps », mais sa garde (`autreEnCours`) lit la base d’avant sa requête : deux `prendre` lancés au même instant sur deux étapes différentes de la même conv réussissent tous les deux (39 fois sur 40, dans un test qui les lance ensemble). Le moteur ne s’y expose presque jamais : deux chaînes qui partent ensemble prennent la même première tâche (`aRelancer`, dans l’ordre de planification), et une seule l’obtient. Le test de charge le vérifie à la fin de chaque lancement (deux étapes finies d’une même conv dont les temps se croisent) : 0 partout. Le corriger (verrouiller la ligne de la conv le temps de prendre) coûte trois allers-retours par étape ; à décider.
- Le relevé du pool dans le rapport lit `src/server/db/index.ts`, pas le build : un build fait avec un autre réglage (comme celui à 15 connexions plus haut) y est mal étiqueté.
- Ni les pages, ni les fichiers statiques, ni le vrai modèle, ni Vercel, ni Neon : un seul processus, sur une machine partagée. Les chiffres donnent des ordres de grandeur et ce qui lâche en premier, pas la capacité de la production.
