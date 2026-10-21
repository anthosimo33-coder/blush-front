import "server-only";
import { APPLIS, type Source, type Story } from "@/types";
import { pronomDeLAutre } from "./accords";
import type { Meta } from "./histoires";
import { dureeLisible, joursCouverts } from "./temps";

/* La conv telle que l’affiche le front (le type Story) : tirée de sa meta seule, sans la base ni la conv brute. */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso: string) => `${+iso.slice(8, 10)} ${MOIS[+iso.slice(5, 7) - 1]}`;

/**
 * L’histoire telle que l’affiche le front, pour toute conv (GET /api/histoire, un import, l’aperçu). Les participants
 * sont p0 et p1 (dans l’ordre de l’export). Une conv a toujours exactement une source : l’export ou les captures d’où
 * elle vient (storyEtSource la rend aussi à part).
 */
export function storyAffichee(id: string, meta: Meta): Story {
  return storyEtSource(id, meta).story;
}

/** L’histoire telle que l’affiche le front (storyAffichee), et sa source, la seule de `story.sources` : ce que répond un import. */
export function storyEtSource(id: string, meta: Meta): { story: Story; source: Source } {
  const { debut, fin, total, vocaux } = meta.resume;
  const periode = `${dateCourte(debut)} → ${dateCourte(fin)}`;
  const jours = joursCouverts(debut, fin);
  const [a, b] = meta.participants;
  /* Le pronom de chacun, une fois « Tu es » rempli : l’utilisateur a le sien, l’autre celui de pronomDeLAutre */
  const pronom = (k: 0 | 1) =>
    meta.moi == null || !meta.pronom ? {} : { pronoun: k === meta.moi ? meta.pronom : pronomDeLAutre(meta, { moi: meta.participants[meta.moi], autre: meta.participants[k] }) };
  const source: Source = meta.captures
    ? {
        id: "s1",
        app: meta.appli,
        mode: "captures",
        screenshotCount: meta.captures,
        label: `${APPLIS[meta.appli]} · ${meta.captures} captures`,
        period: periode,
        messageCount: total,
        voiceCount: vocaux,
      }
    : {
        id: "s1",
        app: meta.appli,
        mode: "export",
        fileName: meta.fichier,
        label: `${APPLIS[meta.appli]} · ${dateCourte(debut)}`,
        period: periode,
        messageCount: total,
        voiceCount: vocaux,
        /* Une conv trop longue, coupée : combien de mois BLUSH en lit */
        ...(meta.coupe ? { moisLus: Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / (30.44 * 86400e3))) } : {}),
      };
  const story: Story = {
    id,
    participants: [
      { id: "p0", name: a.prenom, initial: initialeDe(a.prenom), ...pronom(0) },
      { id: "p1", name: b.prenom, initial: initialeDe(b.prenom), ...pronom(1) },
    ],
    sources: [source],
    totalMessages: total,
    voiceCount: vocaux,
    period: periode,
    durationLabel: dureeLisible(jours),
    updatedLabel: "aujourd’hui",
    /* Qui est l’utilisateur : le rapport ouvert depuis le mail (un autre onglet, sans parcours) met les bons avatars */
    ...(meta.moi == null ? {} : { me: meta.moi === 0 ? "p0" : "p1" }),
  };
  return { story, source };
}

/** L’initiale d’un nom : son premier caractère entier (un emoji n’est pas coupé en deux), en majuscule. */
export const initialeDe = (nom: string) => [...nom.trim()][0]?.toUpperCase() ?? "?";
