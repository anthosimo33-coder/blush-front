import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { CATALOGUE } from "@/contenu/offres";
import { DonneesStructurees, donneesDuSite } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * La landing, la porte d’entrée des moteurs de recherche (src/lib/referencement.ts) : un titre et une description qui
 * disent ce que fait BLUSH avec les mots qu’on cherche (analyser sa conv WhatsApp ou Instagram, ce qui se passe entre
 * vous, quoi répondre). TODO(produit): le titre et la description pour les moteurs, écrits le 15 octobre 2026, à relire.
 */
export const metadata: Metadata = pagePublique("/", {
  title: "BLUSH · Analyse ta conv\u00a0: ce qui se passe vraiment entre vous",
  description: "Importe ta conv WhatsApp, Instagram ou tes captures. BLUSH lit tout et te dit ce qui se passe vraiment entre vous, messages à l’appui, et quoi lui répondre.",
});

/**
 * Ce que les moteurs comprennent de BLUSH (données structurées schema.org, src/lib/donnees-structurees.tsx) : son
 * éditeur et ses comptes officiels, le site et les noms qu’on tape pour le trouver, et l’appli web, avec son prix de
 * départ (le rapport). Lu par Google pour ses résultats ; rien d’affiché.
 */
const DONNEES_STRUCTUREES = donneesDuSite(URL_SITE, (CATALOGUE.rapport.centimes / 100).toFixed(2));

/* La landing : son bouton « Analyser ma conv » mène au parcours (/commencer). Qui revient connecté voit src/app/retour. */
export default function Home() {
  return (
    <>
      <DonneesStructurees donnees={DONNEES_STRUCTUREES} />
      <Landing />
    </>
  );
}
