import type { Chiffres } from "@prompts/lib/conv";
import type { Chapitre, Rapport, Verdict } from "@prompts/lib/schemas";
import type { Chapter, ChapterBlock, Message, ScoreRow, SoberReport, Verdict as VerdictAffiche } from "@/types";
import { resoudre } from "./messages";

/* Le verdict, les scores du chapitre 1 et le rapport, tels que les montrent ses écrans (src/server/ecrans/messages.ts). */

/** Les libellés que le rapport pose autour des textes du modèle. */
const LIBELLES = {
  question: "LA question",
  brouillon: "Si tu veux lui écrire",
  aide: "Besoin d’en parler à quelqu’un\u00a0?",
} as const;

/* ———— Les scores du chapitre 1 : calculés par le code, jamais par le modèle ———— */

export function scores(c: Chiffres): ScoreRow[] {
  const autre = c.qui.autre.toLowerCase();
  const ligne = (label: string, toi: number, elle: number): ScoreRow => {
    const total = toi + elle;
    /* Rien à comparer (captures sans heures) : à égalité */
    if (!total) return { label, winner: "pareil", toiPercent: 50 };
    const part = Math.round((100 * toi) / total);
    const winner: ScoreRow["winner"] = part >= 56 ? "toi" : part <= 44 ? "elle" : "pareil";
    const sur10 = (x: number) => `${Math.round((10 * x) / total)} fois sur 10`;
    return {
      label,
      winner,
      toiPercent: part,
      ...(winner === "toi" ? { captionLeft: `toi, ${sur10(toi)}` } : {}),
      ...(winner === "elle" ? { captionRight: `${autre}, ${sur10(elle)}` } : {}),
      ...(winner === "pareil" ? { captionLeft: `toi\u00a0: ${toi}`, captionRight: `${autre}\u00a0: ${elle}` } : {}),
    };
  };
  const minutes = (ms: number | null) => (ms == null ? "—" : ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min` : `${Math.round(ms / 3600e3)} h`);
  const { toi: dt, autre: de } = c.delai;
  /* À moins d’une minute d’écart (ou sans délai d’un côté) : pareil */
  const ecart = dt != null && de != null && Math.abs(dt - de) >= 60e3 ? { dt, de } : null;
  const rapide: ScoreRow = {
    label: "Qui répond vite",
    winner: !ecart ? "pareil" : ecart.dt < ecart.de ? "toi" : "elle",
    toiPercent: !ecart ? 50 : Math.round((100 * ecart.de) / (ecart.dt + ecart.de)),
    captionLeft: minutes(dt),
    captionRight: minutes(de),
  };
  return [
    ligne("Qui ouvre la journée", c.ouvre.toi, c.ouvre.autre),
    ligne("Qui reprend après un silence", c.reprend.toi, c.reprend.autre),
    ligne("Qui relance sans réponse", c.relance.toi, c.relance.autre),
    rapide,
  ];
}

/* ———— Le verdict ———— */

/** Le verdict affiché, et `difficult` (le mode sobre), que le front ne lit pas : une alerte se voit à `ReportPayload.sober`. */
export function verdictAffiche(v: Verdict): VerdictAffiche & { difficult: boolean } {
  return { emoji: v.emoji ?? "🧊", short: v.court ?? "", title: v.titre ?? "", subtitle: v.sous_titre ?? "", difficult: v.mode_sobre };
}

/* ———— Le rapport ———— */

function bloc(b: Chapitre["blocs"][number], messages: Map<string, Message>): ChapterBlock {
  const texte = b.texte ?? "";
  const items = b.items ?? [];
  switch (b.type) {
    case "accroche":
      return { kind: "lead", text: texte };
    case "essentiel":
      return { kind: "essential", text: texte };
    case "recit":
      return { kind: "story", text: texte, messages: resoudre(b.preuves, messages) };
    case "vu":
      return { kind: "seen", messages: resoudre(b.preuves, messages), ...(b.texte ? { factsAfter: [b.texte] } : {}) };
    case "sens":
      return { kind: "meaning", text: texte };
    case "action":
      return { kind: "play", text: texte };
    case "confiance":
      return { kind: "confidence", level: b.niveau === "a_verifier" ? "verifier" : (b.niveau ?? "probable"), text: texte };
    case "frise":
      return {
        kind: "timeline",
        items: items.map((i) => {
          const m = resoudre(i.preuves.slice(0, 1), messages)[0];
          return { title: i.titre ?? "", text: i.texte ?? "", ...(m ? { message: m } : {}) };
        }),
      };
    case "duo":
      return { kind: "duo", title: b.titre ?? "", text: texte, trophies: items.map((i) => ({ title: i.titre ?? "", text: i.texte ?? "", side: i.cote === "toi" ? "toi" : "elle" })) };
    case "scenarios":
      return { kind: "scenarios", items: items.map((i) => ({ title: i.titre ?? "", text: i.texte ?? "", tag: i.tag ?? "probable" })) };
    case "plan":
      return { kind: "plan", items: items.map((i) => ({ when: i.quand ?? "", title: i.titre ?? "", text: i.texte ?? "" })) };
    case "stop":
      return { kind: "stop", items: items.map((i) => ({ title: i.titre ?? "", text: i.texte ?? "", messages: resoudre(i.preuves, messages) })) };
    case "question":
      return { kind: "question", label: LIBELLES.question, text: texte.startsWith("«") ? texte : `«\u00a0${texte}\u00a0»` };
    case "fin":
      return { kind: "ending", text: texte };
    case "chute":
      return { kind: "punchline", text: texte };
  }
}

/**
 * Les chapitres du rapport (ceux qu’il a déjà, pendant l’écriture). Le chapitre 1 s’appelle « Le verdict » (le verdict
 * est affiché juste au-dessus), avec les scores après l’accroche ; c’est le seul gratuit.
 */
export function chapitresAffiches(chapitres: Chapitre[], messages: Map<string, Message>, lignesScores: ScoreRow[]): Chapter[] {
  return chapitres.map((ch) => {
    const blocks = ch.blocs.map((b) => bloc(b, messages));
    if (ch.numero === 1) {
      blocks.splice(Math.max(1, blocks.findIndex((b) => b.kind === "lead") + 1), 0, { kind: "scores", rows: lignesScores });
      return { number: 1, title: "Le verdict", tocTitle: "Le verdict", free: true, blocks };
    }
    return { number: ch.numero, title: ch.titre, ...(ch.surtitre ? { kicker: ch.surtitre } : {}), tocTitle: ch.titre_court, free: false, blocks };
  });
}

/** Le temps de lecture, à 230 mots par minute. */
export const tempsDeLecture = (valeur: unknown) => `${Math.max(1, Math.round(JSON.stringify(valeur).split(/\s+/).length / 230))} min`;

/** Le rapport doux du mode sobre, s’il en a un. */
export function sobreAffiche(r: Pick<Rapport, "sobre">): SoberReport | null {
  if (!r.sobre) return null;
  const s = r.sobre;
  return { intro: s.intro, title: s.titre, facts: s.faits, reassurance: s.reassurance, steps: s.gestes, draftLabel: LIBELLES.brouillon, draft: s.brouillon ?? "", helpLabel: LIBELLES.aide };
}
