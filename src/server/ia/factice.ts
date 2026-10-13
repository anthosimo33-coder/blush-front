import "server-only";
import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Requete } from "@prompts/lib/contextes";
import { estLigneMessage, idDeLigne, lireLigne } from "@prompts/lib/ligne";
import type { Captures, Chapitre, Etape05, Maj, Memoire, Rapport, ReponseChat, Verdict, Vocal } from "@prompts/lib/schemas";
import type { Ecoute, Fournisseur, MessageRecu, Partie } from "./claude";
import { FACTICE } from "./factice-valeurs";

/*
 * Un modèle factice (BLUSH_IA_FACTICE=1, pour les tests et le dev sans coût) : des sorties valides, qui citent de vrais
 * identifiants de la conv. Chacune est écrite au type de son schéma (`satisfies`), et tests/unit/factice.test.ts les
 * passe toutes par leur schéma : une sortie factice qui ne le passerait plus serait rejouée en silence (appeler). Ce
 * qu’elles écrivent (24 messages, 8 chapitres, la ligne de profil) et leurs déclencheurs sont dans FACTICE
 * (src/server/ia/factice-valeurs.ts), que les tests lisent. Il répond comme un prestataire (prestataireFactice) : appeler
 * (src/server/ia/claude.ts) le lit comme le vrai, refus et flux compris.
 */

/** La requête telle que la reçoit le modèle factice : avec sa partie (appeler l’ajoute ; le vrai modèle la lit dans la demande). */
export type RequeteFactice = Requete & { partie?: Partie };

const textes = (req: Requete) => req.blocs.flatMap((b) => ("texte" in b ? [b.texte] : []));
const ids = (req: Requete) => [...new Set(textes(req).join("\n").split("\n").filter(estLigneMessage).map(idDeLigne))];

/** Ce qu’une sortie factice rend pour simuler un refus du modèle (prestataireFactice le rend comme un vrai refus). */
export const REFUS_FACTICE = "@@refus@@";
/** Un refus avec sa catégorie, comme les filtres du prestataire (« cyber ») : le code d’erreur la porte (« refus:cyber »). */
export const refusFactice = (categorie: string) => `${REFUS_FACTICE}:${categorie}` as const;

/** Ce que rend le modèle factice : la sortie d’une tâche, au type de son schéma, ou un refus (REFUS_FACTICE, refusFactice). */
type SortieFactice = Captures | Verdict | Rapport | z.infer<typeof Etape05> | Vocal | Memoire | Maj | ReponseChat | typeof REFUS_FACTICE | ReturnType<typeof refusFactice>;

/** Un libellé que le modèle factice doit lire dans la demande : absent, il le dit, au lieu de répondre à côté en silence. */
function lu<T>(valeur: T | undefined | null, quoi: string, req: Requete): T {
  if (valeur == null) throw new Error(`modèle factice : ${quoi} introuvable dans la demande (${req.tache}), le libellé a changé ?`);
  return valeur;
}

/** Les numéros des chapitres d’une moitié du rapport (FACTICE.chapitres, en deux moitiés égales). */
const moitie = (premiere: boolean) => Array.from({ length: FACTICE.chapitres / 2 }, (_, k) => k + 1 + (premiere ? 0 : FACTICE.chapitres / 2));

const chapitre = (numero: number, preuve: string): Chapitre => ({
  numero,
  titre: `Chapitre ${numero}`,
  titre_court: FACTICE.titreCourt(numero),
  surtitre: null,
  blocs: [
    { type: "accroche", texte: "Assieds-toi.", preuves: [], titre: null, niveau: null, items: null },
    { type: "recit", texte: "Le soir où tout a basculé.", preuves: [preuve], titre: null, niveau: null, items: null },
    { type: "chute", texte: "Et voilà.", preuves: [], titre: null, niveau: null, items: null },
  ],
});

export function fournisseurFactice(req: RequeteFactice): SortieFactice {
  /* Lire des captures : une transcription fixe (FACTICE.messagesCaptures, en deux soirées), l’avant-veille et la veille du jour de la requête, et une ligne de son profil */
  if (req.tache === "01-captures") {
    const auj = Date.parse(`${lu(textes(req)[0]?.match(/aujourd’hui : \S+ (\d{4}-\d{2}-\d{2})/)?.[1], "« aujourd’hui : »", req)}T00:00:00Z`);
    const parSoiree = FACTICE.messagesCaptures / 2;
    const veille = (k: number) => new Date(auj - k * 86400e3).toISOString().slice(0, 10);
    return {
      appli: "instagram",
      autre: "Elias",
      captures: req.blocs.filter((b) => "image" in b).map((_, k) => ({ numero: k + 1, place: k + 1, hors_sujet: false })),
      blocs: [
        {
          repere: { date: veille(2), heure: "13:12" },
          messages: Array.from({ length: parSoiree }, (_, k) => ({ de: k % 2 ? "moi" : "autre", texte: `message ${k + 1}`, media: null, coupe: false, reaction: null })),
        },
        {
          repere: { date: veille(1), heure: "21:05" },
          messages: Array.from({ length: parSoiree }, (_, k) => ({
            de: k % 2 ? "autre" : "moi",
            texte: `suite ${k + 1}`,
            media: k === 3 ? "photo" : null,
            coupe: false,
            reaction: null,
          })),
        },
      ],
      profil: [FACTICE.profil],
      doutes: [],
    } satisfies Captures;
  }
  const p = ids(req);
  /* Le k-ième identifiant de la conv (à partir de 0) : une conv trop courte pour le citer le dit, au lieu d’une preuve vide */
  const preuve = (k: number) => {
    const id = p[k];
    if (id === undefined) throw new Error(`modèle factice : la conv n’a que ${p.length} messages, il en faut ${k + 1} (${req.tache})`);
    return id;
  };
  const demande = textes(req).at(-1)!;
  const tout = textes(req).join("\n");
  if (req.tache === "04-verdict" && tout.includes(FACTICE.refus)) return REFUS_FACTICE;
  /* Une alerte : pas d’emoji, pas de niveau, un pas pour soi (prompts/04-verdict.md, « La sécurité d’abord ») */
  if (req.tache === "04-verdict" && tout.includes(FACTICE.alerte))
    return {
      alerte: "danger",
      mode_sobre: true,
      emoji: null,
      court: null,
      titre: "Ce que tu vis n’est pas normal.",
      sous_titre: "Et ce n’est pas ta faute.",
      preuves: [preuve(2)],
      confiance: null,
      confiance_texte: null,
      niveau: null,
      niveau_pourquoi: null,
      tendance: null,
      prochain_pas: "Cette semaine, parles-en à quelqu’un de confiance.",
      devinette: null,
      titres: null,
    } satisfies Verdict;
  /* Le rapport sobre : en un appel, sans chapitres (prompts/05-rapport.md, « Avec une alerte ») */
  if (req.tache === "05-rapport" && tout.includes(FACTICE.alerte))
    return {
      alerte: "danger",
      mode_sobre: true,
      decouvertes: [],
      these: "Ce que tu vis compte.",
      chapitres: null,
      sobre: {
        intro: "On va parler doucement.",
        titre: "Ce que tu vis n’est pas normal.",
        faits: "Dans votre conv, il revient sans cesse sur tes sorties.",
        preuves: [preuve(3)],
        reassurance: "Tu n’y es pour rien.",
        gestes: ["Parles-en à quelqu’un de confiance.", "Garde une trace de ce qui t’inquiète.", "Appelle une ligne d’écoute si ça pèse trop."],
        brouillon: "J’ai besoin de temps pour moi.",
      },
    } satisfies Rapport;
  if (req.tache === "04-verdict")
    return {
      alerte: null,
      mode_sobre: false,
      emoji: "🤏",
      court: "À deux doigts",
      titre: "Vous êtes à deux doigts.",
      sous_titre: "Elle a posé la question, t’as esquivé.",
      preuves: [preuve(2)],
      confiance: "probable",
      confiance_texte: "7 preuves dans votre conv",
      niveau: "dit",
      niveau_pourquoi: "vus quatre fois",
      tendance: null,
      prochain_pas: "Samedi, tu lui réponds en face.",
      devinette: "C’est flou parce que t’as esquivé.",
      /* Les titres des chapitres fermés : celui de l’autre porte son prénom, lu dans <histoire> */
      titres: FACTICE.titres(lu(tout.match(/^autre personne : (.+) \((?:il|elle)\)$/m)?.[1], "« autre personne : »", req)),
    } satisfies Verdict;
  if (req.tache === "05-rapport" && req.partie === "plan")
    return {
      plan: {
        alerte: null,
        mode_sobre: false,
        these: "Vous jouez à cache-cache.",
        decouvertes: [1, 2, 3].map((k) => ({ texte: `Découverte ${k}`, preuves: [preuve(k)] })),
        chapitres: [...moitie(true), ...moitie(false)].map((n) => ({
          numero: n,
          titre: `Chapitre ${n}`,
          titre_court: FACTICE.titreCourt(n),
          surtitre: null,
          periode: "hors du fil",
          scenes: [{ quand: "12/09", quoi: "une scène", preuves: [preuve(n)] }],
          epice: "une vanne",
        })),
      },
      chapitres: null,
    } satisfies z.infer<typeof Etape05>;
  if (req.tache === "06-vocal")
    return {
      alerte: null,
      lignes: [
        { jeu: "sighs dramatically", texte: "Bon. Faut qu’on parle.", punch: false, preuve: null },
        { jeu: "in disbelief", texte: "Elle t’écrit ça, et toi tu réponds ça.", punch: false, preuve: p[1] ?? null },
        { jeu: "bursts out laughing", texte: "MDR ?!", punch: true, preuve: null },
        { jeu: "serious, slower", texte: "Samedi, tu lui poses LA question.", punch: true, preuve: null },
        { jeu: null, texte: "Allez. Lis la suite.", punch: false, preuve: null },
      ],
    } satisfies Vocal;
  if (req.tache === "05-rapport")
    return { plan: null, chapitres: moitie(req.partie === "chapitres 1 à 4").map((n) => chapitre(n, preuve(p.length ? n % p.length : 0))) } satisfies z.infer<typeof Etape05>;
  if (req.tache === "07-memoire" && req.partie === "mise à jour")
    return {
      alerte: null,
      rien_de_neuf: false,
      ou_on_en_est: "Ils se sont vus hier, d’après lui.",
      moments_ajoutes: [{ quand: "2026-03-14", quoi: "D’après lui, ils se sont vus et c’était trop bien.", preuves: [] }],
      son_mode: null,
      ton_mode: null,
      conseils: null,
      a_venir: null,
      faits_ajoutes: [
        { section: "notes", texte: "Adore les soirées improvisées", preuves: [] },
        /* Une ligne de son profil arrivée avec des captures : elle rejoint sa fiche, avec sa preuve */
        ...demande.split("\n").flatMap((l) => {
          const lue = lireLigne(l);
          return lue?.profil ? [{ section: "infos" as const, texte: lue.texte, preuves: [lue.id] }] : [];
        }),
      ],
      faits_retires: [],
      portrait: null,
      phrase: null,
      phrase_courte: null,
      niveau: null,
      questions: null,
    } satisfies Maj;
  if (req.tache === "10-chat") {
    /* Le vocal : « parle-moi en vocal » l’active, « écris-moi » l’arrête ; <vocal> dit que la réponse part en vocal */
    const dernier = lu(
      demande
        .split("\n")
        .filter((l) => l.includes("(à toi) :"))
        .at(-1),
      "son message (« (à toi) : »)",
      req,
    );
    if (dernier.includes(FACTICE.refus)) return REFUS_FACTICE;
    const modeVocal = dernier.includes("parle-moi en vocal") ? "activer" : dernier.includes("écris-moi") ? "arreter" : null;
    const enVocal = modeVocal === "activer" || (modeVocal !== "arreter" && demande.includes("<vocal>"));
    /* « je lui envoie quoi » : la phrase à lui envoyer ; « on est ensemble » : un niveau de franchi */
    const aEnvoyer = dernier.includes("je lui envoie quoi");
    return {
      alerte: null,
      type: demande.includes("on s’est vus") ? "nouvelle" : "question",
      coup: null,
      mode: "jeu",
      confiance: "probable",
      lecture: [
        { texte: "elle te cherche 👀", preuves: p.slice(0, 1) },
        { texte: "et toi tu fais le mec occupé", preuves: [] },
      ],
      a_envoyer: aEnvoyer ? ["samedi, 20 h ?"] : null,
      question: "tu lui as répondu quoi ?",
      reaction: null,
      pourquoi: aEnvoyer ? "un jour, une heure : elle n’a qu’à dire oui" : null,
      niveau_atteint: dernier.includes("on est ensemble") ? "ensemble" : null,
      mode_vocal: modeVocal,
      dit: enVocal
        ? [
            { jeu: "in disbelief", texte: "Attends, elle te cherche, là." },
            { jeu: "laughing", texte: "Et toi, tu fais le mec occupé. Tu lui as répondu quoi ?" },
          ]
        : null,
    } satisfies ReponseChat;
  }
  if (req.tache === "07-memoire")
    return {
      alerte: null,
      rien_de_neuf: false,
      memoire: {
        ou_on_en_est: "Vus quatre fois, le mot n’est pas posé.",
        moments: [{ quand: "2026-02-01", quoi: "Premier verre.", preuves: [preuve(1)] }],
        son_mode: [{ texte: "Vanne après un mot doux.", preuves: [preuve(2)] }],
        ton_mode: [{ texte: "Esquive.", preuves: [preuve(3)] }],
        conseils: [{ quand: "2026-03-01", conseil: "Lui répondre en face.", suite: "en_attente", resultat: null }],
        a_venir: [],
      },
      fiche: {
        portrait: "la Taquine",
        phrase: "Son exam est jeudi",
        phrase_courte: "Son exam jeudi",
        faits: [{ section: "aime", texte: "Le libanais", preuves: [preuve(4)], statut: "nouveau" }],
      },
      niveau: { niveau: "dit", tendance: null, pourquoi: "vus quatre fois", preuves: [preuve(2)] },
      questions: ["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"],
    } satisfies Memoire;
  throw new Error(`tâche factice inconnue : ${req.tache}`);
}

/**
 * En flux, le chat factice écrit comme le vrai : son texte arrive par morceaux, à un rythme qu’on voit (ses bulles
 * arrivent une à une en dev). Les autres tâches suivies (la jauge de la lecture) restent d’un bloc.
 */
async function ecrireParMorceaux(texte: string, ecoute: Ecoute) {
  for (let n = 0; n < texte.length; n += 16) {
    await new Promise((ok) => setTimeout(ok, 8));
    ecoute.texte(texte.slice(n, n + 16));
  }
}

/**
 * Le modèle factice vu comme un prestataire (src/server/ia/claude.ts le prend à la place du SDK en mode factice) : la
 * sortie de `sorties` pour la requête et sa partie, rendue comme une réponse du modèle. Un refus (REFUS_FACTICE,
 * refusFactice) devient un arrêt « refusal » avec sa catégorie ; une sortie, son texte JSON (lu et vérifié par son
 * schéma, comme en vrai). Un appel déjà arrêté lève l’erreur d’abandon du SDK. Il ne coûte rien (`gratuit`) : ses
 * appels ne sont pas notés au suivi des coûts (ai_usage), qui ne compte que de vrais appels (le budget, les durées des
 * imports de captures, le tableau de bord).
 */
export function prestataireFactice(sorties: (req: RequeteFactice) => unknown): Fournisseur {
  return {
    gratuit: true,
    async envoyer({ requete, partie }, { signal }, { ecoute }) {
      if (signal?.aborted) throw new APIUserAbortError();
      const brut = sorties({ ...requete, ...(partie ? { partie } : {}) });
      const reponse = { usage: {}, model: "factice" } satisfies Partial<MessageRecu>;
      if (typeof brut === "string" && brut.startsWith(REFUS_FACTICE))
        return { ...reponse, content: [], stop_reason: "refusal", stop_details: { category: brut.slice(REFUS_FACTICE.length + 1) || null } };
      const texte = JSON.stringify(brut) ?? "";
      if (ecoute && requete.tache === "10-chat") await ecrireParMorceaux(texte, ecoute);
      return { ...reponse, content: [{ type: "text", text: texte }], stop_reason: "end_turn" };
    },
  };
}
