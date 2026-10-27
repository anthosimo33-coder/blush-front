import type { GenreDuHaut } from "@/contenu/haut-du-paywall";
import type { ApercuDuPaywall, SignalDuPaywall, Story } from "@/types";

/*
 * Les exemples de /apercu/paywall : une conv inventée (Inès et Lucas, 4 365 messages, les chiffres des maquettes « Le
 * mix »), et ce que le code en aurait compté (src/server/ecrans/haut-du-paywall.ts) pour chacun des cinq titres, et
 * celui d’avant. Le titre « volume » (une proposition du 27 octobre 2026) et celui d’avant montrent la même conv courte,
 * lue sur des captures (66 messages, sans heures) : ce sont elles qui les reçoivent. Des données fictives, pour l’équipe
 * seulement (jamais sur Vercel : src/proxy.ts).
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

/** Une conv courte, lue sur des captures : celle des titres sans assez de chiffres pour les cinq autres. */
export const STORY_COURTE: Story = { ...STORY_D_EXEMPLE, totalMessages: 66, period: "22 → 24 avr.", durationLabel: "3 jours" };

/** Les titres qui se montrent sur la conv courte. */
export const SUR_LA_CONV_COURTE: readonly GenreDuHaut[] = ["volume", "aucun"];

/* Les signaux des cinq titres ; ceux comptés sans heures (messages, questions) ont leurs exemples à part */
type Id = Exclude<SignalDuPaywall["id"], "messages" | "questions">;
const s = (id: SignalDuPaywall["id"], cote: SignalDuPaywall["cote"], toi: number, elle: number): SignalDuPaywall => ({ id, cote, toi, elle });

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

/** Ce que chaque exemple a de plus (une proposition du 22 octobre 2026) : Inès veut savoir si c’est réciproque. */
const avecLaSuite = (a: ApercuDuPaywall): ApercuDuPaywall => ({ ...a, objectif: "reciproque" });

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
  volume: { signaux: signaux({ ouvre: s("ouvre", "pareil", 2, 2) }).filter((x) => x.id !== "delai"), tendance: null },
  aucun: { signaux: signaux({ ouvre: s("ouvre", "pareil", 2, 2) }).filter((x) => x.id !== "delai"), tendance: null },
};

/**
 * Le titre « volume » sur la conv courte, selon ce qu’elle compte sans heures (`?variante=`) : Inès écrit plus et Lucas
 * plus long (par défaut), Inès porte tout (`toi`), Lucas écrit plus et pose les questions (`elle`), ou autant l’un que
 * l’autre (`autant`).
 */
export const VARIANTES_DU_VOLUME = {
  contraste: [s("messages", "toi", 44, 22), s("questions", "toi", 6, 2), s("longueur", "elle", 6, 13)],
  toi: [s("messages", "toi", 44, 22), s("questions", "toi", 9, 0), s("longueur", "pareil", 8, 7)],
  elle: [s("messages", "elle", 20, 46), s("questions", "elle", 0, 7), s("longueur", "pareil", 7, 9)],
  autant: [s("messages", "pareil", 31, 35), s("questions", "pareil", 4, 5), s("longueur", "pareil", 9, 11)],
} satisfies Record<string, SignalDuPaywall[]>;
export type VarianteDuVolume = keyof typeof VARIANTES_DU_VOLUME;

export const EXEMPLES = Object.fromEntries(Object.entries(BASES).map(([genre, a]) => [genre, avecLaSuite(a)])) as Record<GenreDuHaut, ApercuDuPaywall>;

/** L’exemple du titre « volume » dans une de ses variantes (contraste par défaut). */
export const exempleDuVolume = (v: VarianteDuVolume = "contraste"): ApercuDuPaywall => ({ ...EXEMPLES.volume, sansHeures: VARIANTES_DU_VOLUME[v] });
