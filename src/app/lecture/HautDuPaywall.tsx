import { Fragment } from "react";
import { dateDuHaut, nombre, semaineDeLaCourbe, TEXTES_DU_HAUT, type CaseDuHaut, type HautDuPaywall, type LigneDuHaut } from "@/contenu/haut-du-paywall";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { Dot } from "@/components/ui/messages";
import type { TendanceDuPaywall } from "@/types";

/*
 * Le haut du paywall (la maquette « Le mix », validée le 16 octobre) : le titre en deux lignes, la seconde en rose ;
 * sur téléphone, deux cases (ou la courbe) puis la bulle de BLUSH ; sur ordinateur, la carte des déséquilibres (ou la
 * courbe) avec la bulle dedans. Ce qu’ils disent vient du code (src/contenu/haut-du-paywall.ts), jamais du modèle :
 * rien n’est lu avant le paiement.
 */

const ENCRE = { toi: "text-toi-ink", elle: "text-elle-ink", pareil: "text-soft" } as const;

/** Le titre : une ligne (le titre d’avant), ou deux, la seconde en rose. */
export function TitreDuHaut({ titre }: { titre: HautDuPaywall["titre"] }) {
  return (
    <h1 className="m-0 text-[27px] font-black leading-[1.07] tracking-[-0.03em] [text-wrap:balance] max-lg:[@media(max-height:700px)]:text-[24px] lg:text-[50px] lg:leading-[1.03]">
      {titre[0]}
      {titre[1] && (
        <>
          <br />
          <span className="text-elle-ink">{titre[1]}</span>
        </>
      )}
    </h1>
  );
}

/** Sur téléphone, sous le titre : la courbe et ses chiffres (la tendance), ou deux cases ; rien sans chiffres. */
export function PreuveDuHaut({ haut, className }: { haut: HautDuPaywall; className?: string }) {
  if (haut.courbe)
    return (
      <div className={cn("flex flex-col gap-2 rounded-[18px] bg-white px-3.5 pb-3 pt-2.5 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)]", className)}>
        <Courbe t={haut.courbe} />
        <div className="flex flex-wrap justify-between gap-x-3 text-micro font-extrabold text-soft">
          {haut.cases.map((c) => (
            <span key={c.texte}>
              <span className="font-black text-elle-ink">{c.valeur}</span> {c.texte}
            </span>
          ))}
        </div>
      </div>
    );
  if (!haut.cases.length) return null;
  return (
    <div className={cn("grid rounded-[18px] bg-white shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)]", haut.cases.length > 1 ? "grid-cols-2" : "grid-cols-1", className)}>
      {haut.cases.map((c, i) => (
        <Case key={c.texte} c={c} className={cn(i === 0 && haut.cases.length > 1 && "border-r border-sep")} />
      ))}
    </div>
  );
}

function Case({ c, className }: { c: CaseDuHaut; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-3.5 py-2.5 max-lg:[@media(max-height:700px)]:py-2", className)}>
      <span className={cn("text-[22px] font-black leading-none tracking-[-0.02em]", ENCRE[c.cote])}>
        {c.valeur}
        <span className="text-legende">{c.unite}</span>
      </span>
      <span className="text-micro font-extrabold text-grey">{c.texte}</span>
    </div>
  );
}

/**
 * La bulle de BLUSH (la piste H3) : il écrit, interrompu, ce que ton rapport te dira ; et ta réponse, en bleu. Sur
 * ordinateur, sur une ligne au bas de la carte. Sur téléphone, elle était sous les chiffres (sans ta réponse sur un
 * téléphone bas, 375 × 667) ; retirée le 22 octobre (une proposition : la première section en disait trop, et les
 * aperçus du rapport montrent déjà le chat), sa version courte (`grand` à false) attend la décision.
 */
function BulleDeBlush({ question, grand = false, className }: { question: string; grand?: boolean; className?: string }) {
  return (
    <div className={cn(grand ? "flex items-center justify-between gap-3 rounded-[20px] bg-[#f6f4ef] px-4 py-3.5" : "flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-center", grand ? "gap-3" : "gap-2.5")}>
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 -rotate-[1.5deg] items-center [background:var(--rose-blush)] shadow-[0_10px_20px_-12px_rgba(232,53,138,0.6)]",
            grand ? "gap-[5px] rounded-[20px_20px_20px_6px] px-[17px] py-[13px]" : "gap-1 rounded-[18px_18px_18px_6px] px-3.5 py-[11px]",
          )}
        >
          {[0.55, 0.8, 1].map((o) => (
            <span key={o} className={cn("rounded-full bg-white", grand ? "size-2" : "size-[7px]")} style={{ opacity: o }} />
          ))}
        </span>
        <span className={cn("flex items-center gap-1.5 font-black leading-[1.25] text-ink [text-wrap:balance]", grand ? "text-detail" : "text-note")}>
          <Icon name="lock" size={grand ? 15 : 13} stroke={2.6} className="shrink-0" />
          {question}
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rotate-[1.2deg] whitespace-nowrap bg-bubble-me font-black text-white shadow-[0_12px_22px_-12px_rgba(26,102,219,0.6)]",
          grand ? "rounded-[20px_20px_6px_20px] px-4 py-2.5 text-corps" : "self-end rounded-[18px_18px_6px_18px] px-3.5 py-2 text-detail max-lg:[@media(max-height:700px)]:hidden",
        )}
      >
        {TEXTES_DU_HAUT.reponse}
      </span>
    </div>
  );
}

/** Sur ordinateur, sous le titre : la carte des déséquilibres, ou la courbe et ses deux chiffres ; la bulle de BLUSH au bas. */
export function CarteDuHaut({ haut, autre, className }: { haut: HautDuPaywall; autre: string; className?: string }) {
  return (
    <div className={cn("flex-col gap-[18px] rounded-[28px] bg-white px-6 pb-[18px] pt-[22px] shadow-card", className)}>
      {haut.courbe ? (
        <>
          <div className="flex items-center justify-between gap-4 text-detail font-black">
            <span className="flex items-center gap-1.5 text-elle-ink">
              <Dot size={9} className="bg-elle" />
              {autre}
            </span>
            <span className="text-micro font-extrabold uppercase tracking-[0.06em] text-grey">{TEXTES_DU_HAUT.courbe}</span>
          </div>
          <Courbe t={haut.courbe} grand />
          <div className="-mt-2.5 flex justify-between text-micro font-extrabold text-grey">
            <span>{dateDuHaut(semaineDeLaCourbe(haut.courbe, 0), { court: true })}</span>
            <span>{dateDuHaut(semaineDeLaCourbe(haut.courbe, haut.courbe.semaines.length - 1), { court: true })}</span>
          </div>
          <div className={cn("grid gap-3", haut.cases.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {haut.cases.map((c) => (
              <div key={c.texte} className="flex flex-col gap-0.5 rounded-[16px] bg-[#FFF0F6] px-3.5 py-3">
                <span className="text-[28px] font-black leading-none tracking-[-0.02em] text-elle-ink">{c.valeur}</span>
                <span className="text-legende font-extrabold text-soft">{c.texte}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        haut.carte && (
          <>
            <div className="grid grid-cols-[96px_minmax(0,1fr)_96px] items-center text-detail font-black">
              <span className="flex items-center gap-1.5 text-toi-ink">
                <Dot size={9} className="bg-toi" />
                {TEXTES_DU_HAUT.toi}
              </span>
              <span className="text-center text-micro font-extrabold uppercase tracking-[0.06em] text-grey">{haut.carte.titre}</span>
              <span className="flex items-center justify-end gap-1.5 text-elle-ink">
                <span className="truncate">{autre}</span>
                <Dot size={9} className="bg-elle" />
              </span>
            </div>
            {haut.carte.lignes.map((l) => (
              <LigneDeLaCarte key={l.label} l={l} />
            ))}
          </>
        )
      )}
      <BulleDeBlush question={haut.question} grand />
    </div>
  );
}

/** Une ligne de la carte : vos deux chiffres de part et d’autre, et la barre qui part du milieu ; le côté qui l’emporte en couleur. */
function LigneDeLaCarte({ l }: { l: LigneDuHaut }) {
  const toiFort = l.cote !== "elle";
  const elleFort = l.cote !== "toi";
  const chiffre = (v: LigneDuHaut["toi"], fort: boolean, cote: "toi" | "elle") => (
    <span className={cn("flex items-baseline gap-1", cote === "elle" && "justify-end", fort ? ENCRE[cote] : "text-grey")}>
      <span className="text-[34px] font-black leading-none tracking-[-0.03em]">{v.n}</span>
      <span className="text-legende font-extrabold">{v.unite}</span>
    </span>
  );
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_96px] items-end">
      {chiffre(l.toi, toiFort, "toi")}
      <div className="flex flex-col gap-2">
        <span className="text-center text-detail font-black">{l.label}</span>
        <div aria-hidden="true" className="flex h-2.5 gap-[3px]">
          <div className="flex flex-1 justify-end overflow-hidden rounded-l-[6px] bg-[#eeece6]">
            <span className={cn("rounded-l-[6px] bg-toi", !toiFort && "opacity-45")} style={{ width: `${l.partToi}%` }} />
          </div>
          <div className="flex flex-1 overflow-hidden rounded-r-[6px] bg-[#eeece6]">
            <span className={cn("rounded-r-[6px] bg-elle", !elleFort && "opacity-45")} style={{ width: `${100 - l.partToi}%` }} />
          </div>
        </div>
      </div>
      {chiffre(l.elle, elleFort, "elle")}
    </div>
  );
}

/** La courbe de la tendance : ses messages par jour, semaine par semaine, plus pâles avant la chute, et la date où elle commence. */
function Courbe({ t, grand = false }: { t: TendanceDuPaywall; grand?: boolean }) {
  const max = Math.max(1, ...t.semaines);
  return (
    <div
      role="img"
      aria-label={TEXTES_DU_HAUT.courbeLue(nombre(t.avant), nombre(t.apres), dateDuHaut(t.depuis))}
      className={cn("flex items-end", grand ? "mt-7 h-[108px] gap-[5px]" : "mt-5 h-[46px] gap-[3px]")}
    >
      {t.semaines.map((v, i) => (
        <Fragment key={i}>
          {i === t.coupure && (
            <span className="relative w-0 self-stretch border-l-2 border-dashed border-ink">
              <span
                className={cn(
                  "absolute left-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink font-black text-white",
                  grand ? "-top-[26px] px-2 py-0.5 text-micro" : "-top-5 px-1.5 py-px text-[11px]",
                )}
              >
                {dateDuHaut(t.depuis, { court: true })}
              </span>
            </span>
          )}
          <span
            className={cn("flex-1", i >= t.coupure ? "bg-[#e8358a]" : "bg-[#ffc2dc]", grand ? "rounded-[5px_5px_2px_2px]" : "rounded-[3px_3px_2px_2px]")}
            style={{ height: `${Math.max(4, Math.round((v / max) * 100))}%` }}
          />
        </Fragment>
      ))}
    </div>
  );
}
