import type { GenreDuHaut } from "@/contenu/haut-du-paywall";
import type { ApercuDuPaywall, MomentDuPaywall, SignalDuPaywall, Story } from "@/types";

/*
 * Les exemples de /apercu/paywall : une conv inventée (Inès et Lucas, 4 365 messages, les chiffres des maquettes « Le
 * mix »), et ce que le code en aurait compté (src/server/ecrans/haut-du-paywall.ts) pour chacun des cinq titres, et
 * celui d’avant. Des données fictives, pour l’équipe seulement (jamais sur Vercel : src/proxy.ts).
 */

const MIN = 60e3;
const H = 3600e3;

export const STORY_D_EXEMPLE: Story = {
  id: "apercu-paywall",
  participants: [
    { id: "p0", name: "Inès", initial: "I", pronoun: "elle" },
    { id: "p1", name: "Lucas", initial: "L", pronoun: "il" },
  ],
  sources: [],
  totalMessages: 4365,
  voiceCount: 0,
  period: "1er janv. → 23 avr.",
  durationLabel: "4 mois",
  updatedLabel: "aujourd’hui",
  me: "p0",
};

type Id = SignalDuPaywall["id"];
const s = (id: Id, cote: SignalDuPaywall["cote"], toi: number, elle: number): SignalDuPaywall => ({ id, cote, toi, elle });

/** Une conv où personne ne court après l’autre, sauf ce que chaque exemple change. */
function signaux(changes: Partial<Record<Id, SignalDuPaywall>>): SignalDuPaywall[] {
  const base: Record<Id, SignalDuPaywall> = {
    ouvre: s("ouvre", "pareil", 52, 48),
    reprend: s("reprend", "pareil", 12, 12),
    relance: s("relance", "pareil", 2, 2),
    delai: s("delai", "pareil", 6 * MIN, 6 * MIN),
    longueur: s("longueur", "pareil", 10, 11),
  };
  return (["ouvre", "reprend", "relance", "delai", "longueur"] as const).map((id) => changes[id] ?? base[id]);
}

/*
 * Ta question, tes indices et tes moments cachés (une proposition du 22 octobre 2026) : Inès veut savoir si c’est
 * réciproque, et dit « c’est flou ». Des messages inventés, comme le reste.
 */
const MOMENTS: MomentDuPaywall[] = [
  { id: "attente", de: "toi", texte: "t’as vu la vidéo que je t’ai envoyée\u00a0? j’ai pensé à toi direct mdr", jour: "2026-03-03", valeur: 14 * H },
  {
    id: "long",
    de: "elle",
    texte:
      "franchement j’ai passé une soirée trop bien hier, j’avais pas autant rigolé depuis longtemps et je sais pas, j’ai l’impression qu’avec toi c’est simple, j’aime bien ça, même si des fois j’ai du mal à le dire",
    jour: "2026-02-14",
    valeur: 41,
  },
];
const BASCULE: MomentDuPaywall = { id: "bascule", de: "elle", texte: "jsp trop cette semaine, je te redis\u00a0?", jour: "2026-03-12" };

/** Ce que chaque exemple a de plus : ta question, tes indices, tes moments (le jour où ça a changé, seulement avec une chute). */
const avecLaSuite = (a: ApercuDuPaywall): ApercuDuPaywall => ({
  ...a,
  question: { objectif: "reciproque", devinette: "flou" },
  indices: [
    { id: "manques", toi: 6, elle: 1 },
    { id: "voir", toi: 9, elle: 2 },
  ],
  moments: a.tendance ? [BASCULE, ...MOMENTS] : MOMENTS,
});

const BASES: Record<GenreDuHaut, ApercuDuPaywall> = {
  contraste: { signaux: signaux({ ouvre: s("ouvre", "toi", 70, 30), reprend: s("reprend", "elle", 6, 24), delai: s("delai", "pareil", 3 * MIN, 2 * MIN) }), tendance: null },
  toi: { signaux: signaux({ ouvre: s("ouvre", "toi", 80, 20), relance: s("relance", "toi", 6, 2), delai: s("delai", "elle", 12 * MIN, 4 * MIN) }), tendance: null },
  elle: { signaux: signaux({ ouvre: s("ouvre", "elle", 20, 80), relance: s("relance", "elle", 0, 5), delai: s("delai", "elle", 2 * H, 3 * MIN) }), tendance: null },
  egalite: { signaux: signaux({ ouvre: s("ouvre", "pareil", 50, 50), longueur: s("longueur", "elle", 9, 19) }), tendance: null },
  tendance: {
    signaux: signaux({}),
    tendance: {
      depuis: "2026-03-12",
      avant: 38,
      apres: 17,
      semaines: [36, 41, 38, 44, 39, 35, 40, 37, 39, 38, 22, 18, 15, 17, 14, 16],
      coupure: 10,
      delai: { avant: 4 * MIN, apres: 13 * MIN },
    },
  },
  aucun: { signaux: signaux({ ouvre: s("ouvre", "pareil", 2, 2) }).filter((x) => x.id !== "delai"), tendance: null },
};

export const EXEMPLES = Object.fromEntries(Object.entries(BASES).map(([genre, a]) => [genre, avecLaSuite(a)])) as Record<GenreDuHaut, ApercuDuPaywall>;
