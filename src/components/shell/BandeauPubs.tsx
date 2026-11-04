"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { etapeDe } from "@/lib/presence";
import { pixelMeta } from "@/lib/publique";
import { CHOIX_PUBS_S, COOKIE_CHOIX_PUBS, COOKIE_FBC, COOKIE_FBP, fbcDe, fbclidDe, fbpDe, TRACES_META_S, type ChoixPubs } from "@/lib/pubs";

/*
 * Le bandeau des pubs de Meta, court comme un bandeau de cookies (le détail est sur la page de confidentialité) : l’accord,
 * ou le refus, avant que BLUSH dise quoi que ce soit à Meta (src/server/pubs-meta.ts).
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
  const bouton = "lift lift-sm h-10 flex-1 rounded-full bg-white px-4 text-note font-black text-ink shadow-soft sm:flex-none";
  return (
    <div
      role="dialog"
      aria-label="Cookies des pubs"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[560px] flex-col gap-2.5 rounded-card bg-white p-3.5 shadow-card sm:flex-row sm:items-center sm:gap-4"
    >
      <p className="m-0 flex-1 text-note font-extrabold leading-[1.4] text-soft">
        Des cookies pour mesurer nos pubs Insta et Facebook. Jamais ta conv.{" "}
        <Link href="/confidentialite#pubs" className="text-toi-ink">
          En savoir plus
        </Link>
      </p>
      <div className="flex gap-2">
        <button type="button" className={bouton} onClick={() => choisir("non")}>
          Refuser
        </button>
        <button type="button" className={bouton} onClick={() => choisir("oui")}>
          Accepter
        </button>
      </div>
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
