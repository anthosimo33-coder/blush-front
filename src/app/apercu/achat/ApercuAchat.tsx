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

const PACKS = (["pack30", "pack80", "pack200"] as const).map((o) => ({ offre: o, bulles: CATALOGUE[o].bulles, centimes: CATALOGUE[o].centimes }));

/** Ce que coûte la réponse, et ce qu’il reste : le compteur de l’en-tête le suit, comme dans l’appli. */
const cout = (depensees: number, restantes: number) => ({ bulles: { depensees, restantes } });

/**
 * Ce qu’il envoie (`tape` : un message ; sans, des captures), son solde à l’ouverture, et ce que BLUSH répond, dans
 * chaque parcours. Le chat n’est ouvert qu’avec un rapport payé : tout ici se vend à quelqu’un qui a déjà payé.
 */
const SCENES: Record<Parcours, { tape?: string; reponse: BlushAnswer; solde: number }> = {
  autre: {
    tape: "y a aussi Léa qui m’écrit depuis lundi, tu regardes ?",
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
        { text: "« t’es dispo samedi ? », elle a jamais été aussi claire" },
        { text: "ton rapport date du 2 octobre, il a raté tout ça" },
      ],
      offre: { genre: "a_jour", offre: "second", centimes: CATALOGUE.second.centimes, barre: CATALOGUE.rapport.centimes, nouveaux: 48, depuis: "le 2 octobre", prenom: "Sophie" },
      ...cout(3, 11),
    },
  },
  peu: {
    tape: "je lui propose quoi pour samedi ?",
    solde: 2,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "un truc simple : le marché, puis un café" }, { text: "et envoie-moi sa réponse en capture, je te dis quoi dire" }],
      send: ["samedi matin, marché puis café ?"],
      offre: { genre: "bulles", solde: 1, packs: PACKS, reponse: [], envoi: [] },
      ...cout(1, 1),
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
        solde: 0,
        packs: PACKS,
        reponse: ["« jsp », c’est pas un non", "elle attend un vrai plan, avec un jour"],
        envoi: ["samedi 15h, le café en face de chez toi ?"],
      },
    },
  },
  refus: {
    tape: "elle m’a répondu « jsp », je lui dis quoi ?",
    solde: 0,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "j’ai ta réponse, mais t’as plus de bulles" }],
      offre: {
        genre: "bulles",
        solde: 0,
        packs: PACKS,
        reponse: ["« jsp », c’est pas un non", "elle attend un vrai plan, avec un jour"],
        envoi: ["samedi 15h, le café en face de chez toi ?"],
      },
    },
  },
  premium: {
    tape: "et là elle me dit « on verra », je réponds quoi ?",
    solde: 3,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "« on verra », c’est la balle dans ton camp" }, { text: "toi tu parles beaucoup, et tes bulles fondent vite" }],
      send: ["ok, je te propose samedi alors"],
      offre: { genre: "premium", offre: "premium_ajout", centimes: CATALOGUE.premium_ajout.centimes, barre: CATALOGUE.pack80.centimes, bulles: CATALOGUE.premium_ajout.bulles },
      ...cout(1, 2),
    },
  },
  reimport: {
    tape: "je vais payer pour l’autre rapport",
    solde: 61,
    reponse: {
      kind: "bubbles",
      bubbles: [{ text: "ok, c’est ton choix et je te suis" }, { text: "tu paies là, il s’ouvre dès que tu réimportes ta conv" }],
      offre: { genre: "reimport", offre: "second", centimes: CATALOGUE.second.centimes, barre: CATALOGUE.rapport.centimes, prenom: "Sophie" },
      ...cout(1, 60),
    },
  },
  demande: {
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
      surBulles: (bulles) => setQueryData("account", { ...compte.compte, bulles: Math.max(0, scene.reponse.bulles?.restantes ?? compte.compte.bulles) + bulles }),
    };
  }, [parcours, compte, scene]);
  return (
    <CompteRendu value={compte}>
      <HomeScreen key={parcours} contact={CONTACT} script={DEJA} quick={[]} envoyer={envoyer} achat={achat} {...(scene.tape ? { dire: scene.tape } : {})} />
    </CompteRendu>
  );
}
