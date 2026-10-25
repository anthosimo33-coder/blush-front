"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CATALOGUE, DUREE_GARDE_MS, livreeAuPaiement, RAPPORT_D_AVANCE, RAPPORTS_SEULS } from "@/contenu/offres";
import { DANS_LA_FEUILLE, DEBLOQUE, OFFRE_GARDE, OFFRE_PREMIUM_AJOUT, OFFRE_SECOND } from "@/contenu/paiement";
import { jourEnLettres } from "@/lib/format";
import { codeDe } from "@/lib/messages-erreur";
import { delai } from "@/lib/motion";
import { cheminDe } from "@/lib/navigation";
import { attendreLaLivraison, noterLaSuite, useLibererAuRetour, versLeRetour } from "@/lib/paiement";
import { apresDeblocage } from "@/lib/requetes";
import { useSoundOnce } from "@/lib/sound";
import { commencerPaiement, proposerOffreUnique } from "@/services/api";
import { BubbleLogo, CheckBurst } from "@/components/brand/objects3d";
import { Grappe, Perle, Rangee } from "@/components/bulles/perles";
import { MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { Billet, PetitBillet } from "@/components/paiement/Billet";
import { PayerDansLaFeuille } from "@/components/paiement/integre/PayerDansLaFeuille";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Toast } from "@/components/ui/surfaces";
import { Screen } from "@/components/shell/Screen";
import type { OffreId, OffreProposee } from "@/types";
import type { EtatAchat } from "@/types/api";
import { ancreDuChapitre } from "../ancres";

/*
 * « C’est débloqué » : un moment, pas une facture, puis une offre, et son repli si elle est refusée (décidé le 13
 * octobre ; le serveur les montre, chacune une fois par compte, juste après le paiement : src/server/offres-uniques.ts).
 * - Après Premium : ⑤ le 2e rapport à −50 % (un rapport d’avance, sur un billet), puis, refusée, ⑥ le −50 % gardé 7
 *   jours pour la conv suivante (« Garde-le-moi », rien à payer).
 * - Après le rapport seul (la suite ①, le −50 % gardé) : ③ Premium pour 6,90 € de plus, puis, refusée, ⑤ le 2e rapport.
 * - Après un rapport d’avance utilisé : rien, la liste.
 * Une offre prise ne mène à aucune autre. Elles se paient en un geste avec la carte gardée du paiement d’avant, sans
 * quitter la page (le serveur paie, la page attend la livraison) ; sans carte gardée, dans la feuille (PayerDansLaFeuille).
 * Sur un écran court (375 × 667), l’en-tête se resserre pour que l’offre tienne sans défiler.
 */

/** Les perles posées devant les bulles reçues, dans l’offre ③ : une par bulle reçue, jusqu’à une rangée de ce nombre (jamais plus de perles que le chiffre à côté). */
const PERLES_RECUES = 5;
/** Le temps de voir le tampon « À toi » sur le billet, avant la liste. */
const TAMPON_MS = 1_500;
/** Le temps d’un toast. */
const TOAST_MS = 2_600;

/** L’offre montrée, et si elle se paie en un geste (une carte gardée) ; ⑥ ne se paie pas, et dit jusqu’à quand elle garderait le −50 % (une date ISO). */
type Montree = { offre: "premium_ajout" | "second_rapport"; enUnGeste: boolean } | { offre: "garde_second"; fin: string };

/** Ce que la page a reçu, à dire dans sa liste : les bulles, le rapport d’avance pris (sa fin), le −50 % gardé (sa fin). */
type Recu = { bulles: number; avance: string | null; garde: string | null };

/** La première offre de la page, selon ce qui vient d’être payé ; null : aucune. */
const premiereOffre = (offre: OffreId): "premium_ajout" | "second_rapport" | null =>
  offre === "premium" ? "second_rapport" : (RAPPORTS_SEULS as readonly OffreId[]).includes(offre) ? "premium_ajout" : null;

/** Une offre de la page demandée au serveur, pour l’achat qui vient d’être payé : montrée, ou null. */
async function demander(offre: "premium_ajout" | "second_rapport", achat: string): Promise<Montree | null> {
  try {
    const o = await proposerOffreUnique(offre, achat);
    return o.offre === offre ? { offre, enUnGeste: o.enUnGeste } : null;
  } catch {
    return null;
  }
}

/**
 * Payer une offre de la page en un geste, sans la quitter : le serveur paie avec la carte gardée (POST /api/paiement),
 * puis la page attend la livraison. La banque qui demande une confirmation (une 3-D Secure), ou Whop qui préfère sa page :
 * on y part, et le retour ramène ici (`ici`). Rend l’achat livré, ou null (parti, ou pas payé : `refus` le dit).
 */
function useEnUnGeste({ ici, passee }: { ici: string; passee: () => void }) {
  const router = useRouter();
  const renonciation = useAccord();
  const [occupe, setOccupe] = useState(false);
  const [refus, setRefus] = useState<"carte" | "souci" | null>(null);
  /* Revenu de la page de Whop (ou de la confirmation de la banque) par « Retour » : le bouton se libère */
  useLibererAuRetour(useCallback(() => setOccupe(false), []));
  const payer = async (offre: OffreId): Promise<EtatAchat | null> => {
    if (!renonciation.exiger()) return null;
    setOccupe(true);
    setRefus(null);
    /* Parti vers une autre page : le bouton reste occupé jusqu’au départ, un second toucher paierait deux fois (UIQ-1) */
    let parti = false;
    try {
      /* La renonciation part avec le geste, sauf pour le rapport d’avance, livré à son usage */
      const r = await commencerPaiement(offre, livreeAuPaiement(offre));
      noterLaSuite(r.achat, ici);
      if (r.url) {
        parti = true;
        /* La page de Whop est un autre site ; le faux Whop, une page de l’appli */
        if (/^https?:\/\//.test(r.url)) window.location.assign(r.url);
        else router.push(r.url as Route);
        return null;
      }
      /* Le paiement créé, quand le serveur le donne : vérifié chez Whop si le webhook tarde (ARG-3) */
      const paiement = r.paiement?.id ?? null;
      const e = await attendreLaLivraison(r.achat, paiement);
      if (e === "echoue") setRefus("carte");
      else if (e === null) {
        parti = true;
        router.replace(versLeRetour(r.achat, paiement));
      } else apresDeblocage();
      return typeof e === "object" && e ? e : null;
    } catch (e) {
      const code = codeDe(e);
      if (code === "renonciation") renonciation.perimer();
      /* Plus vendue (prise dans un autre onglet, ou passée) : elle s’efface, sans parler d’un souci de connexion */
      else if (code === "offre") passee();
      else setRefus("souci");
      return null;
    } finally {
      if (!parti) setOccupe(false);
    }
  };
  return { renonciation, occupe, refus, payer };
}

/** La carte d’une offre : blanche, cerclée de rose (plus doux pour un repli), qui se lève en arrivant. */
function CarteOffre({ titre, douce = false, children }: { titre: string; douce?: boolean; children: ReactNode }) {
  return (
    <section
      aria-labelledby={titre}
      data-rise=""
      style={delai(0.3)}
      className={cn(
        "mt-5 flex w-full flex-col gap-2.5 rounded-[24px] bg-white p-[18px] text-left [@media(max-height:700px)]:mt-3.5 [@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:p-4",
        douce
          ? "shadow-[inset_0_0_0_1.5px_rgba(232,53,138,0.35),0_22px_40px_-24px_rgba(200,29,107,0.45)]"
          : "shadow-[inset_0_0_0_2px_#E8358A,0_22px_40px_-20px_rgba(200,29,107,0.5)]",
      )}
    >
      {children}
    </section>
  );
}

/** Le badge d’une offre unique, en haut de sa carte. */
function Badge({ children }: { children: ReactNode }) {
  return <span className="self-start rounded-full bg-[#FFE6F2] px-3 py-1 text-micro font-black uppercase tracking-[0.08em] text-elle-ink">{children}</span>;
}

/** « Ta carte est enregistrée : un geste et c’est fait. » */
function UnGeste() {
  return (
    <span className="flex items-center gap-2 text-legende font-extrabold text-soft">
      <Icon name="lock" size={15} stroke={2.4} className="shrink-0 text-soft" />
      {OFFRE_PREMIUM_AJOUT.carte}
    </span>
  );
}

/**
 * Le bouton qui prend une offre payante : en un geste (`enUnGeste` : la carte gardée), sinon dans la feuille. `livre` :
 * l’achat livré (la page le dit sans se quitter).
 */
function Prendre({
  offre,
  libelle,
  quoi,
  enUnGeste,
  geste,
  ici,
  livre,
  paye,
}: {
  offre: OffreId;
  libelle: string;
  /** La ligne de la renonciation sous le bouton ; null pour le rapport d’avance (livré à son usage : rien à quoi renoncer). */
  quoi: "bulles" | "rapport" | null;
  enUnGeste: boolean;
  geste: ReturnType<typeof useEnUnGeste>;
  ici: string;
  livre: (e: EtatAchat) => void;
  paye?: boolean;
}) {
  if (!enUnGeste)
    return <PayerDansLaFeuille offre={offre} centimes={CATALOGUE[offre].centimes} titre={CATALOGUE[offre].titre} libelle={libelle} quoi={quoi} suite={ici} livre={livre} />;
  return (
    <>
      <UnGeste />
      {geste.refus && <Alert className="text-center leading-[1.45]">{geste.refus === "carte" ? DANS_LA_FEUILLE.carteRefusee : OFFRE_PREMIUM_AJOUT.souci}</Alert>}
      <Button
        icon={paye ? "check" : undefined}
        loading={geste.occupe}
        loadingLabel="Paiement en cours"
        onClick={() =>
          void (async () => {
            if (paye) return;
            const e = await geste.payer(offre);
            if (e) livre(e);
          })()
        }
      >
        {paye ? OFFRE_SECOND.pris : libelle}
      </Button>
      {quoi && <MentionRenonciation quoi={quoi} etat={geste.renonciation} />}
    </>
  );
}

/** BLUSH qui relance, sa petite bulle rose penchée (comme l’offre ①) : le repli parle comme lui. */
function BlushRelance({ bulle }: { bulle: string }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-3">
      <BubbleLogo size={44} />
      <span className="rotate-[-4deg] rounded-[14px] rounded-bl-[5px] bg-[linear-gradient(160deg,#FF9BCB,#E8358A)] px-2.5 py-1 font-sans text-note font-bold text-white shadow-[0_10px_20px_-10px_rgba(232,53,138,0.8)]">
        {bulle}
      </span>
    </span>
  );
}

export function EcranDebloque({
  achat,
  offre,
  bulles,
  next,
  restants,
  total,
  reprise,
}: {
  /** L’achat payé (`?achat=`), son offre, et les bulles reçues avec lui (celles de l’offre ③ prise juste après comprises). */
  achat: string;
  offre: OffreId;
  bulles: number;
  next: Route | null;
  /** Les chapitres qui restaient à lire, et le premier d’entre eux (où la lecture reprend). */
  restants: number;
  /** Les chapitres du rapport, offerts compris : ceux qu’il a vraiment (un rapport écrit peut en avoir moins de huit). */
  total: number;
  reprise: number;
}) {
  const titre = useId();
  /* Le seul son qui suit un achat : la serrure, puis la signature sur un accord ouvert */
  useSoundOnce("debloque");
  /* Ce qui vient de s’ouvrir : relu ici, une fois le paiement parti (pas sous la feuille, où le rapport sautait) */
  useEffect(() => apresDeblocage(), []);

  const premiere = premiereOffre(offre);
  /* `undefined` : la réponse du serveur est attendue (rien ne se pose, pour ne pas montrer la liste puis la remplacer) ; null : la liste */
  const [montree, setMontree] = useState<Montree | null | undefined>(premiere ? undefined : null);
  const [recu, setRecu] = useState<Recu>({ bulles, avance: null, garde: null });
  const [tampon, setTampon] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!premiere) return;
    let vivant = true;
    void (async () => {
      /* Après le rapport seul, ③ d’abord ; sans elle (déjà vue un autre jour), ⑤ directement */
      const o = (await demander(premiere, achat)) ?? (premiere === "premium_ajout" ? await demander("second_rapport", achat) : null);
      if (vivant) setMontree(o);
    })();
    return () => {
      vivant = false;
    };
  }, [premiere, achat]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!tampon) return;
    const t = setTimeout(() => {
      setTampon(false);
      setMontree(null);
    }, TAMPON_MS);
    return () => clearTimeout(t);
  }, [tampon]);

  const suite = next ?? `/rapport#${ancreDuChapitre(reprise)}`;
  const ici = `/rapport/debloque?achat=${achat}${next ? `&suite=${encodeURIComponent(next)}` : ""}`;
  /* Vers l’accueil, sans remise en haut : il s’ouvre sur le dernier échange */
  const scroll = cheminDe(suite) !== "/app";
  const geste = useEnUnGeste({ ici, passee: () => setMontree(null) });

  /** L’offre refusée : son repli, s’il y en a un (⑤ après ③ ; ⑥ après ⑤, après Premium), sinon la liste. */
  const refuser = async (o: OffreProposee) => {
    if (o === "premium_ajout") return setMontree(await demander("second_rapport", achat));
    if (o !== "second_rapport" || offre !== "premium") return setMontree(null);
    /* La fin que le serveur donnera s’il le garde maintenant (7 jours), pour la dire avant le geste */
    setMontree({ offre: "garde_second", fin: new Date(Date.now() + DUREE_GARDE_MS).toISOString() });
  };
  /* « Garde-le-moi » : le serveur garde le −50 % (⑥, 7 jours) ; déjà gardé, ou passé : la liste, sans rien de plus */
  const garder = async () => {
    try {
      const o = await proposerOffreUnique("garde_second", achat);
      if (o.offre === "garde_second" && o.fin) {
        setRecu((r) => ({ ...r, garde: o.fin }));
        setToast(OFFRE_GARDE.garde(jourEnLettres(o.fin)));
      }
    } finally {
      setMontree(null);
    }
  };
  /* Une offre payée, livrée : ce qu’elle donne, dit sur la page */
  const livre = (e: EtatAchat) => {
    if (e.offre === "second") {
      setRecu((r) => ({ ...r, avance: new Date(Date.now() + RAPPORT_D_AVANCE.dureeMs).toISOString() }));
      setTampon(true);
      setToast(OFFRE_SECOND.pris);
    } else {
      setRecu((r) => ({ ...r, bulles: r.bulles + e.bulles }));
      setToast(`+${e.bulles} bulles`);
      setMontree(null);
    }
  };

  const vue = !!montree;
  const fin = recu.garde ?? null;
  return (
    <Screen
      mise="colonne"
      mainWidth={560}
      desktopTopPad={0}
      footer={
        montree === null ? (
          <div data-popin="" style={delai(0.5)}>
            <ButtonLink href={suite as Route} scroll={scroll} arrow>
              {next ? DEBLOQUE.continuer : DEBLOQUE.lire}
            </ButtonLink>
          </div>
        ) : undefined
      }
    >
      <div
        className={cn(
          "isolate flex flex-1 flex-col items-center text-center lg:flex-none",
          vue ? "pt-2 lg:pt-[max(16px,calc(50dvh_-_420px))]" : "justify-center pb-4 pt-6 lg:pb-0 lg:pt-[max(16px,calc(50dvh_-_380px))]",
        )}
      >
        <div className={cn("relative flex w-[300px] items-center justify-center", vue ? "h-[76px] [@media(max-height:700px)]:h-[58px]" : "h-[120px]")}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
          />
          <div data-float="">
            <CheckBurst size={vue ? 58 : 88} pop />
          </div>
        </div>
        <h1
          data-rise=""
          style={delai(0.2)}
          className={cn("m-0 font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance]", vue ? "mt-1.5 text-[28px]" : "mt-4 text-[32px]")}
        >
          {DEBLOQUE.titre}
        </h1>
        <p data-rise="" style={delai(0.3)} className="m-0 mt-1.5 max-w-[380px] text-corps font-extrabold leading-[1.4] text-soft [@media(max-height:700px)]:text-detail">
          {DEBLOQUE.phrase(total, recu.bulles)}
        </p>

        {montree?.offre === "second_rapport" && (
          <CarteOffre key="second" titre={titre}>
            <Badge>{OFFRE_SECOND.badge}</Badge>
            <h2 id={titre} className="m-0 text-[24px] font-black leading-[1.08] tracking-[-0.02em] [@media(max-height:700px)]:text-[22px]">
              {OFFRE_SECOND.avant}
              <span className="text-elle-ink">{OFFRE_SECOND.remise}</span>
            </h2>
            <p className="m-0 text-note font-extrabold leading-[1.45] text-grey">{OFFRE_SECOND.texte}</p>
            <Billet tamponne={tampon} />
            <Prendre offre="second" libelle={OFFRE_SECOND.prendre} quoi={null} enUnGeste={montree.enUnGeste} geste={geste} ici={ici} livre={livre} paye={tampon} />
            <span className="flex flex-col items-center">
              {!tampon && (
                <Button variant="link" onClick={() => void refuser("second_rapport")}>
                  {OFFRE_SECOND.non}
                </Button>
              )}
              <span className="text-center text-micro font-extrabold text-grey">{OFFRE_SECOND.pied}</span>
            </span>
          </CarteOffre>
        )}

        {montree?.offre === "premium_ajout" && (
          <CarteOffre key="ajout" titre={titre}>
            <Badge>{OFFRE_PREMIUM_AJOUT.badge}</Badge>
            <h2 id={titre} className="m-0 text-[22px] font-black leading-[1.1] tracking-[-0.02em]">
              {OFFRE_PREMIUM_AJOUT.titre}
            </h2>
            <p className="m-0 text-note font-extrabold leading-[1.45] text-grey">{OFFRE_PREMIUM_AJOUT.texte}</p>
            {/* Les bulles reçues, et celles que ③ ajoute, pour l’œil : le texte au-dessus les dit */}
            <span aria-hidden="true" className="flex items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#FFF2F8,#F6EFFF)] py-3">
              <Rangee pleines={Math.min(PERLES_RECUES, recu.bulles)} taille={13} />
              <span className="text-detail font-black text-soft">{recu.bulles}</span>
              <span className="text-[22px] font-black text-elle-ink">+</span>
              <Grappe taille={40} />
              <span className="text-detail font-black text-elle-ink">{OFFRE_PREMIUM_AJOUT.plus}</span>
            </span>
            <Prendre offre="passe_premium" libelle={OFFRE_PREMIUM_AJOUT.prendre} quoi="bulles" enUnGeste={montree.enUnGeste} geste={geste} ici={ici} livre={livre} />
            <Button variant="link" onClick={() => void refuser("premium_ajout")}>
              {OFFRE_PREMIUM_AJOUT.non}
            </Button>
          </CarteOffre>
        )}

        {montree?.offre === "garde_second" && (
          <CarteOffre key="garde" titre={titre} douce>
            <BlushRelance bulle={OFFRE_GARDE.bulle} />
            <h2 id={titre} className="m-0 text-[22px] font-black leading-[1.1] tracking-[-0.02em]">
              {OFFRE_GARDE.titre}
            </h2>
            <p className="m-0 text-note font-extrabold leading-[1.45] text-grey">{OFFRE_GARDE.texte(jourEnLettres(montree.fin))}</p>
            <Billet
              souche={
                <>
                  <span className="rounded-[7px] bg-elle-ink px-1.5 py-0.5 text-micro font-black text-white">{OFFRE_GARDE.remise}</span>
                  <span className="mt-1 text-micro font-black leading-tight text-soft">{OFFRE_GARDE.jusquau}</span>
                  <span className="text-detail font-black leading-tight">{jourEnLettres(montree.fin, { court: true })}</span>
                </>
              }
            />
            <Button onClick={() => void garder()}>{OFFRE_GARDE.garder}</Button>
            <Button variant="link" onClick={() => void refuser("garde_second")}>
              {OFFRE_GARDE.non}
            </Button>
          </CarteOffre>
        )}

        {montree === null && (
          <div data-rise="" style={delai(0.45)} className="mt-6 w-full text-left">
            <InsetGroup>
              <InsetRow leading={<RowIcon icon="check" tone="vrai" />} title={DEBLOQUE.restants(restants, restants === total)} sub={DEBLOQUE.reprise(reprise)} />
              <InsetRow
                leading={
                  <RowIcon tone="elle">
                    <Perle taille={20} />
                  </RowIcon>
                }
                title={DEBLOQUE.bulles(recu.bulles)}
                sub={DEBLOQUE.bullesSous}
              />
              {recu.avance && (
                <InsetRow
                  leading={
                    <RowIcon tone="elle">
                      <PetitBillet />
                    </RowIcon>
                  }
                  title={DEBLOQUE.avance}
                  sub={DEBLOQUE.avanceSous(jourEnLettres(recu.avance, { annee: true }))}
                />
              )}
              {fin && (
                <InsetRow
                  leading={
                    <RowIcon tone="elle">
                      <PetitBillet />
                    </RowIcon>
                  }
                  title={DEBLOQUE.garde}
                  sub={DEBLOQUE.gardeSous(jourEnLettres(fin))}
                />
              )}
            </InsetGroup>
          </div>
        )}
      </div>
      {toast && <Toast className="fixed inset-x-4 top-3 z-[95] lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{toast}</Toast>}
    </Screen>
  );
}
