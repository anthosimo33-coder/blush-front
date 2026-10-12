"use client";

/*
 * Le défilement de la conv de l’accueil : où elle se pose à l’ouverture et au retour par l’historique, comment elle
 * suit chaque nouveau message (le saut en bas, puis le glissé des lignes et le vol d’une bulle), la barre de saisie qui
 * change de hauteur, et les échanges plus anciens qui arrivent en remontant. Ce qui défile : la page sur mobile, la
 * fenêtre de la conv sur desktop.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { basDePage } from "@/lib/defilement";
import { DESKTOP, flipFrom, prefersReducedMotion, snapshotTops, spring } from "@/lib/motion";
import type { Msg } from "../conv/modele";
import type { Devant, EcranDeLHistorique } from "../conv/useChargerAnciens";
import { launch, type Flight } from "./vol";

/*
 * Un retour par l’historique (le geste retour, « Retour » sur sa fiche) : l’adresse et le moment du dernier. Et où en
 * était la conv quand on a quitté l’accueil (mobile) ? Tout en bas, elle y revient ; lue plus haut, elle revient à
 * cette place (la conv gardée est la même, voir useConversation).
 */
let traversee: { href: string; at: number } | null = null;
let quittee = { enBas: true, y: 0 };
if (typeof window !== "undefined") window.addEventListener("popstate", () => (traversee = { href: location.href, at: performance.now() }));

/**
 * Les dernières lignes de la conv : seules elles glissent quand un message arrive (la conv saute en bas d’abord). Sur
 * une longue conv, relever toutes les lignes avant et après chaque message coûterait pour rien.
 */
function dernieresLignes(box: HTMLElement) {
  return [...box.querySelectorAll<HTMLElement>("[data-row]")].slice(-40);
}

/**
 * La hauteur de la conv avant d’y poser des messages (la page sur mobile, la fenêtre sur desktop). `marque` : voir
 * Devant (accueil/conv/useChargerAnciens.ts). Jusqu’au rendu qui les pose, Chrome ne garde pas la place de lui-même (l’ancrage du défilement, que Safari
 * n’a pas) : le décalage appliqué ensuite compterait deux fois.
 */
function mesurerLaConv(box: HTMLElement | null, marque?: number) {
  const desk = !!box && window.matchMedia(DESKTOP).matches;
  defilant(desk ? box : null).style.overflowAnchor = "none";
  return { desk, h: desk && box ? box.scrollHeight : document.documentElement.scrollHeight, marque };
}

/** Ce qui défile : la fenêtre de la conv sur desktop, la page sur mobile. */
const defilant = (box: HTMLElement | null) => box ?? document.documentElement;

/**
 * Attend que la conv soit au repos (120 ms sans défilement) avant d’y poser un morceau d’historique : posé pendant
 * l’élan d’un geste, il couperait l’élan sur Safari. Tout près du haut (moins d’un écran), il se pose tout de suite.
 */
function convAuRepos(box: HTMLElement | null) {
  const desk = !!box && window.matchMedia(DESKTOP).matches;
  const pres = () => (desk && box ? box.scrollTop < box.clientHeight : window.scrollY < window.innerHeight);
  const cible: HTMLElement | Window = desk && box ? box : window;
  return new Promise<void>((pose) => {
    if (pres()) return pose();
    let t = window.setTimeout(poser, 120);
    function poser() {
      window.clearTimeout(t);
      cible.removeEventListener("scroll", bouge);
      pose();
    }
    function bouge() {
      window.clearTimeout(t);
      if (pres()) poser();
      else t = window.setTimeout(poser, 120);
    }
    cible.addEventListener("scroll", bouge, { passive: true });
  });
}

/**
 * Ce que l’écran garde entre deux changements de la conv : des messages posés devant (Devant), où étaient ses lignes
 * (pour les faire glisser) et la bulle qui doit voler. `ecran` et `avantChangement` vont à useConversation (sa scène),
 * le reste à useConvSuitLeBas. Pose aussi la conv en bas à l’ouverture, et note où elle en est jusqu’au départ.
 */
export function useDefilement(threadRef: RefObject<HTMLElement | null>) {
  /* Des messages posés devant (ou fondus dans la conv) : voir Devant (accueil/conv/useChargerAnciens.ts) */
  const devantRef = useRef<Devant | null>(null);
  /* Avant chaque changement de la conv : où étaient ses lignes (pour les faire glisser), et la bulle qui doit voler */
  const beforeRef = useRef<Map<string, number> | null>(null);
  const flightRef = useRef<Flight | null>(null);

  /*
   * À l’ouverture, la conv se pose en bas, sur le dernier échange, sans animation (la page sur mobile, la fenêtre sur
   * desktop). Revenu par l’historique alors qu’on lisait plus haut, elle revient à cette place : la conv gardée est la
   * même qu’au départ, et le navigateur, qui remet la place avant que la page soit là, la tronquerait.
   * Juste après, la conv s’allonge (les jours et les heures, posés après l’hydratation ; les polices) : tant qu’on n’a
   * pas bougé, elle reste en bas. Safari, lui, ne garde pas la place tout seul (pas d’ancrage du défilement).
   */
  useLayoutEffect(() => {
    const box = threadRef.current;
    const fil = box?.querySelector("[data-thread]");
    if (!box || !fil) return;
    const retour = traversee !== null && traversee.href === location.href && performance.now() - traversee.at < 10_000;
    traversee = null;
    const desk = window.matchMedia(DESKTOP).matches;
    if (!desk && retour && !quittee.enBas) {
      window.scrollTo({ top: Math.min(quittee.y, basDePage()) });
      return;
    }
    const ou = () => (desk ? box.scrollTop : window.scrollY);
    let pose = 0;
    const poser = () => {
      if (desk) box.scrollTop = box.scrollHeight;
      else window.scrollTo({ top: basDePage() });
      pose = ou();
    };
    poser();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => Math.abs(ou() - pose) < 2 && poser());
    obs?.observe(fil);
    /* Le premier geste (ou 3 s) : la conv est à toi */
    const lacher = () => {
      obs?.disconnect();
      window.clearTimeout(t);
      gestes.forEach((g) => window.removeEventListener(g, lacher, { capture: true }));
    };
    const t = window.setTimeout(lacher, 3000);
    const gestes = ["pointerdown", "wheel", "keydown"] as const;
    gestes.forEach((g) => window.addEventListener(g, lacher, { capture: true, passive: true }));
    return lacher;
    /* À l’ouverture seulement : la ref de la conv ne change pas */
  }, [threadRef]);

  /* Mobile : où en est la conv, tout en bas ou plus haut ? (relevé jusqu’au départ de l’accueil, pour un retour par l’historique) */
  useLayoutEffect(() => {
    const suivre = () => {
      quittee = { enBas: window.scrollY >= basDePage() - 4, y: window.scrollY };
    };
    suivre();
    window.addEventListener("scroll", suivre, { passive: true });
    return () => window.removeEventListener("scroll", suivre);
  }, []);

  const ecran: EcranDeLHistorique = {
    devant: devantRef,
    mesurer: (marque) => mesurerLaConv(threadRef.current, marque),
    auRepos: () => convAuRepos(threadRef.current),
  };
  /* On note d’abord où sont les lignes de la conv, pour les faire glisser ensuite */
  const avantChangement = () => {
    if (!beforeRef.current && threadRef.current) beforeRef.current = snapshotTops(dernieresLignes(threadRef.current), (el) => el.dataset.row);
  };
  return { devantRef, beforeRef, flightRef, ecran, avantChangement };
}

type Defilement = ReturnType<typeof useDefilement>;

/**
 * La conv suit chaque nouveau message, et la barre de saisie qui change de hauteur. `threadRef` : la conv (sa fenêtre
 * sur desktop) ; `composerRef` : la barre de saisie.
 */
export function useConvSuitLeBas(
  msgs: Msg[],
  threadRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLFormElement | null>,
  { devantRef, beforeRef, flightRef }: Defilement,
) {
  const shown = useRef(msgs);
  /* La hauteur de la barre de saisie au dernier relevé (pour savoir de combien elle a changé) */
  const barre = useRef(0);

  /*
   * Chaque nouveau message fait défiler la conv jusqu’en bas (la page sur mobile, la fenêtre sur desktop).
   * En mouvement : la conv saute d’un coup en bas, puis chaque ligne repart de là où elle était (FLIP) : le défilement devient un ressort,
   * et la bulle qui vole part juste avant.
   */
  useLayoutEffect(() => {
    if (shown.current === msgs) return;
    shown.current = msgs;
    const box = threadRef.current;
    if (!box) return;
    /* La barre de saisie a pu changer de hauteur avec la conv (les questions qui partent ou reviennent) : ce défilement en tient compte */
    barre.current = composerRef.current?.offsetHeight ?? 0;
    /*
     * Des messages plus anciens posés devant : on garde la conv là où on la lisait. Un décalage, pas une place : entre
     * la mesure et ce rendu, l’élan du doigt a continué (Safari n’ancre pas le défilement), il n’est pas annulé
     */
    const d = devantRef.current;
    if (d) {
      /*
       * Le morceau attendu n’est pas encore là : un autre rendu passe avant le sien (une réponse de BLUSH pendant qu’on
       * remonte la conv). Rien ne défile ni ne glisse, la conv ne saute pas en bas ; la hauteur de référence devient
       * celle de ce rendu, pour que le décalage, au rendu du morceau, ne compte que lui.
       */
      if (d.marque !== undefined && !msgs.some((m) => m.id === d.marque)) {
        d.h = d.desk ? box.scrollHeight : document.documentElement.scrollHeight;
        beforeRef.current = null;
        flightRef.current = null;
        return;
      }
      devantRef.current = null;
      const delta = (d.desk ? box.scrollHeight : document.documentElement.scrollHeight) - d.h;
      if (d.desk) box.scrollTop += delta;
      else window.scrollBy(0, delta);
      defilant(d.desk ? box : null).style.removeProperty("overflow-anchor");
      d.pose?.();
      return;
    }
    const desk = window.matchMedia(DESKTOP).matches;
    const reduced = prefersReducedMotion();
    /* Sur mobile, jamais plus bas que le bas de la page : clavier ouvert, Safari décollerait le champ du clavier */
    const toBottom = (behavior: ScrollBehavior) => (desk ? box.scrollTo({ top: box.scrollHeight, behavior }) : window.scrollTo({ top: basDePage(), behavior }));
    const tops = beforeRef.current;
    const f = flightRef.current;
    beforeRef.current = null;
    flightRef.current = null;
    toBottom("auto");
    if (reduced) return;
    if (f) launch(box, f);
    if (tops) flipFrom(tops, dernieresLignes(box), (el) => el.dataset.row, spring("soft"));
    /* À chaque nouveau msgs seulement (chaque message, chaque morceau d’historique) : les refs ne changent pas */
  }, [msgs, threadRef, composerRef, devantRef, beforeRef, flightRef]);

  /*
   * La barre de saisie change de hauteur sans nouveau message (« Tu creuses », le vocal, les questions masquées) :
   * collée en bas avant, la conv y reste, sinon la dernière bulle passerait sous la barre.
   */
  useEffect(() => {
    const form = composerRef.current;
    const box = threadRef.current;
    if (!form || !box || typeof ResizeObserver === "undefined") return;
    barre.current = form.offsetHeight;
    const obs = new ResizeObserver(() => {
      const h = form.offsetHeight;
      const delta = h - barre.current;
      barre.current = h;
      if (!delta) return;
      const desk = window.matchMedia(DESKTOP).matches;
      /* Ce qui manque pour toucher le bas : la barre qui grandit l’a ajouté ; au-delà, on lisait plus haut */
      const reste = desk ? box.scrollHeight - box.scrollTop - box.clientHeight : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (reste > Math.max(0, delta) + 2) return;
      if (desk) box.scrollTop = box.scrollHeight;
      else window.scrollTo({ top: basDePage() });
    });
    obs.observe(form);
    return () => obs.disconnect();
    /* Au montage seulement : les refs ne changent pas */
  }, [composerRef, threadRef]);

  /* Parti avant que des messages attendus soient posés : l’ancrage du défilement revient (voir mesurerLaConv) */
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("overflow-anchor");
      threadRef.current?.style.removeProperty("overflow-anchor");
    },
    /* Au départ seulement : la ref de la conv ne change pas */
    [threadRef],
  );
}

/*
 * En remontant la conv, les échanges plus anciens arrivent d’eux-mêmes : à la première remontée, le morceau d’avant
 * est demandé ; quand le haut approche, il se pose. Seulement en remontant vraiment : le défilement diminue, hors du
 * bas de la conv. En bas, une position qui diminue est la page qui raccourcit (sur mobile, la conv posée en bas se
 * recale à l’ouverture) ou la fin d’un rebond : rien ne part à l’ouverture, même quand le haut est déjà à l’écran.
 * Toute remontée compte, au doigt, à la molette, au clavier, par la barre de défilement ou un lecteur d’écran. Un saut
 * d’un coup (la touche Début, la barre tirée en haut) arrive avant que l’observateur voie le haut : c’est lui qui pose.
 * `hautRef` : le repère en haut de la conv (là où l’historique se charge) ; `plus` : il reste des échanges plus anciens.
 */
export function useAnciensEnRemontant({
  plus,
  hautRef,
  threadRef,
  chargerAnciens,
  precharger,
}: {
  plus: boolean;
  hautRef: RefObject<HTMLDivElement | null>;
  threadRef: RefObject<HTMLElement | null>;
  chargerAnciens: () => Promise<unknown>;
  precharger: () => void;
}) {
  useEffect(() => {
    const el = hautRef.current;
    const box = threadRef.current;
    if (!plus || !el || !box) return;
    const desk = window.matchMedia(DESKTOP).matches;
    const pos = () => (desk ? box.scrollTop : window.scrollY);
    const bas = () => (desk ? box.scrollHeight - box.clientHeight : basDePage());
    let proche = false;
    /* Le dernier défilement remontait la conv */
    let monte = false;
    let avant = pos();
    const obs = new IntersectionObserver(
      ([e]) => {
        proche = !!e?.isIntersecting;
        if (proche && monte && el.isConnected) void chargerAnciens();
      },
      { root: desk ? box : null, rootMargin: "1200px 0px 0px 0px" },
    );
    obs.observe(el);
    const cible: HTMLElement | Window = desk ? box : window;
    const bouge = () => {
      /* L’accueil quitté (sa fiche remonte la page en haut) : ce n’est pas une remontée */
      if (!el.isConnected) return;
      const y = pos();
      monte = y < avant && y < bas() - 2;
      avant = y;
      if (!monte) return;
      precharger();
      if (proche) void chargerAnciens();
    };
    cible.addEventListener("scroll", bouge, { passive: true });
    return () => {
      obs.disconnect();
      cible.removeEventListener("scroll", bouge);
    };
    /* Les refs du haut et de la conv ne changent pas */
  }, [plus, hautRef, threadRef, chargerAnciens, precharger]);
}
