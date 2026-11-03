import "server-only";
import { nomsDistincts, prenomDe, seConfondent } from "@prompts/lib/noms";
import { formatCount } from "@/lib/format";
import { doutePrenom } from "@/lib/participants";
import { APPLIS, type Person, type Source, type Story } from "@/types";
import { pronomDeLAutre } from "./accords";
import type { Meta, MorceauMeta } from "./histoires";
import { dureeLisible, joursCouverts, moisCouverts } from "./temps";

/* La conv telle que l’affiche le front (le type Story) : tirée de sa meta seule, sans la base ni la conv brute. */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso: string, annee = false) => `${+iso.slice(8, 10)} ${MOIS[+iso.slice(5, 7) - 1]}${annee ? ` ${iso.slice(0, 4)}` : ""}`;

/**
 * La période d’une conv : « 14 déc. → 12 mars », avec l’année aux deux bouts quand ils ne sont pas de la même année
 * (« 12 mars 2024 → 12 mars 2025 »), un seul jour quand elle tient en un jour (« 1 janv. »).
 */
export function periodeLisible(debut: string, fin: string): string {
  if (debut.slice(0, 10) === fin.slice(0, 10)) return dateCourte(debut);
  const annees = debut.slice(0, 4) !== fin.slice(0, 4);
  return `${dateCourte(debut, annees)} → ${dateCourte(fin, annees)}`;
}

/** Ses médias que l’export ne nomme pas, quand il y en a (Source.mediaCount). */
const medias = (resume: Meta["resume"]) => (resume.medias ? { mediaCount: resume.medias } : {});

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
  const { debut, fin, total, vocaux, sansDate } = m.resume;
  /* Des captures qui ne montrent aucune date : ni période (le jour de l’import n’est pas le leur) */
  const periode = sansDate ? {} : { period: periodeLisible(debut, fin) };
  /* Des captures : combien (« 1 capture »), ou « vidéo » pour un enregistrement d’écran */
  const lot = m.video ? "vidéo" : `${m.captures} capture${(m.captures ?? 0) > 1 ? "s" : ""}`;
  return m.captures
    ? {
        id,
        app: m.appli,
        mode: "captures",
        screenshotCount: m.captures,
        /* « Captures ou vidéo » d’une appli qu’on ne nomme pas : le nombre seul */
        label: m.appli === "autre" ? lot : `${APPLIS[m.appli]} · ${lot}`,
        ...periode,
        messageCount: total,
        voiceCount: vocaux,
        ...medias(m.resume),
        /* Une longue vidéo lue en partie avant l’achat : le début se lira avec le rapport */
        ...(m.suiteVideo ? { suiteVideo: true } : {}),
        ...(m.video ? { video: true } : {}),
      }
    : {
        id,
        app: m.appli,
        mode: "export",
        fileName: m.fichier,
        /* Le jour de son premier message, avec l’année quand ce n’est pas celle du dernier */
        label: `${APPLIS[m.appli]} · ${dateCourte(debut, debut.slice(0, 4) !== fin.slice(0, 4))}`,
        ...periode,
        messageCount: total,
        voiceCount: vocaux,
        ...medias(m.resume),
        /* Une conv trop longue, coupée : combien de mois BLUSH en lit, comptés comme la durée du verdict (moisCouverts) */
        ...(m.coupe ? { moisLus: moisCouverts(joursCouverts(debut, fin)) } : {}),
      };
}

/**
 * L’histoire telle que l’affiche le front (storyAffichee), et sa source : la seule de `story.sources`, ou, en plusieurs
 * morceaux, la dernière ajoutée (ce que répond un import). Les morceaux s’y rangent du plus ancien au plus récent.
 */
export function storyEtSource(id: string, meta: Meta): { story: Story; source: Source } {
  const { debut, fin, total, vocaux, sansDate } = meta.resume;
  const [a, b] = meta.participants;
  /* Le pronom de chacun, une fois « Tu es » rempli : l’utilisateur a le sien, l’autre celui de pronomDeLAutre */
  const pronom = (k: 0 | 1) =>
    meta.moi == null || !meta.pronom ? {} : { pronoun: k === meta.moi ? meta.pronom : pronomDeLAutre(meta, { moi: meta.participants[meta.moi], autre: meta.participants[k] }) };
  const morceaux = meta.morceaux ?? [meta];
  const ordre = morceaux.map((m, k) => ({ m, k })).sort((x, y) => x.m.resume.debut.localeCompare(y.m.resume.debut) || x.k - y.k);
  const sources = ordre.map(({ m }, i) => sourceDe(`s${i + 1}`, m));
  /*
   * Le début de la conv n’a pas été importé : elle est coupée, ou le plus ancien de ses morceaux datés l’est (rendre,
   * prompts/lib/conv.ts : la même règle)
   */
  const debutManque = meta.morceaux ? !!ordre.find(({ m }) => !m.resume.sansDate)?.m.coupe : !!meta.coupe;
  /*
   * Leurs noms, distincts quand ils ont le même prénom (comme ceux que lit le modèle, histoireDe, mais jamais « Léa
   * (l’autre) », qui ne se lit pas à l’écran : « Léa & Léa ») : sur « Qui es-tu ? », chacun
   * montre alors son nom d’export et ses messages. Un nom qui ne dit pas son prénom (doutePrenom) : l’écran le demande,
   * tant que son prénom vient encore de ce nom (une fois écrit sur « Qui es-tu ? », plus rien à demander)
   */
  const noms = nomsDistincts(meta.participants);
  const homonymes = seConfondent(a.prenom, b.prenom);
  const personne = (k: 0 | 1): Person => {
    const p = meta.participants[k];
    const doute = p.prenom === prenomDe(p.nom) ? doutePrenom(p.nom) : undefined;
    return {
      id: `p${k}`,
      name: noms[k],
      initial: initialeDe(noms[k]),
      ...pronom(k),
      ...(doute ? { nameCheck: doute } : {}),
      ...(homonymes ? { detail: `${p.nom} · ${formatCount(p.messages)} message${p.messages > 1 ? "s" : ""}` } : {}),
    };
  };
  const story: Story = {
    id,
    participants: [personne(0), personne(1)],
    sources,
    totalMessages: total,
    voiceCount: vocaux,
    ...medias(meta.resume),
    /* Aucune date sur ses captures : ni période ni durée */
    ...(sansDate ? {} : { period: periodeLisible(debut, fin), durationLabel: dureeLisible(joursCouverts(debut, fin)) }),
    ...(debutManque ? { startMissing: true as const } : {}),
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
