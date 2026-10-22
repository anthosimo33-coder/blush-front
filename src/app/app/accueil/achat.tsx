"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { codeDe } from "@/lib/messages-erreur";
import { attendreLaLivraison, noterLaSuite, versLeRetour } from "@/lib/paiement";
import { commencerPaiement, noterUnGesteDeVente, proposerOffreUnique } from "@/services/api";
import { CATALOGUE } from "@/contenu/offres";
import { OFFRE_PREMIUM_AJOUT } from "@/contenu/paiement";
import { lePack, PACK_CONSEILLE, PACKS, type Pack } from "@/contenu/recharge";
import { VENTE_DU_CHAT as T } from "@/contenu/vente-du-chat";
import { Perle } from "@/components/bulles/perles";
import { MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import type { GenreVendu, OffreDuChat, OffreId } from "@/types";

/*
 * L’achat dans le chat (une proposition du 22 octobre 2026) : sous la réponse de BLUSH, la carte que le serveur a choisie
 * (src/server/vente.ts). La recharge et Premium se paient sans quitter la conv : en un geste avec la carte gardée (le même
 * chemin que les offres de « C’est débloqué ») ; sans elle, la feuille de la recharge, ou la page du paiement pour Premium.
 * Une autre conv, le rapport à jour et le réimport mènent à l’import : la conv se lit d’abord, puis se paie sur son
 * paywall. « Pas maintenant » écarte une proposition (elle ne revient pas d’elle-même avant 3 jours).
 */

/** Ce que rend un paiement en un geste : payé, la banque qui dit non, l’offre plus valable, un autre souci, ou la page du paiement ouverte. */
type IssueDuGeste = "paye" | "carte" | "passee" | "souci" | "renonciation" | "parti";

/** Ce que paie le chat. L’aperçu de l’équipe (/apercu/achat) donne le sien, simulé ; l’accueil, celui de useAchatDuChat. */
export type AchatDuChat = {
  /** Paie cette offre en un geste (la carte gardée), depuis la carte de ce genre ; sans carte gardée, la page du paiement s’ouvre. */
  payer: (offre: OffreId, genre: GenreVendu) => Promise<IssueDuGeste>;
  /** Sans carte gardée : la feuille de la recharge, ouverte depuis la carte. */
  recharger: () => void;
  /** Un geste sur une carte (son bouton touché, « Pas maintenant »), compté pour /admin. */
  noter: (evenement: "touchee" | "refusee", genre: GenreVendu) => void;
  /** Le bonus de la première recharge (④) vaut-il pour ce compte ? Le serveur le montre (une offre unique). */
  premiereRecharge: () => Promise<boolean>;
};

/** Le paiement du chat. Sans lui, aucune carte d’achat ne se pose. */
export const AchatDuChatContext = createContext<AchatDuChat | null>(null);

/**
 * Le paiement du chat de l’accueil. `surBulles` : des bulles payées en un geste (une recharge, Premium), livrées : le
 * compteur, et la réponse prête qui se lit. `recharger` : la feuille de la recharge. Le paiement en un geste attend sa
 * livraison sur place ; une étape de la banque, ou une livraison qui tarde, passent par la page du retour, qui revient ici.
 */
export function useAchatDuChat({ surBulles, recharger }: { surBulles: (bulles: number) => void; recharger: () => void }): AchatDuChat {
  const router = useRouter();
  return useMemo(
    () => ({
      payer: async (offre, genre) => {
        try {
          const { achat, url, paiement } = await commencerPaiement(offre, true, { geste: true, vente: genre });
          /* Revenu de la page du retour : l’accueil, qui lit la réponse prête et dit les bulles reçues */
          noterLaSuite(achat, `/app?recharge=${CATALOGUE[offre].bulles}`);
          if (url) {
            if (/^https?:\/\//.test(url)) window.location.assign(url);
            else router.push(url as Route);
            return "parti";
          }
          const e = await attendreLaLivraison(achat, paiement?.id ?? null);
          if (e === "echoue") return "carte";
          if (!e) {
            router.push(versLeRetour(achat, paiement?.id ?? null));
            return "parti";
          }
          surBulles(e.bulles);
          return "paye";
        } catch (e) {
          const code = codeDe(e);
          if (code === "carte") return "carte";
          if (code === "offre") return "passee";
          if (code === "renonciation") return "renonciation";
          return "souci";
        }
      },
      recharger,
      noter: (evenement, genre) => void noterUnGesteDeVente(evenement, genre).catch(() => {}),
      premiereRecharge: () =>
        proposerOffreUnique("premiere_recharge").then(
          (o) => o.offre === "premiere_recharge",
          () => false,
        ),
    }),
    [router, surBulles, recharger],
  );
}

/** Où en est une carte : proposée, en train de payer, payée, ou écartée (« Pas maintenant »). */
type Etape = "proposee" | "occupee" | "payee" | "ecartee";
type Refus = Exclude<IssueDuGeste, "paye" | "parti" | "renonciation">;

/** La largeur d’une carte : celle d’une bulle de BLUSH, moins ce qui l’entoure sur un petit écran. */
const LARGEUR = "flex w-[min(286px,calc(100vw-128px))] flex-col gap-3";

/** La ligne de la carte gardée, sous le bouton : un geste, et c’est payé. */
function UnGeste() {
  return (
    <span className="flex items-center justify-center gap-1.5 text-micro font-extrabold text-soft">
      <Icon name="lock" size={13} stroke={2.6} className="shrink-0" />
      {T.unGeste}
    </span>
  );
}

/** Ce qui est payé, en tête de la carte une fois le geste fait. */
function Paye({ texte }: { texte: string }) {
  return (
    <span className={LARGEUR}>
      <span className="flex items-center gap-2.5" role="status">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-vrai shadow-[0_6px_14px_-6px_rgba(18,192,138,0.9)]">
          <Icon name="check" size={17} stroke={3} className="text-white" />
        </span>
        <span className="text-detail font-black leading-[1.3] text-vrai-ink">{texte}</span>
      </span>
    </span>
  );
}

/** La banque a dit non, l’offre est passée, ou le paiement n’est pas passé : rien n’est débité. */
function LeRefus({ refus }: { refus: Refus }) {
  return (
    <span role="alert" className="rounded-[14px] bg-[#FFF1F1] px-3 py-2 text-legende font-extrabold leading-[1.4] text-danger">
      {T.refus[refus]}
    </span>
  );
}

/** Le surtitre de la carte, et ce qu’elle dit à droite. */
function EnTete({ titre, droite }: { titre: string; droite?: string }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="text-micro font-black uppercase tracking-[0.08em] text-elle-ink">{titre}</span>
      {droite && <span className="text-micro font-extrabold text-grey">{droite}</span>}
    </span>
  );
}

/** « Pas maintenant » : la carte s’efface, et ne revient pas d’elle-même avant 3 jours. */
function PasMaintenant({ ecarter }: { ecarter: () => void }) {
  return (
    <button type="button" onClick={ecarter} className="self-center px-2 py-1 text-legende font-extrabold text-grey underline decoration-[rgba(17,17,20,0.2)] underline-offset-2">
      {T.pasMaintenant}
    </button>
  );
}

/** Payer une offre en un geste depuis une carte : l’étape de la carte, ce qui n’est pas passé, et la renonciation. */
function useGeste(achat: AchatDuChat, genre: GenreVendu) {
  const [etape, setEtape] = useState<Etape>("proposee");
  const [refus, setRefus] = useState<Refus | null>(null);
  const accord = useAccord();
  const payer = (offre: OffreId) => {
    if (!accord.exiger()) return;
    achat.noter("touchee", genre);
    setRefus(null);
    setEtape("occupee");
    void achat.payer(offre, genre).then((issue) => {
      if (issue === "paye") return setEtape("payee");
      /* La page du paiement s’ouvre : le bouton reste occupé jusqu’à ce qu’elle s’en aille */
      if (issue === "parti") return;
      setEtape("proposee");
      if (issue === "renonciation") accord.perimer();
      else setRefus(issue);
    });
  };
  const ecarter = () => {
    achat.noter("refusee", genre);
    setEtape("ecartee");
  };
  return { etape, refus, accord, payer, ecarter };
}

/**
 * La recharge : les trois packs (le conseillé choisi d’avance, le bonus de la première recharge s’il vaut), payés en un
 * geste avec la carte gardée ; sans elle, la feuille de la recharge. À zéro, sa réponse attend juste au-dessus
 * (`attend`) : pas de « Pas maintenant ». L’aperçu de l’équipe montre la réponse prête dans la carte (`reponse`, `envoi`).
 */
function OffreBulles({ offre, achat, attend }: { offre: Extract<OffreDuChat, { genre: "bulles" }>; achat: AchatDuChat; attend: boolean }) {
  const [choisi, setChoisi] = useState<Pack>(PACK_CONSEILLE);
  const [bonus, setBonus] = useState(false);
  const { etape, refus, accord, payer, ecarter } = useGeste(achat, "bulles");
  const bloque = attend || offre.solde <= 0;
  /* Le bonus de la première recharge, demandé une fois, comme la feuille de la recharge (seulement pour payer d’ici) */
  useEffect(() => {
    if (!offre.enUnGeste) return;
    let vivant = true;
    void achat.premiereRecharge().then((oui) => vivant && setBonus(oui));
    return () => {
      vivant = false;
    };
  }, [achat, offre.enUnGeste]);
  const pack = lePack(choisi, bonus);
  if (etape === "ecartee") return null;
  if (etape === "payee")
    return (
      <>
        <Paye texte={T.bulles.paye(pack.total, bloque ? null : Math.max(0, offre.solde) + pack.total)} />
        {offre.reponse && <ReponseLue reponse={offre.reponse} envoi={offre.envoi ?? []} />}
      </>
    );
  return (
    <span className={LARGEUR}>
      {bloque && offre.reponse && <ReponseFloutee />}
      <EnTete titre={bloque ? T.bulles.attend : T.bulles.reste(Math.max(0, offre.solde))} droite={T.bulles.note} />
      {offre.enUnGeste ? (
        <>
          <span role="radiogroup" aria-label={T.bulles.choix} className="grid grid-cols-3 gap-2">
            {PACKS.map((p) => {
              const l = lePack(p, bonus);
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={p === choisi}
                  onClick={() => setChoisi(p)}
                  className={cn(
                    "lift lift-sm relative flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-ink",
                    p === choisi ? "bg-[#FFF0F6] shadow-[inset_0_0_0_2px_var(--color-elle-ink)]" : "bg-plaque",
                  )}
                >
                  <span className="flex items-center gap-1 text-carte font-black">
                    <Perle taille={13} />
                    {l.total}
                  </span>
                  <span className="text-micro font-extrabold text-soft">{l.prix}</span>
                  {p === PACK_CONSEILLE && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-vrai-ink px-1.5 text-[10px] font-black leading-4 text-white">
                      {T.bulles.conseille}
                    </span>
                  )}
                </button>
              );
            })}
          </span>
          {refus && <LeRefus refus={refus} />}
          <Button size="md" loading={etape === "occupee"} loadingLabel={T.enCours} onClick={() => payer(choisi)}>
            {T.bulles.recharger(pack.prix)}
          </Button>
          <UnGeste />
          <MentionRenonciation quoi="bulles" etat={accord} />
        </>
      ) : (
        <Button
          size="md"
          onClick={() => {
            achat.noter("touchee", "bulles");
            achat.recharger();
          }}
        >
          {T.bulles.voir}
        </Button>
      )}
      {!bloque && <PasMaintenant ecarter={ecarter} />}
    </span>
  );
}

/** Premium pour qui a pris le rapport seul (l’offre unique ③) : ses bulles en plus, une seule fois. */
function OffrePremium({ offre, achat, attend }: { offre: Extract<OffreDuChat, { genre: "premium" }>; achat: AchatDuChat; attend: boolean }) {
  const { etape, refus, accord, payer, ecarter } = useGeste(achat, "premium");
  if (etape === "ecartee") return null;
  if (etape === "payee") return <Paye texte={T.premium.paye(CATALOGUE.premium_ajout.bulles)} />;
  return (
    <span className={LARGEUR}>
      <EnTete titre={OFFRE_PREMIUM_AJOUT.badge} />
      <span className="text-accent font-black leading-[1.25]">{OFFRE_PREMIUM_AJOUT.titre}.</span>
      <span className="flex items-center gap-3 rounded-[16px] bg-plaque px-3.5 py-3">
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-titre-3 font-black">
          <Perle taille={18} />
          {OFFRE_PREMIUM_AJOUT.plus}
        </span>
        <span className="text-legende font-bold leading-[1.35] text-soft">{OFFRE_PREMIUM_AJOUT.texte}</span>
      </span>
      {refus && <LeRefus refus={refus} />}
      <Button size="md" loading={etape === "occupee"} loadingLabel={T.enCours} onClick={() => payer("premium_ajout")}>
        {OFFRE_PREMIUM_AJOUT.prendre}
      </Button>
      {offre.enUnGeste && <UnGeste />}
      <MentionRenonciation quoi="bulles" etat={accord} />
      {!attend && <PasMaintenant ecarter={ecarter} />}
    </span>
  );
}

/** Une carte qui mène à l’import (une autre conv, le rapport à jour, le réimport) : son contenu, son bouton, et « Pas maintenant ». */
function VersLImport({ genre, achat, libelle, ecartable = true, children }: { genre: GenreVendu; achat: AchatDuChat; libelle: string; ecartable?: boolean; children: ReactNode }) {
  const [ecartee, setEcartee] = useState(false);
  if (ecartee) return null;
  return (
    <span className={LARGEUR}>
      {children}
      <ButtonLink href="/commencer" size="md" arrow onClick={() => achat.noter("touchee", genre)}>
        {libelle}
      </ButtonLink>
      {ecartable && (
        <PasMaintenant
          ecarter={() => {
            achat.noter("refusee", genre);
            setEcartee(true);
          }}
        />
      )}
    </span>
  );
}

/** Quelqu’un d’autre : sa conv s’importe d’abord (une conv à elle, dans « Tes convs »), et se paie sur son paywall. */
function OffreAutre({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "autre" }>; achat: AchatDuChat }) {
  return (
    <VersLImport genre="autre" achat={achat} libelle={T.autre.lire(offre.prenom)}>
      <EnTete titre={T.autre.titre} droite={T.autre.temps} />
      <span className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full [background:var(--rose-blush)] text-carte font-black text-white">
          {offre.prenom ? offre.prenom.slice(0, 1).toUpperCase() : <Icon name="plus" size={18} stroke={2.6} className="text-white" />}
        </span>
        <span className="flex flex-col">
          <span className="text-accent font-black leading-[1.25]">{T.autre.avec(offre.prenom)}</span>
          <span className="text-legende font-bold text-soft">{T.autre.quoi}</span>
        </span>
      </span>
    </VersLImport>
  );
}

/** La même personne, avec du neuf depuis un rapport ancien : la conv réimportée, pour un rapport qui lit aussi la suite. */
function OffreAJour({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "a_jour" }>; achat: AchatDuChat }) {
  return (
    <VersLImport genre="a_jour" achat={achat} libelle={T.aJour.reimporter}>
      <EnTete titre={T.aJour.titre} />
      <span className="text-detail font-black leading-[1.35]">{T.aJour.texte(offre.prenom, offre.depuis)}</span>
    </VersLImport>
  );
}

/** Un ancien rapport doux (une alerte « danger » d’avant le 21 octobre 2026) : la conv réimportée a son rapport complet. Il l’a demandé. */
function OffreReimport({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "reimport" }>; achat: AchatDuChat }) {
  return (
    <VersLImport genre="reimport" achat={achat} libelle={T.reimport.reimporter} ecartable={false}>
      <EnTete titre={T.reimport.titre} droite="8 chapitres" />
      <span className="text-detail font-black leading-[1.35]">{T.reimport.texte(offre.prenom)}</span>
    </VersLImport>
  );
}

/** Dans l’aperçu de l’équipe, la réponse prête floutée dans la carte (l’appli la montre au-dessus : ReponseVerrouillee). */
function ReponseFloutee() {
  return (
    <span className="relative flex min-h-12 flex-col items-end gap-[3px] overflow-hidden rounded-[18px] py-1 pr-1">
      {[30, 22].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className="select-none rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white blur-[6px]"
        >
          {"x".repeat(n)}
        </span>
      ))}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-legende font-black text-white shadow-card">
          <Icon name="lock" size={13} stroke={2.6} className="text-white" />
          Ta réponse est prête
        </span>
      </span>
    </span>
  );
}

/** Dans l’aperçu de l’équipe, la réponse qui se lit une fois rechargé (l’appli la relit à sa place : conv.lire). */
function ReponseLue({ reponse, envoi }: { reponse: string[]; envoi: string[] }) {
  return (
    <span className={LARGEUR}>
      {reponse.map((t) => (
        <span key={t} className="text-corps font-bold leading-[1.4]">
          {t}
        </span>
      ))}
      {envoi.length > 0 && (
        <span className="flex flex-col items-end gap-1.5">
          <span className="self-start text-micro font-black text-vrai-ink">Ta meilleure réponse</span>
          {envoi.map((t) => (
            <span key={t} className="rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white">
              {t}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * La carte d’achat sous la réponse de BLUSH : rien sans le paiement du chat (AchatDuChatContext). `attend` : la réponse
 * au-dessus est verrouillée (écrite à 0 bulle), la carte est ce qui la débloque.
 */
export function OffreDuChatCarte({ offre, attend = false }: { offre: OffreDuChat; attend?: boolean }): ReactNode {
  const achat = use(AchatDuChatContext);
  if (!achat) return null;
  switch (offre.genre) {
    case "bulles":
      return <OffreBulles offre={offre} achat={achat} attend={attend} />;
    case "premium":
      return <OffrePremium offre={offre} achat={achat} attend={attend} />;
    case "autre":
      return <OffreAutre offre={offre} achat={achat} />;
    case "a_jour":
      return <OffreAJour offre={offre} achat={achat} />;
    case "reimport":
      return <OffreReimport offre={offre} achat={achat} />;
  }
}

/** Le paiement du chat est-il là (une carte d’achat peut-elle se montrer) ? La réponse verrouillée cède alors son bouton à la carte. */
export const useAchatDuChatPresent = () => use(AchatDuChatContext) !== null;
