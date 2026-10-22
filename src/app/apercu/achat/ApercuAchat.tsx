"use client";

import { useMemo, useState } from "react";
import { setQueryData } from "@/lib/query";
import { CATALOGUE } from "@/contenu/offres";
import { CompteRendu } from "@/components/shell/compte-de-la-page";
import type { BlushAnswer } from "@/types";
import type { Account } from "@/types/api";
import { HomeScreen } from "../../app/HomeScreen";
import type { AchatDuChat } from "../../app/accueil/achat";
import type { HomeContact } from "../../app/accueil/contact";
import type { EchangeScript } from "../../app/accueil/conv/modele";
import type { Envoyer } from "../../app/accueil/envois";
import type { Parcours } from "./parcours";

/*
 * L’achat dans le chat, joué dans le vrai accueil (hors de Vercel seulement, src/proxy.ts) : une conv inventée (Hugo et
 * Sophie), un message à taper, la réponse de BLUSH qui porte sa carte d’achat, et un paiement simulé (aucun appel au
 * prestataire). Un parcours par adresse (`?parcours=`), pour la vidéo des propositions.
 */

/** Le temps que BLUSH « écrit » avant sa réponse, en ms. */
const LECTURE_MS = 1700;
/** Le temps d’un paiement en un geste, en ms. */
const PAIEMENT_MS = 1300;

const CONTACT: HomeContact = {
  report: {
    verdict: { emoji: "🤏", short: "À deux doigts", title: "Vous êtes à deux doigts.", subtitle: "Elle a posé la question, t’as esquivé." },
    level: "dit",
    trend: "↗ ça se réchauffe",
    nextStep: "Samedi, tu lui proposes un vrai plan.",
  },
  fiche: { person: { id: "p1", name: "Sophie", initial: "S", pronoun: "elle" }, summaryShort: "Son exam jeudi" },
  period: "2 mars → 21 oct.",
};

/** La réponse prête, à zéro bulle : ce que la recharge ouvre. */
const PRETE = { reponse: ["«\u00a0jsp\u00a0», c’est pas un non", "elle attend un vrai plan, avec un jour"], envoi: ["samedi 15h, le café en face de chez toi\u00a0?"] };

/** L’échange déjà là quand l’écran s’ouvre : la conv a une histoire. */
const DEJA: EchangeScript[] = [
  {
    mine: "elle m’a mis un vu, je relance\u00a0?",
    answer: { kind: "bubbles", bubbles: [{ text: "relance pas ce soir" }, { text: "son exam est jeudi, laisse-la souffler" }] },
  },
];

/** Ce que coûte la réponse, et ce qu’il reste : le compteur de l’en-tête le suit, comme dans l’appli. */
const cout = (depensees: number, restantes: number) => ({ bulles: { depensees, restantes } });

/**
 * Ce qu’il envoie (`tape` : un message ; sans, des captures), son solde à l’ouverture, et ce que BLUSH répond, dans
 * chaque parcours. Le chat n’est ouvert qu’avec un rapport payé : tout ici se vend à quelqu’un qui a déjà payé.
 */
const SCENES: Record<Parcours, { tape?: string; reponse: BlushAnswer; solde: number }> = {
  autre: {
    tape: "y a aussi Léa qui m’écrit depuis lundi, tu regardes\u00a0?",
    solde: 14,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "attends, t’as une deuxième conv et tu me dis rien 👀" }, { text: "envoie-la, je te dis si c’est du sérieux" }],
      offre: { genre: "autre", prenom: "Léa" },
      ...cout(1, 13),
    },
  },
  meme: {
    solde: 14,
    reponse: {
      kind: "bubbles",
      bubbles: [
        { text: "ok là c’est elle qui revient vers toi" },
        { text: "«\u00a0t’es dispo samedi\u00a0?\u00a0», elle a jamais été aussi claire" },
        { text: "ton rapport date d’avant tout ça" },
      ],
      offre: { genre: "a_jour", prenom: "Sophie", depuis: "2 octobre" },
      ...cout(3, 11),
    },
  },
  peu: {
    tape: "il m’en reste 2, je recharge comment\u00a0?",
    solde: 2,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "juste en dessous, un geste et c’est fait" }, { text: "et après tu m’envoies sa réponse en capture" }],
      offre: { genre: "bulles", solde: 1, enUnGeste: true },
      ...cout(1, 1),
    },
  },
  bulles: {
    tape: "elle m’a répondu «\u00a0jsp\u00a0», je lui dis quoi\u00a0?",
    solde: 0,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "j’ai ta réponse, mais t’as plus de bulles" }],
      offre: { genre: "bulles", solde: 0, enUnGeste: true, reponse: PRETE.reponse, envoi: PRETE.envoi },
    },
  },
  refus: {
    tape: "elle m’a répondu «\u00a0jsp\u00a0», je lui dis quoi\u00a0?",
    solde: 0,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "j’ai ta réponse, mais t’as plus de bulles" }],
      offre: { genre: "bulles", solde: 0, enUnGeste: true, reponse: PRETE.reponse, envoi: PRETE.envoi },
    },
  },
  premium: {
    tape: "et là elle me dit «\u00a0on verra\u00a0», je réponds quoi\u00a0?",
    solde: 3,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "«\u00a0on verra\u00a0», c’est la balle dans ton camp" }, { text: "toi tu parles beaucoup, et tes bulles fondent vite" }],
      send: ["ok, je te propose samedi alors"],
      offre: { genre: "premium", enUnGeste: true },
      ...cout(1, 2),
    },
  },
  reimport: {
    tape: "je vais payer pour l’autre rapport",
    solde: 61,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "ok, c’est ton choix et je te suis" }, { text: "réimporte ta conv, cette fois t’as tout" }],
      offre: { genre: "reimport", prenom: "Sophie" },
      ...cout(1, 60),
    },
  },
  demande: {
    tape: "je reprends des bulles, t’as quoi\u00a0?",
    solde: 6,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "le pack du milieu, c’est le bon plan" }, { text: "et t’as un bonus à ta première recharge" }],
      offre: { genre: "bulles", solde: 5, enUnGeste: true },
      ...cout(1, 5),
    },
  },
};

export function ApercuAchat({ parcours }: { parcours: Parcours }) {
  const scene = SCENES[parcours];
  const [compte] = useState<{ compte: Account; rendu: number }>(() => ({
    compte: { email: "hugo@exemple.fr", bulles: scene.solde, client: true, equipe: false, storyDeleted: false },
    rendu: Date.now(),
  }));
  const envoyer = useMemo<Envoyer>(() => async () => new Promise<BlushAnswer>((ok) => setTimeout(() => ok(scene.reponse), LECTURE_MS)), [scene]);
  const achat = useMemo<AchatDuChat>(() => {
    let essais = 0;
    return {
      payer: (offre) =>
        new Promise((ok) =>
          setTimeout(() => {
            essais++;
            if (parcours === "refus" && essais === 1) return ok("carte");
            /* Le compteur de l’en-tête prend les bulles payées, comme dans l’appli */
            setQueryData("account", { ...compte.compte, bulles: Math.max(0, scene.reponse.bulles?.restantes ?? compte.compte.bulles) + CATALOGUE[offre].bulles });
            ok("paye");
          }, PAIEMENT_MS),
        ),
      recharger: () => {},
      noter: () => {},
      premiereRecharge: async () => parcours === "demande",
    };
  }, [parcours, compte, scene]);
  return (
    <CompteRendu value={compte}>
      <HomeScreen key={parcours} contact={CONTACT} script={DEJA} quick={[]} envoyer={envoyer} achat={achat} {...(scene.tape ? { dire: scene.tape } : {})} />
    </CompteRendu>
  );
}
