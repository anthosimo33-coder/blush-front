"use client";

import { createContext, use, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { enEuros } from "@/contenu/offres";
import { Perle } from "@/components/bulles/perles";
import { MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import type { OffreDuChat, OffreId } from "@/types";

/*
 * L’achat dans le chat (une proposition du 22 octobre 2026, montrée dans l’aperçu de l’équipe, /apercu/achat) : sous la
 * réponse de BLUSH, une carte qui se paie sans quitter la conv. En un geste avec la carte gardée (le même chemin que les
 * offres de « C’est débloqué », src/app/rapport/debloque/EcranDebloque.tsx), sinon la feuille du paiement. Payée, la carte
 * reste à sa place et dit la suite : le rapport qui s’écrit puis s’ouvre, la réponse qui se lit, l’import à faire.
 */

/** La carte gardée chez le prestataire du paiement : sa marque et ses quatre derniers chiffres. */
export type CarteGardee = { marque: string; fin: string };

/** Ce que paie le chat : la carte gardée (null : la feuille du paiement s’ouvre), et le paiement d’une offre. */
export type AchatDuChat = {
  carte: CarteGardee | null;
  payer: (offre: OffreId) => Promise<"paye" | "carte" | "souci">;
  /** Une recharge payée : ses bulles, pour le compteur. */
  surRecharge?: (bulles: number) => void;
};

/** Le paiement du chat. Sans lui (l’appli d’aujourd’hui), aucune carte d’achat ne se pose. */
export const AchatDuChatContext = createContext<AchatDuChat | null>(null);

type Etape = "proposee" | "occupee" | "payee" | "prete";

/** Le temps que met le rapport à s’écrire, dans l’aperçu (le vrai suit la chaîne). */
const ECRITURE_MS = 5200;

/** La ligne de la carte gardée, sous le bouton : un geste, et c’est payé. */
function UnGeste({ carte, apres = false }: { carte: CarteGardee; apres?: boolean }) {
  return (
    <span className="flex items-center justify-center gap-1.5 text-micro font-extrabold text-soft">
      <Icon name="lock" size={13} stroke={2.6} className="shrink-0" />
      {carte.marque} •••• {carte.fin} · {apres ? "tu paieras en un geste, après la lecture" : "un geste, c’est payé"}
    </span>
  );
}

/** Ce qui est payé, en tête de la carte une fois le geste fait. */
function Paye({ texte }: { texte: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-vrai shadow-[0_6px_14px_-6px_rgba(18,192,138,0.9)]">
        <Icon name="check" size={17} stroke={3} className="text-white" />
      </span>
      <span className="text-detail font-black leading-[1.3] text-vrai-ink">{texte}</span>
    </span>
  );
}

/** La banque a dit non, ou le paiement n’est pas passé : rien n’est débité, et la feuille propose un autre moyen. */
function Refus({ refus }: { refus: "carte" | "souci" }) {
  return (
    <span role="alert" className="rounded-[14px] bg-[#FFF1F1] px-3 py-2 text-legende font-extrabold leading-[1.4] text-danger">
      {refus === "carte" ? "Ta banque a dit non. Rien n’a été débité : essaie Apple Pay ou une autre carte." : "Le paiement n’est pas passé. Rien n’a été débité : réessaie."}
    </span>
  );
}

/** Le surtitre de la carte, et ce qu’elle contient à droite. */
function EnTete({ titre, droite }: { titre: string; droite?: string }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="text-micro font-black uppercase tracking-[0.08em] text-elle-ink">{titre}</span>
      {droite && <span className="text-micro font-extrabold text-grey">{droite}</span>}
    </span>
  );
}

/** Payer une offre : en un geste avec la carte gardée ; sans elle, la feuille du paiement (ici, l’aperçu le simule). */
function usePayer(achat: AchatDuChat, offre: OffreId, surPaye?: () => void) {
  const [etape, setEtape] = useState<Etape>("proposee");
  const [refus, setRefus] = useState<"carte" | "souci" | null>(null);
  const payer = async () => {
    setRefus(null);
    setEtape("occupee");
    const r = await achat.payer(offre);
    if (r !== "paye") {
      setRefus(r);
      setEtape("proposee");
      return;
    }
    setEtape("payee");
    surPaye?.();
  };
  return { etape, setEtape, refus, payer };
}

/** Le rapport de cette conv : les chapitres fermés qu’il ouvre, payé en un geste, puis il s’écrit et s’ouvre sur place. */
function OffreRapport({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "rapport" }>; achat: AchatDuChat }) {
  const accord = useAccord();
  const { etape, setEtape, refus, payer } = usePayer(achat, offre.offre);
  const [progres, setProgres] = useState(0);
  useEffect(() => {
    if (etape !== "payee") return;
    const debut = Date.now();
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - debut) / ECRITURE_MS);
      setProgres(p);
      if (p >= 1) {
        clearInterval(t);
        setEtape("prete");
      }
    }, 80);
    return () => clearInterval(t);
  }, [etape, setEtape]);
  if (etape === "payee" || etape === "prete") {
    const chapitre = Math.min(offre.chapitres, 1 + Math.floor(progres * offre.chapitres));
    return (
      <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
        <Paye texte={`Payé · ${enEuros(offre.centimes)}${achat.carte ? ` · ${achat.carte.marque} •••• ${achat.carte.fin}` : ""}`} />
        {etape === "payee" ? (
          <span className="flex flex-col gap-2" role="status">
            <span className="flex items-baseline justify-between">
              <span className="text-detail font-black">Je l’écris</span>
              <span className="text-micro font-extrabold tabular-nums text-grey">
                chapitre {chapitre} sur {offre.chapitres}
              </span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-track">
              <span className="block h-2 rounded-full [background:var(--rose-blush)] transition-[width] duration-200" style={{ width: `${Math.round(progres * 100)}%` }} />
            </span>
            <span className="text-legende font-bold text-soft">Tu peux continuer à m’écrire en attendant.</span>
          </span>
        ) : (
          <ButtonLink href="/rapport" size="md" arrow>
            Ouvrir mon rapport
          </ButtonLink>
        )}
      </span>
    );
  }
  return (
    <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
      <EnTete titre="Ton rapport complet" droite={`${offre.chapitres} chapitres`} />
      <span className="flex flex-col gap-2">
        {offre.titres.map((t) => (
          <span key={t} className="flex items-start gap-2 text-detail font-black leading-[1.3]">
            <Icon name="lock" size={14} stroke={2.6} className="mt-[3px] shrink-0 text-grey" />
            {t}
          </span>
        ))}
      </span>
      {refus && <Refus refus={refus} />}
      <Button size="md" loading={etape === "occupee"} loadingLabel="Paiement en cours" onClick={() => void payer()}>
        Débloquer · {enEuros(offre.centimes)}
      </Button>
      {achat.carte && <UnGeste carte={achat.carte} />}
      <MentionRenonciation quoi="rapport" etat={accord} />
    </span>
  );
}

/** À zéro bulle : la réponse prête, floutée, et la recharge juste dessous ; rechargé, la réponse se lit à sa place. */
function OffreBulles({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "bulles" }>; achat: AchatDuChat }) {
  const accord = useAccord();
  const [choisi, setChoisi] = useState(0);
  const pack = offre.packs[choisi]!;
  const { etape, refus, payer } = usePayer(achat, pack.offre, () => achat.surRecharge?.(pack.bulles));
  if (etape === "payee" || etape === "prete")
    return (
      <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
        <Paye texte={`+${pack.bulles} bulles · ta réponse est là`} />
        {offre.reponse.map((t) => (
          <span key={t} className="text-corps font-bold leading-[1.4]">
            {t}
          </span>
        ))}
        {offre.envoi.length > 0 && (
          <span className="flex flex-col items-end gap-1.5">
            <span className="self-start text-micro font-black text-vrai-ink">Ta meilleure réponse</span>
            {offre.envoi.map((t) => (
              <span key={t} className="rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white">
                {t}
              </span>
            ))}
            <button
              type="button"
              className="lift lift-sm mt-1 inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-white px-3.5 text-legende font-black text-ink shadow-soft"
            >
              <Icon name="copy" size={14} stroke={2.4} />
              Copier
            </button>
          </span>
        )}
      </span>
    );
  return (
    <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
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
      <EnTete titre="Recharge et lis-la" />
      <span role="radiogroup" aria-label="Combien de bulles" className="grid grid-cols-3 gap-2">
        {offre.packs.map((p, i) => (
          <button
            key={p.offre}
            type="button"
            role="radio"
            aria-checked={i === choisi}
            onClick={() => setChoisi(i)}
            className={cn(
              "lift lift-sm flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-ink",
              i === choisi ? "bg-[#FFF0F6] shadow-[inset_0_0_0_2px_var(--color-elle-ink)]" : "bg-plaque",
            )}
          >
            <span className="flex items-center gap-1 text-carte font-black">
              <Perle taille={13} />
              {p.bulles}
            </span>
            <span className="text-micro font-extrabold text-soft">{enEuros(p.centimes)}</span>
          </button>
        ))}
      </span>
      {refus && <Refus refus={refus} />}
      <Button size="md" loading={etape === "occupee"} loadingLabel="Paiement en cours" onClick={() => void payer()}>
        Recharger · {enEuros(pack.centimes)}
      </Button>
      {achat.carte && <UnGeste carte={achat.carte} />}
      <MentionRenonciation quoi="bulles" etat={accord} />
    </span>
  );
}

/** Quelqu’un d’autre : sa conv s’importe d’abord (une conv à elle, dans « Tes convs »), et se paie en un geste à la fin de sa lecture. */
function OffreAutre({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "autre" }>; achat: AchatDuChat }) {
  return (
    <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
      <EnTete titre="Une autre conv" droite="1 min pour l’exporter" />
      <span className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full [background:var(--rose-blush)] text-carte font-black text-white">
          {offre.prenom.slice(0, 1)}
        </span>
        <span className="flex flex-col">
          <span className="text-accent font-black leading-[1.25]">Ta conv avec {offre.prenom}</span>
          <span className="text-legende font-bold text-soft">son verdict, puis son rapport en 8 chapitres</span>
        </span>
      </span>
      <ButtonLink href="/commencer" size="md" arrow>
        Lire ma conv avec {offre.prenom}
      </ButtonLink>
      {achat.carte && <UnGeste carte={achat.carte} apres />}
    </span>
  );
}

/** Un ancien rapport doux : le rapport complet, payé tout de suite, ouvert dès que la conv est réimportée. */
function OffreReimport({ offre, achat }: { offre: Extract<OffreDuChat, { genre: "reimport" }>; achat: AchatDuChat }) {
  const { etape, refus, payer } = usePayer(achat, offre.offre);
  if (etape === "payee" || etape === "prete")
    return (
      <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
        <Paye texte={`Payé · ${enEuros(offre.centimes)} · il s’ouvre dès ta réimport`} />
        <span className="text-legende font-bold leading-[1.4] text-soft">Ton rapport t’attend : il s’écrit dès que ta conv avec {offre.prenom} est là.</span>
        <ButtonLink href="/commencer" size="md" arrow>
          Réimporter ma conv
        </ButtonLink>
      </span>
    );
  return (
    <span className="flex w-[min(286px,calc(100vw-128px))] flex-col gap-3">
      <EnTete titre="Ton rapport complet" droite="8 chapitres" />
      <span className="text-accent font-black leading-[1.25]">Payé maintenant, il s’ouvre dès que tu réimportes ta conv.</span>
      <span className="flex items-baseline gap-2">
        <span className="text-titre-3 font-black tabular-nums">{enEuros(offre.centimes)}</span>
        <span className="text-detail font-extrabold text-grey line-through">{enEuros(offre.barre)}</span>
        <span className="text-legende font-bold text-soft">ton 2e rapport</span>
      </span>
      {refus && <Refus refus={refus} />}
      <Button size="md" loading={etape === "occupee"} loadingLabel="Paiement en cours" onClick={() => void payer()}>
        Débloquer · {enEuros(offre.centimes)}
      </Button>
      {achat.carte && <UnGeste carte={achat.carte} />}
    </span>
  );
}

/** La carte d’achat sous la réponse de BLUSH : rien sans le paiement du chat (AchatDuChatContext). */
export function OffreDuChatCarte({ offre }: { offre: OffreDuChat }) {
  const achat = use(AchatDuChatContext);
  if (!achat) return null;
  switch (offre.genre) {
    case "rapport":
      return <OffreRapport offre={offre} achat={achat} />;
    case "bulles":
      return <OffreBulles offre={offre} achat={achat} />;
    case "autre":
      return <OffreAutre offre={offre} achat={achat} />;
    case "reimport":
      return <OffreReimport offre={offre} achat={achat} />;
  }
}
