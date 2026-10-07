import "server-only";
import type { Requete } from "@prompts/lib/contextes";

/* Un modèle factice (BLUSH_IA_FACTICE=1, pour les tests et le dev sans coût) : des sorties valides, qui citent de vrais identifiants de la conv. */
const ids = (req: Requete) => [...new Set(req.blocs.map((b) => b.texte).join("\n").match(/^m\d{4,}(?= )/gm) ?? [])];

const chapitre = (numero: number, p: string[]) => ({
  numero,
  titre: `Chapitre ${numero}`,
  titre_court: `Ch. ${numero}`,
  surtitre: null,
  blocs: [
    { type: "accroche", texte: "Assieds-toi.", preuves: [], titre: null, niveau: null, items: null },
    { type: "recit", texte: "Le soir où tout a basculé.", preuves: [p[numero % p.length]], titre: null, niveau: null, items: null },
    { type: "chute", texte: "Et voilà.", preuves: [], titre: null, niveau: null, items: null },
  ],
});

export function fournisseurFactice(req: Requete): unknown {
  const p = ids(req);
  const demande = req.blocs.at(-1)!.texte;
  if (req.tache === "04-verdict")
    return {
      alerte: null,
      mode_sobre: false,
      emoji: "🤏",
      court: "À deux doigts",
      titre: "Vous êtes à deux doigts.",
      sous_titre: "Elle a posé la question, t’as esquivé.",
      preuves: [p[2]],
      confiance: "probable",
      confiance_texte: "7 preuves dans votre conv",
      niveau: "dit",
      niveau_pourquoi: "vus quatre fois",
      tendance: null,
      prochain_pas: "Samedi, tu lui réponds en face.",
      devinette: "C’est flou parce que t’as esquivé.",
    };
  if (req.tache === "05-rapport" && demande.startsWith("Étape : le plan"))
    return {
      plan: {
        alerte: null,
        mode_sobre: false,
        these: "Vous jouez à cache-cache.",
        decouvertes: [1, 2, 3].map((k) => ({ texte: `Découverte ${k}`, preuves: [p[k]] })),
        chapitres: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ numero: n, titre: `Chapitre ${n}`, titre_court: `Ch. ${n}`, surtitre: null, periode: "hors du fil", scenes: [{ quand: "12/09", quoi: "une scène", preuves: [p[n]] }], epice: "une vanne" })),
      },
      chapitres: null,
    };
  if (req.tache === "05-rapport") return { plan: null, chapitres: (demande.includes("1 à 4") ? [1, 2, 3, 4] : [5, 6, 7, 8]).map((n) => chapitre(n, p)) };
  if (req.tache === "07-memoire" && demande.includes("Moment : la mise à jour."))
    return {
      alerte: null,
      rien_de_neuf: false,
      ou_on_en_est: "Ils se sont vus hier, d’après lui.",
      moments_ajoutes: [{ quand: "2026-03-14", quoi: "D’après lui, ils se sont vus et c’était trop bien.", preuves: [] }],
      son_mode: null,
      ton_mode: null,
      conseils: null,
      a_venir: null,
      faits_ajoutes: [{ section: "notes", texte: "Adore les soirées improvisées", preuves: [] }],
      faits_retires: [],
      portrait: null,
      phrase: null,
      phrase_courte: null,
      niveau: null,
      questions: null,
    };
  if (req.tache === "10-chat")
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
      a_envoyer: null,
      question: "tu lui as répondu quoi ?",
      reaction: null,
      pourquoi: null,
      niveau_atteint: null,
    };
  if (req.tache === "07-memoire")
    return {
      alerte: null,
      rien_de_neuf: false,
      memoire: {
        ou_on_en_est: "Vus quatre fois, le mot n’est pas posé.",
        moments: [{ quand: "2026-02-01", quoi: "Premier verre.", preuves: [p[1]] }],
        son_mode: [{ texte: "Vanne après un mot doux.", preuves: [p[2]] }],
        ton_mode: [{ texte: "Esquive.", preuves: [p[3]] }],
        conseils: [{ quand: "2026-03-01", conseil: "Lui répondre en face.", suite: "en_attente", resultat: null }],
        a_venir: [],
      },
      fiche: { portrait: "la Taquine", phrase: "Son exam est jeudi", phrase_courte: "Son exam jeudi", faits: [{ section: "aime", texte: "Le libanais", preuves: [p[4]], statut: "nouveau" }] },
      niveau: { niveau: "dit", tendance: null, pourquoi: "vus quatre fois", preuves: [p[2]] },
      questions: ["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"],
    };
  throw new Error(`tâche factice inconnue : ${req.tache}`);
}
