"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { NBSP } from "@/lib/format";
import { etapeDe } from "@/lib/presence";
import { pixelMeta } from "@/lib/publique";
import { CHOIX_PUBS_S, COOKIE_CHOIX_PUBS, COOKIE_FBC, COOKIE_FBP, fbcDe, fbclidDe, fbpDe, TRACES_META_S, type ChoixPubs } from "@/lib/pubs";

/*
 * Le bandeau des pubs de Meta : l’accord, ou le refus, avant que BLUSH dise quoi que ce soit à Meta (src/server/pubs-meta.ts).
 * Refuser se fait d’un geste, comme accepter, avec un bouton du même poids (la CNIL le demande) ; le choix se garde six
 * mois (blush-pubs), et se change sur la page de confidentialité (ChoixDesPubs). Accepter pose les deux cookies que Meta
 * sait lire : _fbp (ce navigateur, tiré au hasard) et _fbc (le clic de la pub, si la page d’arrivée portait son fbclid,
 * retenu en mémoire seulement, jamais écrit avant l’accord). Refuser les efface. Ne s’ouvre que si Meta est branché
 * (NEXT_PUBLIC_META_PIXEL_ID), jamais sur les outils de l’équipe ni sur un lien de tournage.
 * TODO(produit): le texte du bandeau, à relire par un juriste (et à reporter dans le PDF de confidentialité de Whop).
 */

/* Le fbclid de la page d’arrivée (le clic d’une pub), lu au premier chargement et gardé en mémoire, le temps de choisir */
const fbclidDArrivee = typeof window === "undefined" ? null : fbclidDe(window.location.href);

/*
 * L’état du bandeau, lu dans le navigateur seulement (le serveur ne connaît pas le choix : rien au premier rendu, la
 * page ne saute pas) : le choix gardé, ou « rouvert » par « Changer mon choix ». Ses abonnés sont prévenus à chaque geste.
 */
let rouvert = false;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());
const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};
const etatDuNavigateur = () => (rouvert ? "rouvert" : (choixGarde() ?? "aucun"));
const etatDuServeur = () => "serveur";

const cookieLu = (nom: string): string | null =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${nom}=`))
    ?.slice(nom.length + 1) ?? null;

const cookiePose = (nom: string, valeur: string, secondes: number) => {
  document.cookie = `${nom}=${valeur}; Max-Age=${secondes}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
};

/** Le choix gardé pour les pubs de Meta, ou null : pas encore choisi. */
const choixGarde = (): ChoixPubs | null => {
  const c = cookieLu(COOKIE_CHOIX_PUBS);
  return c === "oui" || c === "non" ? c : null;
};

/** Garde le choix ; avec l’accord, pose les cookies de Meta (_fbp s’il manque, _fbc d’un clic de pub), sinon les efface. */
function choisir(choix: ChoixPubs): void {
  cookiePose(COOKIE_CHOIX_PUBS, choix, CHOIX_PUBS_S);
  if (choix === "non") {
    cookiePose(COOKIE_FBP, "", 0);
    cookiePose(COOKIE_FBC, "", 0);
  } else {
    const maintenant = Date.now();
    if (!cookieLu(COOKIE_FBP)) cookiePose(COOKIE_FBP, fbpDe(maintenant, Math.floor(Math.random() * 1e10)), TRACES_META_S);
    if (fbclidDArrivee) cookiePose(COOKIE_FBC, fbcDe(fbclidDArrivee, maintenant), TRACES_META_S);
  }
  rouvert = false;
  prevenir();
}

/** Le bandeau, en bas de l’écran, tant que la personne n’a pas choisi (ou qu’elle veut changer son choix). */
export function BandeauPubs() {
  const chemin = usePathname();
  const etat = useSyncExternalStore(sAbonner, etatDuNavigateur, etatDuServeur);
  const ici = !!pixelMeta() && etapeDe(chemin) !== null && !chemin.startsWith("/tournage");
  if (!ici || (etat !== "aucun" && etat !== "rouvert")) return null;
  return (
    <div
      role="dialog"
      aria-labelledby="bandeau-pubs-titre"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[440px] rounded-card bg-white p-4 shadow-card"
    >
      <p id="bandeau-pubs-titre" className="m-0 text-accent font-black">
        Les pubs de BLUSH sur Insta et Facebook
      </p>
      <p className="m-0 mt-1.5 text-note font-extrabold leading-[1.45] text-soft">
        Si tu acceptes, on dit à Meta quand quelqu’un venu d’une de nos pubs importe une conv ou paie, pour qu’il les montre aux bonnes personnes. Jamais ta conv, ni ce que BLUSH
        en dit.{" "}
        <Link href="/confidentialite#pubs" className="text-toi-ink">
          En savoir plus
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="md" onClick={() => choisir("non")}>
          Refuser
        </Button>
        <Button variant="secondary" size="md" onClick={() => choisir("oui")}>
          Accepter
        </Button>
      </div>
      <span className="sr-only">Ton choix se garde six mois{NBSP}; tu le changes sur la page de confidentialité.</span>
    </div>
  );
}

/** « Changer mon choix » (la page de confidentialité) : rouvre le bandeau des pubs. */
export function ChoixDesPubs() {
  if (!pixelMeta()) return null;
  return (
    <Button
      variant="link"
      onClick={() => {
        rouvert = true;
        prevenir();
      }}
    >
      Changer mon choix pour les pubs
    </Button>
  );
}
