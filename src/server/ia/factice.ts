import "server-only";
import type { Requete } from "@prompts/lib/contextes";

/* Un modèle factice (BLUSH_IA_FACTICE=1, pour les tests et le dev sans coût) : des sorties valides, qui citent de vrais identifiants de la conv. */
const textes = (req: Requete) => req.blocs.flatMap((b) => ("texte" in b ? [b.texte] : []));
const ids = (req: Requete) => [...new Set(textes(req).join("\n").match(/^m\d{4,}(?= )/gm) ?? [])];

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
  /* Lire des captures : une transcription fixe de 24 messages, l’avant-veille et la veille du jour de la requête, et une ligne de son profil */
  if (req.tache === "01-captures") {
    const auj = Date.parse(`${textes(req)[0].match(/aujourd’hui : \S+ (\d{4}-\d{2}-\d{2})/)?.[1] ?? "2026-09-09"}T00:00:00Z`);
    const veille = (k: number) => new Date(auj - k * 86400e3).toISOString().slice(0, 10);
    return {
      appli: "instagram",
      autre: "Elias",
      captures: req.blocs.filter((b) => "image" in b).map((_, k) => ({ numero: k + 1, place: k + 1, hors_sujet: false })),
      blocs: [
        { repere: { date: veille(2), heure: "13:12" }, messages: Array.from({ length: 12 }, (_, k) => ({ de: k % 2 ? "moi" : "autre", texte: `message ${k + 1}`, media: null, coupe: false, reaction: null })) },
        { repere: { date: veille(1), heure: "21:05" }, messages: Array.from({ length: 12 }, (_, k) => ({ de: k % 2 ? "autre" : "moi", texte: `suite ${k + 1}`, media: k === 3 ? "photo" : null, coupe: false, reaction: null })) },
      ],
      profil: ["Étudiante en droit à Lyon"],
      doutes: [],
    };
  }
  const p = ids(req);
  const demande = textes(req).at(-1)!;
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
      faits_ajoutes: [
        { section: "notes", texte: "Adore les soirées improvisées", preuves: [] },
        /* Une ligne de son profil arrivée avec des captures : elle rejoint sa fiche, avec sa preuve */
        ...[...demande.matchAll(/^(m\d{4,}) \S+ \S+ --:-- profil de [^:]+ : (.*)$/gm)].map((m) => ({ section: "infos", texte: m[2], preuves: [m[1]] })),
      ],
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
