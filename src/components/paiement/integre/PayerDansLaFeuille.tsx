"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandingElement, PaymentElement, Payments, usePayments, useWhop, WhopElements } from "@whop/elements-react";
import type { PaymentRequestResource, WalletButtonArt } from "@whop/elements/payments";
import type { AchatImmediat } from "@/contenu/consentements";
import { enEuros } from "@/contenu/offres";
import { DANS_LA_FEUILLE, FEUILLE_FORMULE } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { marquerJalon } from "@/lib/jalons";
import { codeDe } from "@/lib/messages-erreur";
import { apresLaLivraison, attendreLaLivraison, noterLaSuite, versLeRetour } from "@/lib/paiement";
import { apresDeblocage, useCompte, useFeuilleDuPaiement } from "@/lib/requetes";
import { signalerErreur } from "@/lib/sentinelle";
import { commencerPaiement, etatDuPaiement } from "@/services/api";
import { CheckBurst } from "@/components/brand/objects3d";
import { MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { Button, IconButton } from "@/components/ui/Button";
import { Alert, TypingDots } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import type { GenreVendu, Jalon, OffreId } from "@/types";
import type { EtatAchat } from "@/types/api";
import { usePaiement, type QuandRefuse } from "../usePaiement";
import { APPARENCE, chargerWhop } from "./whop";

/*
 * Le paiement dans la feuille : là où un écran fait payer (la feuille « Ta formule », l’offre ①, la recharge, les offres
 * de « C’est débloqué »), ce composant pose le bouton qui paie, sans quitter BLUSH. Avec les Elements de Whop : le
 * bouton d’Apple Pay (ou de Google Pay), dessiné par Apple ou Google, quand l’appareil l’a (paymentRequest), et « Payer
 * par carte », qui ouvre la carte de Whop dans sa feuille ; sans portefeuille, un seul bouton ouvre la carte. Le geste
 * donne un jeton de confirmation (ctok_…) : le serveur paie l’achat au prix du catalogue (POST /api/paiement), le
 * navigateur finit une étape s’il en reste une (une 3-D Secure : handleNextAction), puis attend la livraison, que seul le
 * webhook (ou la vérification du serveur) fait. Payé : « C’est payé », puis « C’est débloqué » (un rapport) ou la suite
 * (des bulles). Le moyen de paiement est gardé chez Whop (setupFutureUsage, la ligne qui le dit sous le bouton) : les
 * offres de « C’est débloqué » se paient ensuite en un geste.
 * Le faux Whop (BLUSH_PAIEMENT_FACTICE, en local et dans les tests) a sa carte de test, au même endroit. Sans paiement
 * dans la feuille (pas de Whop, son script qui ne se charge pas, un compte sans email), le bouton d’avant : la page de
 * Whop (usePaiement).
 * Le paywall y suit son tunnel pour /admin (`jalons`, src/lib/jalons.ts) : le bouton touché, la feuille de la carte, le
 * formulaire de Whop affiché (ou Apple Pay ouvert), le paiement envoyé, payé, refusé, ou refermé sans payer. Il sait
 * aussi quand l’acheteur est dans le paiement (`surOuvert`), pour ne pas lui couvrir la carte de son offre ①.
 * TODO(produit): à revoir après le premier vrai paiement (le bouton d’Apple Pay sur askblush.com : le domaine vérifié
 * chez Whop ; la carte gardée après un paiement par Apple Pay).
 */

/** Ce qu’un écran donne pour faire payer une offre. */
type Proprietes = {
  offre: OffreId;
  /** Son prix TTC, en centimes (le catalogue) : celui que montrent le portefeuille et la carte. Le serveur fait payer celui de l’achat. */
  centimes: number;
  /** Ce qu’on paie, en une ligne : sous le total du portefeuille, et au-dessus de la carte (« Premium »). */
  titre: string;
  /** Le bouton qui paie sans portefeuille (il ouvre la carte), et sur la page de Whop : « Débloquer · 14,90 € ». */
  libelle: string;
  /** La ligne de la renonciation sous le bouton : le rapport, ou des bulles ; null pour une offre livrée à son usage (le rapport d’avance), sans renonciation. */
  quoi: AchatImmediat | null;
  /** Où reprendre une fois l’achat livré (une adresse de l’appli). */
  suite?: string | null;
  quand?: QuandRefuse;
  /** Payé (vrai), ou finalement refusé (faux) : l’écran peut s’effacer derrière « C’est payé », qui attend la livraison. */
  surPaye?: (paye: boolean) => void;
  /**
   * Un paiement en route (le jeton, le serveur, l’étape de la banque, puis la livraison attendue) : vrai jusqu’à ce qu’il
   * aboutisse ou revienne au bouton. La feuille qui pose ce composant ne doit pas se fermer pendant ce temps : son
   * contenu démonté arrêterait le suivi d’un paiement peut-être débité.
   */
  surOccupe?: (occupe: boolean) => void;
  /**
   * L’acheteur est dans le paiement (vrai) : la feuille de la carte ouverte (même pas encore remplie), le portefeuille
   * montré, ou un paiement en route ; puis il en est sorti (faux). Le paywall y retient son offre ① : elle ne vient pas
   * couvrir la carte qu’on est en train de remplir.
   */
  surOuvert?: (ouvert: boolean) => void;
  /** Livré : où mener (sans lui, apresLaLivraison : « C’est débloqué » pour un rapport, la suite pour des bulles). */
  livre?: (e: EtatAchat) => void;
  /** La flèche du bouton principal, comme celui qu’il remplace. */
  fleche?: boolean;
  /**
   * Sans la ligne de la carte gardée sous le portefeuille (le paywall, décidé le 16 octobre) : la feuille de la carte la
   * dit toujours avant son bouton, et les conditions aussi.
   */
  sansCarteGardee?: boolean;
  /** Les jalons du tunnel d’/admin (src/lib/jalons.ts), du bouton touché à l’issue du paiement : seulement le paywall. */
  jalons?: boolean;
  /** La carte du chat d’où ce paiement part (src/server/vente.ts), notée avec l’achat pour /admin. */
  vente?: GenreVendu;
  className?: string;
};

/** Un portefeuille que l’appareil sait payer, et le dessin officiel de son bouton (pour une page claire). */
type Portefeuille = { type: "apple_pay" | "google_pay"; art: WalletButtonArt["light"] | null };

/** Pourquoi rien n’est payé, quand l’écran le dit : la banque a dit non, le paiement pas branché, ou le reste. */
type Refus = "carte" | "bientot" | "souci";

/* Les jalons du paiement, seulement là où l’écran les demande (le paywall) */
const jalonSi = (oui: boolean | undefined, ...jalons: Jalon[]) => {
  if (oui) for (const j of jalons) marquerJalon(j);
};
/* Le bouton qui paie touché (avec Premium choisie, elle aussi), et ce qu’il ouvre */
const jalonsDuBouton = (p: Pick<Proprietes, "jalons" | "offre">, ouvre: Jalon) => jalonSi(p.jalons, "payer", ...(p.offre === "premium" ? (["payer_premium"] as const) : []), ouvre);

/** L’erreur d’une feuille fermée par l’acheteur (le portefeuille, la fenêtre de PayPal) : une annulation, pas un refus. */
const estAnnule = (e: unknown) => e instanceof Error && e.message === "payment_request_cancelled";

/** Dit à l’écran (surOuvert) si l’acheteur est dans le paiement, et qu’il n’y est plus quand ce composant part. */
function useOuvert(ouvert: boolean, surOuvert: Proprietes["surOuvert"]) {
  const actuel = useRef(surOuvert);
  useEffect(() => {
    actuel.current = surOuvert;
  });
  useEffect(() => {
    actuel.current?.(ouvert);
    return () => actuel.current?.(false);
  }, [ouvert]);
}

/** Le bouton qui paie, dans la feuille quand c’est possible, sinon sur la page de Whop. Voir l’en-tête du fichier. */
export function PayerDansLaFeuille(p: Proprietes) {
  const feuille = useFeuilleDuPaiement();
  const email = useCompte().data?.email ?? null;
  /* Le script de Whop qui ne se charge pas (le réseau, un bloqueur) : la page de Whop, pour toute la visite */
  const [sansWhop, setSansWhop] = useState(false);
  const mode = feuille.data?.paiement;
  if (mode?.mode === "factice" && email) return <AvecLeFauxWhop {...p} />;
  if (mode?.mode === "whop" && email && !sansWhop)
    return (
      <WhopElements
        elements={chargerWhop()}
        locale="fr"
        environment={mode.bacASable ? "sandbox" : "production"}
        appearance={APPARENCE}
        toasts={false}
        skipPixel
        onLoadError={() => setSansWhop(true)}
      >
        <AvecWhop {...p} compte={mode.compte} email={email} />
      </WhopElements>
    );
  return <SurLaPageDeWhop {...p} />;
}

/* ———— Le parcours, commun aux Elements et au faux Whop ———— */

/**
 * Le parcours d’un paiement dans la feuille, d’un jeton à la livraison : `payer(jeton)` (une promesse du jeton, que le
 * portefeuille ou la carte donne ; null : annulé), le serveur qui paie, l’étape que la banque demande (`finirEtape`, par
 * la clé du paiement : « parti » si la page s’en va pour elle, « refuse » si elle n’est pas passée), puis la livraison.
 * La renonciation est vérifiée avant le geste (elle ne se périme que si le serveur refuse sa version).
 */
function useParcours({
  offre,
  quoi,
  suite,
  quand = {},
  surPaye,
  surOccupe,
  livre,
  jalons,
  vente,
  finirEtape,
}: Pick<Proprietes, "offre" | "quoi" | "suite" | "quand" | "surPaye" | "surOccupe" | "livre" | "jalons" | "vente"> & {
  finirEtape: (secret: string) => Promise<"ok" | "parti" | "refuse">;
}) {
  const router = useRouter();
  const renonciation = useAccord();
  const [etat, setEtat] = useState<"pret" | "envoi" | "paye">("pret");
  const [refus, setRefus] = useState<Refus | null>(null);
  /* L’écran parti : on cesse d’attendre la livraison */
  const fin = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fin.current = c;
    return () => c.abort();
  }, []);
  /* L’écran sait qu’un paiement est en route (surOccupe), et qu’il ne l’est plus quand ce composant part */
  const surOccupeActuel = useRef(surOccupe);
  useEffect(() => {
    surOccupeActuel.current = surOccupe;
  });
  useEffect(() => {
    surOccupeActuel.current?.(etat !== "pret");
    return () => surOccupeActuel.current?.(false);
  }, [etat]);

  const revenir = (r: Refus | null) => {
    if (r === "carte") jalonSi(jalons, "refuse");
    setEtat("pret");
    setRefus(r);
    surPaye?.(false);
  };

  /** « C’est payé », puis la livraison attendue (le webhook, ou la vérification du serveur avec le paiement de Whop), puis la suite. */
  const suivreLaLivraison = async (achat: string, paiement: string | null) => {
    jalonSi(jalons, "paye");
    setEtat("paye");
    surPaye?.(true);
    const signal = fin.current?.signal;
    const e = await attendreLaLivraison(achat, paiement, { signal });
    if (signal?.aborted) return;
    if (e === "echoue") return revenir("carte");
    /* La livraison tarde : la page du retour attend plus longtemps, et le dit */
    if (e === null) return router.replace(versLeRetour(achat, paiement));
    apresDeblocage();
    if (livre) livre(e);
    else router.replace(apresLaLivraison(e));
  };

  /*
   * Parti finir une étape de la banque hors de la page (une 3-D Secure par redirection), puis revenu par « Retour » : le
   * navigateur rend la page telle qu’il l’avait gardée (bfcache), bouton occupé compris, et la feuille refuserait de se
   * fermer (UIX-2). Au retour, on relit l’achat une fois : payé, on suit sa livraison ; sinon, le bouton se libère (un
   * paiement fini plus tard est livré par son webhook).
   */
  const parti = useRef<{ achat: string; paiement: string | null } | null>(null);
  useEffect(() => {
    const retour = (ev: PageTransitionEvent) => {
      const p = parti.current;
      if (!ev.persisted || !p) return;
      parti.current = null;
      etatDuPaiement(p.achat, p.paiement).then(
        (e) => (e.statut === "paye" ? void suivreLaLivraison(p.achat, p.paiement) : revenir(null)),
        () => revenir(null),
      );
    };
    window.addEventListener("pageshow", retour);
    return () => window.removeEventListener("pageshow", retour);
  });

  const payer = async (jeton: Promise<string | null>) => {
    setEtat("envoi");
    setRefus(null);
    try {
      const j = await jeton;
      /* Le portefeuille (ou la fenêtre de la banque) refermé sans payer */
      if (!j) {
        jalonSi(jalons, "ferme");
        return revenir(null);
      }
      jalonSi(jalons, "envoye");
      /* La renonciation part avec le geste, sauf pour une offre livrée à son usage */
      const r = await commencerPaiement(offre, quoi !== null, vente ? { jeton: j, vente } : { jeton: j });
      noterLaSuite(r.achat, suite);
      const p = r.paiement;
      /* Whop n’a pas dit si le paiement est parti (aVerifier, côté serveur) : la page du retour attend son webhook, et le dit */
      if (!p) return router.replace(versLeRetour(r.achat, null));
      if (p.statut !== "paid" && p.secret) {
        /* Noté avant : la banque peut quitter la page pendant l’étape (« parti »), et le retour doit savoir quoi relire */
        parti.current = { achat: r.achat, paiement: p.id };
        const issue = await finirEtape(p.secret);
        if (issue === "parti") return;
        parti.current = null;
        if (issue === "refuse") return revenir("carte");
      }
      await suivreLaLivraison(r.achat, p.id);
    } catch (e) {
      const code = codeDe(e);
      revenir(null);
      if (code === "renonciation") renonciation.perimer();
      else if (code === "carte" || code === "bientot") {
        if (code === "carte") jalonSi(jalons, "refuse");
        setRefus(code);
      } else if (code === "deja" && quand.deja) {
        /* Un autre onglet l’a déjà payé : le rapport et le compte se relisent, rien n’est à payer */
        apresDeblocage();
        router.refresh();
        quand.deja();
      } else if (code === "offre" && quand.offre) quand.offre();
      else {
        setRefus("souci");
        /* Pas une réponse de notre serveur (le portefeuille ou la carte de Whop qui échoue, le réseau) : l’équipe le voit dans la santé d’/admin */
        if (!code) signalerErreur(e, "paiement dans la feuille");
      }
    }
  };

  return { renonciation, etat, refus, payer, occupe: etat !== "pret" };
}

type Parcours = ReturnType<typeof useParcours>;

/** Ce qu’on dit quand rien n’est payé. */
function LeRefus({ refus }: { refus: Refus | null }) {
  if (refus === "bientot")
    return (
      <p role="status" className="m-0 text-center text-note font-extrabold leading-[1.45] text-soft">
        {FEUILLE_FORMULE.bientot}
      </p>
    );
  if (!refus) return null;
  return <Alert className="text-center leading-[1.45]">{refus === "carte" ? DANS_LA_FEUILLE.carteRefusee : FEUILLE_FORMULE.souci}</Alert>;
}

/** « C’est payé », à la place des boutons, le temps que la livraison arrive. */
function CestPaye({ offre }: { offre: OffreId }) {
  return (
    <div role="status" className="flex flex-col items-center gap-1.5 py-4 text-center">
      <CheckBurst size={72} pop />
      <p className="m-0 mt-2 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">{DANS_LA_FEUILLE.paye.titre}</p>
      <p className="m-0 flex items-center gap-2 text-corps font-extrabold text-soft">
        {offre === "second" || offre.startsWith("pack") || offre === "premium_ajout" ? DANS_LA_FEUILLE.paye.bulles : DANS_LA_FEUILLE.paye.rapport}
        <TypingDots />
      </p>
    </div>
  );
}

/**
 * Les boutons, une fois prêts : celui du portefeuille et « Payer par carte » (`portefeuille`), ou un seul, qui ouvre la
 * carte ; dessous, la renonciation, et, sous le portefeuille qui paie d’un geste, la carte gardée (la feuille de la carte
 * le dit avant son propre bouton).
 */
function Boutons({
  p,
  parcours,
  portefeuille,
  payerAvecLePortefeuille,
  ouvrirLaCarte,
}: {
  p: Proprietes;
  parcours: Parcours;
  portefeuille: Portefeuille | null;
  payerAvecLePortefeuille: () => void;
  ouvrirLaCarte: () => void;
}) {
  if (parcours.etat === "paye") return <CestPaye offre={p.offre} />;
  return (
    <div className={cn("flex flex-col gap-2", p.className)}>
      <LeRefus refus={parcours.refus} />
      {portefeuille ? (
        <>
          <BoutonDuPortefeuille portefeuille={portefeuille} occupe={parcours.occupe} onClick={payerAvecLePortefeuille} />
          <button
            type="button"
            onClick={ouvrirLaCarte}
            disabled={parcours.occupe}
            className="mx-auto flex h-9 items-center gap-2 rounded-full px-3 text-note font-black text-ink disabled:opacity-50"
          >
            <Icon name="lock" size={15} stroke={2.4} className="text-soft" />
            {DANS_LA_FEUILLE.avecCarte}
            <Icon name="chevron" size={13} stroke={2.8} className="text-soft" />
          </button>
        </>
      ) : (
        <Button arrow={p.fleche} loading={parcours.occupe} loadingLabel="Paiement en cours" onClick={ouvrirLaCarte} aria-haspopup="dialog">
          {p.libelle}
        </Button>
      )}
      {p.quoi && <MentionRenonciation quoi={p.quoi} etat={parcours.renonciation} />}
      {portefeuille && !p.sansCarteGardee && <p className="m-0 text-center text-micro font-extrabold leading-[1.45] text-pale">{DANS_LA_FEUILLE.garder}</p>}
    </div>
  );
}

/**
 * Le bouton du portefeuille, au dessin officiel d’Apple ou de Google (celui que Whop donne : leurs règles l’exigent), à
 * la hauteur de nos boutons. Ce dessin est un bouton entier (380 × 44, son fond et ses coins compris) : il couvre le
 * nôtre, à sa hauteur, ses bords de fond rognés, le logo aux proportions que son dessin lui donne. Sans dessin, son nom,
 * sur le noir d’Apple.
 */
function BoutonDuPortefeuille({ portefeuille, occupe, onClick }: { portefeuille: Portefeuille; occupe: boolean; onClick: () => void }) {
  const nom = DANS_LA_FEUILLE.portefeuille[portefeuille.type];
  return (
    <button
      type="button"
      onClick={occupe ? undefined : onClick}
      aria-busy={occupe}
      aria-label={nom}
      style={{ background: portefeuille.art?.color ?? "#000000" }}
      className="lift lift-ink flex h-[60px] w-full items-center justify-center overflow-hidden rounded-[30px] text-white shadow-ink"
    >
      {occupe ? (
        <TypingDots color="#FFFFFF" />
      ) : portefeuille.art ? (
        /* Le dessin officiel, tel quel : une image servie par Whop (Apple et Google en fixent la forme) */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={portefeuille.art.image} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-carte font-black">{nom}</span>
      )}
    </button>
  );
}

/** La feuille de la carte : son titre (et le retour), ce qu’on paie et son prix, puis la carte (`children`). */
function FeuilleDeLaCarte({ open, onClose, titre, centimes, children }: { open: boolean; onClose: () => void; titre: string; centimes: number; children: ReactNode }) {
  const id = useId();
  return (
    <Sheet open={open} onClose={onClose} labelledBy={id} belowHeader={false}>
      <div className="flex items-center gap-2.5">
        <IconButton icon="back" label="Revenir" size="sm" variant="doux" onClick={onClose} />
        <h2 id={id} className="m-0 text-[24px] font-black leading-[1.05] tracking-[-0.02em]">
          {DANS_LA_FEUILLE.carte.titre}
        </h2>
      </div>
      <p className="m-0 flex items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3 shadow-soft">
        <span className="text-detail font-black">{titre}</span>
        <span className="text-carte font-black">{enEuros(centimes)}</span>
      </p>
      {children}
    </Sheet>
  );
}

/* ———— Avec les Elements de Whop ———— */

/** Le paiement par les Elements de Whop : le portefeuille de l’appareil s’il en a un, et la carte. */
function AvecWhop({ compte, email, ...p }: Proprietes & { compte: string; email: string }) {
  const whop = useWhop();
  const [carte, setCarte] = useState(false);
  const [portefeuille, setPortefeuille] = useState<Portefeuille | null>(null);
  const demande = useRef<PaymentRequestResource | null>(null);
  /* Le prix et la ligne d’aujourd’hui, lus quand la demande se crée (cet effet passe avant le sien) ; ensuite, elle les suit (update) */
  const montant = useRef({ centimes: p.centimes, titre: p.titre });
  useEffect(() => {
    montant.current = { centimes: p.centimes, titre: p.titre };
  });

  const parcours = useParcours({
    ...p,
    finirEtape: async (secret) => {
      if (!whop) return "refuse";
      const r = await whop.payments.handleNextAction({ clientSecret: secret });
      if (r.redirected) return "parti";
      /* « processing » : la banque décide encore, la livraison le dira ; le reste (le dialogue fermé, un refus) n’est pas payé */
      return r.status === "succeeded" || r.status === "processing" ? "ok" : "refuse";
    },
  });
  /* Dans le paiement : la carte ouverte, ou le portefeuille montré (il met le parcours en route dès le geste) */
  useOuvert(carte || parcours.occupe, p.surOuvert);

  /* Le portefeuille de cet appareil : demandé une fois le script prêt, et seulement s’il peut payer (le domaine vérifié chez Whop) */
  useEffect(() => {
    if (!whop) return;
    const { centimes, titre } = montant.current;
    const d = whop.payments.paymentRequest.create({
      accountId: compte,
      currency: "eur",
      amount: centimes,
      setupFutureUsage: "on_session",
      lineItems: [{ label: titre, amount: centimes }],
    });
    demande.current = d;
    let vivant = true;
    d.canMakePayment({ types: ["apple_pay", "google_pay"] }).then(
      (dispo) => {
        if (!vivant) return;
        const type = dispo.applePay ? "apple_pay" : dispo.googlePay ? "google_pay" : null;
        setPortefeuille(type ? { type, art: dispo.wallets?.[type]?.button?.light ?? null } : null);
      },
      () => vivant && setPortefeuille(null),
    );
    return () => {
      vivant = false;
      demande.current = null;
    };
  }, [whop, compte]);
  /* Une autre formule choisie : le portefeuille montre son prix */
  useEffect(() => {
    demande.current?.update({ amount: p.centimes, lineItems: [{ label: p.titre, amount: p.centimes }] });
  }, [p.centimes, p.titre]);

  /* Le portefeuille s’ouvre tout de suite, dans le geste (Apple le refuse après une attente), puis le jeton part au serveur */
  const payerAvecLePortefeuille = () => {
    const d = demande.current;
    if (!d || !portefeuille || !parcours.renonciation.exiger()) return;
    jalonsDuBouton(p, "whop");
    const jeton = d.show(portefeuille.type, { email }).then(
      (r) => r.ctok,
      (e: unknown) => {
        if (estAnnule(e)) return null;
        throw e;
      },
    );
    void parcours.payer(jeton);
  };

  const ouvrirLaCarte = () => {
    jalonsDuBouton(p, "carte");
    setCarte(true);
  };
  /* Refermée sans payer (pas pendant un paiement en route : la feuille reste alors ouverte d’elle-même) */
  const refermerLaCarte = () => {
    if (!parcours.occupe) jalonSi(p.jalons, "ferme");
    setCarte(false);
  };

  return (
    <>
      <Boutons p={p} parcours={parcours} portefeuille={portefeuille} payerAvecLePortefeuille={payerAvecLePortefeuille} ouvrirLaCarte={ouvrirLaCarte} />
      <FeuilleDeLaCarte open={carte && parcours.etat !== "paye"} onClose={refermerLaCarte} titre={p.titre} centimes={p.centimes}>
        <Payments accountId={compte} currency="eur" amount={p.centimes} setupFutureUsage="on_session" analytics={false}>
          <CarteDeWhop email={email} quoi={p.quoi} centimes={p.centimes} parcours={parcours} jalons={p.jalons} />
        </Payments>
      </FeuilleDeLaCarte>
    </>
  );
}

/**
 * La carte de Whop (PaymentElement : ses champs dans ses cadres, sans Apple Pay ni Google Pay, que le bouton du
 * portefeuille montre déjà), la mention de Whop vendeur en titre (BrandingElement : sans elle, rien ne se paie), et
 * notre bouton, prêt quand la carte est complète. Affichée (onReady) : le jalon « whop » du paywall.
 */
function CarteDeWhop({
  email,
  quoi,
  centimes,
  parcours,
  jalons,
}: {
  email: string;
  quoi: AchatImmediat | null;
  centimes: number;
  parcours: Parcours;
  jalons: boolean | undefined;
}) {
  const payments = usePayments();
  const [complete, setComplete] = useState(false);
  const payer = () => {
    if (!payments || !parcours.renonciation.exiger()) return;
    const jeton = payments.createConfirmationToken({ billingDetails: { email } }).then(
      (r) => r.confirmationToken,
      (e: unknown) => {
        if (estAnnule(e)) return null;
        throw e;
      },
    );
    void parcours.payer(jeton);
  };
  return (
    <>
      <PaymentElement
        wallets={{ applePay: "never", googlePay: "never" }}
        onChange={(e) => setComplete(e.complete)}
        onReady={() => jalonSi(jalons, "whop")}
        /* La carte qui ne se charge pas (Whop la remplace par son message d’erreur) : l’équipe le voit dans la santé d’/admin */
        onError={(e) => signalerErreur(new Error(`${e.code ?? "sans code"} · ${e.message}`), "carte de Whop")}
      />
      <BrandingElement />
      <div className="flex flex-col gap-2 lg:w-[400px] lg:self-center">
        <LeRefus refus={parcours.refus} />
        <Button icon="lock" disabled={!complete || !payments} loading={parcours.occupe} loadingLabel="Paiement en cours" onClick={payer}>
          {DANS_LA_FEUILLE.carte.payer(enEuros(centimes))}
        </Button>
        {quoi && <MentionRenonciation quoi={quoi} etat={parcours.renonciation} />}
        <p className="m-0 text-center text-micro font-extrabold leading-[1.45] text-pale">{DANS_LA_FEUILLE.garder}</p>
      </div>
    </>
  );
}

/* ———— Avec le faux Whop (en local, et dans les tests) ———— */

/** Le faux Whop : pas de portefeuille, et sa carte de test, qui paie (ou refuse, pour voir) par un jeton qu’il reconnaît. */
function AvecLeFauxWhop(p: Proprietes) {
  const [carte, setCarte] = useState(false);
  const parcours = useParcours({ ...p, finirEtape: async () => "ok" });
  useOuvert(carte || parcours.occupe, p.surOuvert);
  const payer = (issue: "payer" | "refuser") => {
    if (!parcours.renonciation.exiger()) return;
    void parcours.payer(Promise.resolve(`ctok_faux_${issue}`));
  };
  /* Sa carte de test s’affiche d’un coup : la feuille ouverte, le formulaire est là */
  const ouvrirLaCarte = () => {
    jalonsDuBouton(p, "carte");
    jalonSi(p.jalons, "whop");
    setCarte(true);
  };
  const refermerLaCarte = () => {
    if (!parcours.occupe) jalonSi(p.jalons, "ferme");
    setCarte(false);
  };
  return (
    <>
      <Boutons p={p} parcours={parcours} portefeuille={null} payerAvecLePortefeuille={() => {}} ouvrirLaCarte={ouvrirLaCarte} />
      <FeuilleDeLaCarte open={carte && parcours.etat !== "paye"} onClose={refermerLaCarte} titre={p.titre} centimes={p.centimes}>
        <p className="m-0 flex items-center gap-3 rounded-[18px] bg-white px-4 py-4 text-corps font-extrabold text-soft shadow-soft [font-variant-numeric:tabular-nums]">
          <Icon name="lock" size={16} stroke={2.4} className="text-soft" />
          4242 4242 4242 4242 · 12/34 · 123
        </p>
        <p className="m-0 text-center text-micro font-extrabold text-grey">{DANS_LA_FEUILLE.carte.test}</p>
        <div className="flex flex-col gap-2 lg:w-[400px] lg:self-center">
          <LeRefus refus={parcours.refus} />
          <Button icon="lock" loading={parcours.occupe} loadingLabel="Paiement en cours" onClick={() => payer("payer")}>
            {DANS_LA_FEUILLE.carte.payer(enEuros(p.centimes))}
          </Button>
          <Button variant="link" disabled={parcours.occupe} onClick={() => payer("refuser")}>
            {DANS_LA_FEUILLE.carte.refuser}
          </Button>
          {p.quoi && <MentionRenonciation quoi={p.quoi} etat={parcours.renonciation} />}
        </div>
      </FeuilleDeLaCarte>
    </>
  );
}

/* ———— Sans paiement dans la feuille : la page de Whop ———— */

/** Le bouton d’avant : il part payer sur la page de Whop (ou dit « bientôt » sans paiement branché). */
function SurLaPageDeWhop({ offre, libelle, quoi, suite, quand, fleche, jalons, vente, surOuvert, className }: Proprietes) {
  const paiement = usePaiement({ suite, quand, ...(vente ? { vente } : {}) });
  useOuvert(paiement.occupe, surOuvert);
  const payer = () => {
    jalonsDuBouton({ jalons, offre }, "page_whop");
    void paiement.payer(offre);
  };
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <LeRefus refus={paiement.refus} />
      <Button arrow={fleche} loading={paiement.occupe} loadingLabel="Paiement en cours" onClick={payer}>
        {libelle}
      </Button>
      {quoi && <MentionRenonciation quoi={quoi} etat={paiement.renonciation} />}
    </div>
  );
}
