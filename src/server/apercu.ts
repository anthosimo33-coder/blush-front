import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SortiesDuBanc } from "@prompts/lib/apercu";
import { chiffrer, lire, rendre } from "@prompts/lib/conv";
import { estFaite } from "@prompts/lib/memoire";
import type { ReponseChat } from "@prompts/lib/schemas";
import { APPLIS, type BlushAnswer, type Fiche, type Person, type Story } from "@/types";
import type { EchangeChat, ReportPayload } from "@/types/api";
import { initialeDe, storyAffichee } from "./conv-affichee";
import { bullesAffichees } from "./ecrans/chat";
import { ficheAffichee } from "./ecrans/fiche";
import { messagesAffiches, resoudre } from "./ecrans/messages";
import { chapitresAffiches, lectureDe, scores, sobreAffiche } from "./ecrans/rapport";
import { resumeDe, type Meta, type Participant } from "./histoires";
import { enTete } from "./presentation/rapport";

/*
 * Les aperçus de l’équipe (/apercu, hors de Vercel seulement : src/proxy.ts) : les sorties du banc d’évals
 * (prompts/evals/vers-front.mts, au format SortiesDuBanc de prompts/lib/apercu.ts), mises en écrans comme celles de
 * l’appli, par src/server/ecrans. Le banc ne connaît pas les types du front : l’aperçu montre ce que montrerait la
 * production, insécables et libellés compris. Rien de ces sorties ne vit dans le dépôt.
 */

/** Ce que l’aperçu montre d’une conv : son rapport, et (avec la mémoire) sa fiche et l’accueil. */
export type Apercu = {
  payload: ReportPayload;
  story: Story;
  fiche: Fiche | null;
  home: {
    quick: string[];
    answers: Record<string, BlushAnswer>;
    /* Les échanges à rejouer sur l’accueil : ceux du chat, dont seule la réponse est sûre d’y être */
    script?: (Pick<EchangeChat, "answer"> & Partial<Omit<EchangeChat, "answer">>)[];
    fiche: Pick<Fiche, "person" | "summaryShort">;
  } | null;
};

const estAppli = (x: string): x is Meta["appli"] => Object.hasOwn(APPLIS, x);

/** Les sorties du banc pour une conv, mises en écrans : lues comme l’appli lit une conv (lire, rendre, chiffrer), puis traduites par src/server/ecrans. */
export function apercuDe(b: SortiesDuBanc): Apercu {
  const h = b.histoire;
  const lu = lire(b.texte, h);
  const rendu = rendre(h, lu);
  const messages = messagesAffiches(rendu.lignes, h.utilisateur.prenom);
  const chapters = chapitresAffiches(b.rapport.chapitres ?? [], messages, scores(chiffrer(h, lu.messages)));
  const payload: ReportPayload = {
    report: { storyId: "apercu", ...enTete(b.verdict), chapters, readingTime: lectureDe(chapters) },
    sober: sobreAffiche(b.rapport),
    debloque: true,
  };
  const { messages: tous } = lu;
  const participant = (p: { nomExport: string; prenom: string }): Participant => ({
    nom: p.nomExport,
    prenom: p.prenom,
    messages: tous.filter((m) => m.nom === p.nomExport).length,
  });
  const meta: Meta = {
    appli: estAppli(h.appli) ? h.appli : "autre",
    format: h.format,
    fichier: "conv de test",
    participants: [participant(h.utilisateur), participant(h.autre)],
    resume: resumeDe(tous),
    ...(h.format === "captures" ? { captures: lu.captures ?? 0 } : {}),
    moi: 0,
    pronom: h.utilisateur.pronom,
    devinette: h.devinette,
    objectif: h.objectif,
  };
  const story = storyAffichee("apercu", meta);

  const etat = b.memoire && estFaite(b.memoire) ? b.memoire : null;
  if (!etat) return { payload, story, fiche: null, home: null };
  const person: Person = { id: "p-autre", name: h.autre.prenom, initial: initialeDe(h.autre.prenom), pronoun: h.autre.pronom };
  /* Une réponse du chat en bulles, avec les messages de l’autre auxquels il répondait */
  const bulles = (sortie: ReponseChat, recus: string[] = []): BlushAnswer => {
    const incoming = resoudre(recus, messages);
    return { ...bullesAffichees(sortie, messages), ...(incoming.length ? { incoming } : {}) };
  };
  return {
    payload,
    story,
    fiche: ficheAffichee(person, etat, rendu.lignes),
    home: {
      quick: etat.questions ?? [],
      answers: Object.fromEntries(b.reponses.map((r) => [r.question, bulles(r.sortie)])),
      script: b.script.map((e) => ({ ...(e.dit === null ? {} : { mine: e.dit }), answer: bulles(e.sortie, e.recus) })),
      fiche: { person, summaryShort: etat.fiche.phrase_courte },
    },
  };
}

/** Un fichier d’aperçu : les sorties du banc, mises en écrans. Un aperçu écrit avant (l’ancien vers-front.mjs, déjà en types du front) se lit tel quel. */
async function lireFichier(chemin: string): Promise<Apercu> {
  const json = JSON.parse(await readFile(chemin, "utf8"));
  return "banc" in json ? apercuDe(SortiesDuBanc.parse(json)) : json;
}

/** Les convs d’un dossier d’aperçus (un fichier `NN.json` par conv), dans l’ordre. */
const casDuDossier = async (dossier: string) =>
  (await readdir(dossier))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();

/**
 * `chemin` désigne un fichier (une conv) ou un dossier (une conv par fichier, `?cas=01`). C’est BLUSH_APERCU, que la
 * page lit (cheminDesApercus) et passe ici. Renvoie null sans aperçu.
 */
export async function lireApercu(chemin: string | null, cas?: string): Promise<{ data: Apercu; cas: string | null; tous: string[] } | null> {
  if (!chemin) return null;
  if (!(await stat(chemin)).isDirectory()) return { data: await lireFichier(chemin), cas: null, tous: [] };
  const tous = await casDuDossier(chemin);
  const choisi = cas && tous.includes(cas) ? cas : tous[0];
  if (!choisi) return null;
  return { data: await lireFichier(join(chemin, `${choisi}.json`)), cas: choisi, tous };
}

/** Tous les aperçus du dossier, pour la liste : le dossier lu une fois, chaque fichier traduit une fois. */
export async function lireTous(chemin: string | null): Promise<{ cas: string; data: Apercu }[]> {
  if (!chemin) return [];
  if (!(await stat(chemin)).isDirectory()) return [{ cas: "", data: await lireFichier(chemin) }];
  return Promise.all((await casDuDossier(chemin)).map(async (cas) => ({ cas, data: await lireFichier(join(chemin, `${cas}.json`)) })));
}
