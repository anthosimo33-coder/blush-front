"use client";

import { useMemo, useState } from "react";
import { setQueryData } from "@/lib/query";
import { CATALOGUE } from "@/contenu/offres";
import { CompteRendu } from "@/components/shell/compte-de-la-page";
import type { BlushAnswer, OffreDuChat } from "@/types";
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

const TITRES = ["Le 9 mai, quand tout a basculé", "Sophie, et son « on verra »", "Toi, qui relances toujours"];

const RAPPORT: OffreDuChat = { genre: "rapport", offre: "rapport", centimes: CATALOGUE.rapport.centimes, chapitres: 8, titres: TITRES };

/** L’échange déjà là quand l’écran s’ouvre : la conv a une histoire. */
const DEJA: EchangeScript[] = [
  {
    mine: "elle m’a mis un vu, je relance ?",
    answer: { kind: "bubbles", bubbles: [{ text: "relance pas ce soir" }, { text: "son exam est jeudi, laisse-la souffler" }] },
  },
];

/** Ce qu’il tape, et ce que BLUSH répond, dans chaque parcours. */
const SCENES: Record<Parcours, { tape: string; reponse: BlushAnswer; solde: number }> = {
  demande: {
    tape: "je peux avoir le rapport en entier ?",
    solde: 6,
    reponse: { kind: "bubbles", bubbles: [{ text: "oui, et il vaut le coup" }, { text: "le chapitre 4 dit pourquoi elle hésite" }], offre: RAPPORT },
  },
  moment: {
    tape: "pourquoi elle répond plus lentement depuis mardi ?",
    solde: 6,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "elle a pas moins envie, elle a peur d’aller trop vite" }, { text: "le détail, c’est tout le chapitre 4" }],
      offre: RAPPORT,
    },
  },
  bulles: {
    tape: "elle m’a répondu « jsp », je lui dis quoi ?",
    solde: 0,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "j’ai ta réponse, mais t’as plus de bulles" }],
      offre: {
        genre: "bulles",
        packs: (["pack30", "pack80", "pack200"] as const).map((o) => ({ offre: o, bulles: CATALOGUE[o].bulles, centimes: CATALOGUE[o].centimes })),
        reponse: ["« jsp », c’est pas un non", "elle attend un vrai plan, avec un jour"],
        envoi: ["samedi 15h, le café en face de chez toi ?"],
      },
    },
  },
  autre: {
    tape: "y a aussi Léa qui m’écrit depuis lundi, tu regardes ?",
    solde: 6,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "grave, envoie-la moi" }, { text: "on la lit à part, chaque conv a son rapport" }],
      offre: { genre: "autre", prenom: "Léa" },
    },
  },
  reimport: {
    tape: "je vais payer pour l’autre rapport",
    solde: 61,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "ok, c’est ton choix et je te suis" }, { text: "tu paies là, il s’ouvre dès que tu réimportes ta conv" }],
      offre: { genre: "reimport", offre: "second", centimes: CATALOGUE.second.centimes, barre: CATALOGUE.rapport.centimes, prenom: "Sophie" },
    },
  },
  refus: {
    tape: "je peux avoir le rapport en entier ?",
    solde: 6,
    reponse: { kind: "bubbles", bubbles: [{ text: "oui, et il vaut le coup" }, { text: "le chapitre 4 dit pourquoi elle hésite" }], offre: RAPPORT },
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
      carte: { marque: "Visa", fin: "4242" },
      payer: () =>
        new Promise((ok) =>
          setTimeout(() => {
            essais++;
            ok(parcours === "refus" && essais === 1 ? "carte" : "paye");
          }, PAIEMENT_MS),
        ),
      surRecharge: (bulles) => setQueryData("account", { ...compte.compte, bulles: compte.compte.bulles + bulles - 1 }),
    };
  }, [parcours, compte]);
  return (
    <CompteRendu value={compte}>
      <HomeScreen key={parcours} contact={CONTACT} script={DEJA} quick={[]} envoyer={envoyer} achat={achat} dire={scene.tape} />
    </CompteRendu>
  );
}
