import "server-only";
import { APPLIS, type Source, type Story } from "@/types";
import { pronomDeLAutre } from "./accords";
import type { Meta, MorceauMeta } from "./histoires";
import { dureeLisible, joursCouverts } from "./temps";

/* La conv telle que l’affiche le front (le type Story) : tirée de sa meta seule, sans la base ni la conv brute. */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso: string) => `${+iso.slice(8, 10)} ${MOIS[+iso.slice(5, 7) - 1]}`;

/**
 * L’histoire telle que l’affiche le front, pour toute conv (GET /api/histoire, un import, l’aperçu). Les participants
 * sont p0 et p1 (dans l’ordre de l’export). Une source par morceau : l’export ou les captures d’où elle vient, ou ses
 * morceaux (src/server/morceaux.ts).
 */
export function storyAffichee(id: string, meta: Meta): Story {
  return storyEtSource(id, meta).story;
}

/** Une source de la conv (son seul morceau, ou l’un d’eux) : un export, ou des captures (combien). */
function sourceDe(id: string, m: MorceauMeta): Source {
  const { debut, fin, total, vocaux } = m.resume;
  const periode = `${dateCourte(debut)} → ${dateCourte(fin)}`;
  return m.captures
    ? {
        id,
        app: m.appli,
        mode: "captures",
        screenshotCount: m.captures,
        /* « Captures ou vidéo » d’une appli qu’on ne nomme pas : le nombre seul */
        label: m.appli === "autre" ? `${m.captures} captures` : `${APPLIS[m.appli]} · ${m.captures} captures`,
        period: periode,
        messageCount: total,
        voiceCount: vocaux,
        /* Une longue vidéo lue en partie avant l’achat : le début se lira avec le rapport */
        ...(m.suiteVideo ? { suiteVideo: true } : {}),
      }
    : {
        id,
        app: m.appli,
        mode: "export",
        fileName: m.fichier,
        label: `${APPLIS[m.appli]} · ${dateCourte(debut)}`,
        period: periode,
        messageCount: total,
        voiceCount: vocaux,
        /* Une conv trop longue, coupée : combien de mois BLUSH en lit */
        ...(m.coupe ? { moisLus: Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / (30.44 * 86400e3))) } : {}),
      };
}

/**
 * L’histoire telle que l’affiche le front (storyAffichee), et sa source : la seule de `story.sources`, ou, en plusieurs
 * morceaux, la dernière ajoutée (ce que répond un import). Les morceaux s’y rangent du plus ancien au plus récent.
 */
export function storyEtSource(id: string, meta: Meta): { story: Story; source: Source } {
  const { debut, fin, total, vocaux } = meta.resume;
  const periode = `${dateCourte(debut)} → ${dateCourte(fin)}`;
  const jours = joursCouverts(debut, fin);
  const [a, b] = meta.participants;
  /* Le pronom de chacun, une fois « Tu es » rempli : l’utilisateur a le sien, l’autre celui de pronomDeLAutre */
  const pronom = (k: 0 | 1) =>
    meta.moi == null || !meta.pronom ? {} : { pronoun: k === meta.moi ? meta.pronom : pronomDeLAutre(meta, { moi: meta.participants[meta.moi], autre: meta.participants[k] }) };
  const morceaux = meta.morceaux ?? [meta];
  const ordre = morceaux.map((m, k) => ({ m, k })).sort((x, y) => x.m.resume.debut.localeCompare(y.m.resume.debut) || x.k - y.k);
  const sources = ordre.map(({ m }, i) => sourceDe(`s${i + 1}`, m));
  const story: Story = {
    id,
    participants: [
      { id: "p0", name: a.prenom, initial: initialeDe(a.prenom), ...pronom(0) },
      { id: "p1", name: b.prenom, initial: initialeDe(b.prenom), ...pronom(1) },
    ],
    sources,
    totalMessages: total,
    voiceCount: vocaux,
    period: periode,
    durationLabel: dureeLisible(jours),
    updatedLabel: "aujourd’hui",
    /* Qui est l’utilisateur : le rapport ouvert depuis le mail (un autre onglet, sans parcours) met les bons avatars */
    ...(meta.moi == null ? {} : { me: meta.moi === 0 ? "p0" : "p1" }),
    ...(meta.moi == null && meta.contact != null ? { other: meta.contact === 0 ? "p0" : "p1" } : {}),
    ...(meta.morceaux ? { duplicatesRemoved: meta.doublons ?? 0 } : {}),
  };
  /* La source du dernier morceau importé */
  const derniere = sources[ordre.findIndex(({ k }) => k === morceaux.length - 1)]!;
  return { story, source: derniere };
}

/** L’initiale d’un nom : son premier caractère entier (un emoji n’est pas coupé en deux), en majuscule. */
export const initialeDe = (nom: string) => [...nom.trim()][0]?.toUpperCase() ?? "?";
