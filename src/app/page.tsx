import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { CATALOGUE } from "@/contenu/offres";
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
 * Ce que les moteurs comprennent de BLUSH (données structurées schema.org) : une appli web, son éditeur, son prix de
 * départ (le rapport). Lu par Google pour ses résultats enrichis ; rien d’affiché.
 */
const DONNEES_STRUCTUREES = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${URL_SITE}/#editeur`, name: "BLUSH", url: URL_SITE, logo: `${URL_SITE}/icon.svg` },
    {
      "@type": "WebApplication",
      name: "BLUSH",
      url: URL_SITE,
      inLanguage: "fr",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, iOS, Android",
      description: "BLUSH lit ta conv WhatsApp ou Instagram et te dit ce qui se passe vraiment entre vous, messages à l’appui, et quoi lui répondre.",
      publisher: { "@id": `${URL_SITE}/#editeur` },
      offers: { "@type": "Offer", price: (CATALOGUE.rapport.centimes / 100).toFixed(2), priceCurrency: "EUR" },
    },
  ],
};

/* La landing : son bouton « Analyser ma conv » mène au parcours (/commencer). Qui revient connecté voit src/app/retour. */
export default function Home() {
  return (
    <>
      {/* Du JSON écrit par nous, sans rien venir d’un visiteur ; « < » échappé pour qu’aucune balise ne s’y ferme */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(DONNEES_STRUCTUREES).replace(/</g, "\\u003c") }} />
      <Landing />
    </>
  );
}
