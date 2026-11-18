import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CA_TE_PARLE, DEJA_ESSAYE, NUIT } from "@/contenu/landing-nuit";
import { LogoBulle } from "./ilots";
import { Container } from "./parts";

/*
 * La landing (/), sous les convs d’exemple (le 18 novembre 2026, d’après l’avatar client ; textes :
 * src/contenu/landing-nuit.ts) : « Ça te parle ? » (ce qu’elle vit, en ses bulles), « Tu as déjà tout essayé », puis une
 * nuit avec BLUSH, la preuve de « je suis là à 2 h ». Le bloc du quotidien (parts.tsx) suit : ce que BLUSH répond, chaque
 * jour. Repris de la page des pubs proposée le 13 novembre (branche proto/landing-pubs).
 */

/* ———— Une nuit avec BLUSH : la conv de 2 h 14, au centre ———— */
export function NuitAvecBlush() {
  return (
    <section aria-label={NUIT.legende} className="pb-12 pt-2 lg:pb-20">
      <Container className="flex justify-center">
        <ConvDeNuit />
      </Container>
    </section>
  );
}

/* ———— Ça te parle ? Ce qu’elle vit, dit par elle (ses bulles, bleues), puis BLUSH lui répond ———— */
export function CaTeParle() {
  return (
    <section aria-labelledby="parle-titre" className="py-12 lg:py-20">
      <Container className="flex flex-col items-center">
        <Titre id="parle-titre" titre={CA_TE_PARLE.titre} />
        <ul data-reveal="" className="m-0 mt-8 flex w-full max-w-[560px] list-none flex-col items-end gap-1.5 p-0 lg:mt-12">
          {CA_TE_PARLE.messages.map((m) => (
            <li key={m} className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-bubble-me px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white">
              {m}
            </li>
          ))}
        </ul>
        <ReponseDeBlush>{CA_TE_PARLE.blush}</ReponseDeBlush>
      </Container>
    </section>
  );
}

/** La réponse de BLUSH qui clôt une section : son logo, et une bulle rose penchée. */
function ReponseDeBlush({ children }: { children: string }) {
  return (
    <p data-reveal="" className="m-0 mt-6 flex w-full max-w-[560px] items-end gap-2">
      <LogoBulle size={34} className="mb-0.5 shrink-0" />
      <span
        className="rounded-[22px] rounded-bl-[6px] px-4 py-2.5 font-message text-accent font-black leading-[1.3] text-white [background:var(--rose-blush)]"
        style={{ transform: "rotate(-1.5deg)" }}
      >
        {children}
      </span>
    </p>
  );
}

/* ———— Ce qu’elle a déjà essayé ———— */

export function DejaEssaye() {
  return (
    <section aria-labelledby="essaye-titre" className="py-12 lg:py-20">
      <Container className="flex flex-col items-center">
        <Titre id="essaye-titre" titre={DEJA_ESSAYE.titre} sous={DEJA_ESSAYE.sous} />
        <ul data-reveal="" className="m-0 mt-8 w-full max-w-[560px] list-none overflow-hidden rounded-[28px] bg-white p-0 shadow-card lg:mt-12">
          {DEJA_ESSAYE.lignes.map((l, i) => (
            <li key={l.titre} className={cn("flex gap-3.5 px-5 py-4", i > 0 && "border-t border-[rgba(17,17,20,0.06)]")}>
              <span aria-hidden="true" className="mt-0.5 text-[26px] leading-none">
                {l.emoji}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-accent font-black leading-[1.3]">{l.titre}</span>
                <span className="text-detail font-extrabold leading-[1.45] text-soft">{l.texte}</span>
              </span>
            </li>
          ))}
        </ul>
        <ReponseDeBlush>{DEJA_ESSAYE.blush}</ReponseDeBlush>
      </Container>
    </section>
  );
}

/** La conv de nuit : l’heure en grand, ses messages à elle en bleu, les réponses de BLUSH sur le papier. */
function ConvDeNuit() {
  return (
    <figure
      data-reveal=""
      className="relative m-0 w-full max-w-[400px] overflow-hidden rounded-[36px] bg-ink px-4 pb-6 pt-7 text-white shadow-[0_40px_80px_-40px_rgba(17,17,20,0.8)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(255,79,154,0.22),rgba(255,79,154,0))]"
      />
      <div className="relative flex flex-col items-center">
        <span className="text-[56px] font-black leading-none tracking-[-0.04em] tabular-nums">{NUIT.heure}</span>
        <figcaption className="mt-2 text-legende font-black text-white/55">{NUIT.legende}</figcaption>
      </div>
      <div className="relative mt-6 flex flex-col gap-1.5 text-left">
        {NUIT.messages.map((m, i) => {
          const premierDeBlush = !m.moi && NUIT.messages[i - 1]?.moi;
          return m.moi ? (
            <span
              key={m.texte}
              className="max-w-[80%] self-end rounded-[20px] rounded-br-[6px] bg-bubble-me px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white"
            >
              {m.texte}
            </span>
          ) : (
            <span key={m.texte} className={cn("flex items-end gap-2", premierDeBlush && "mt-2.5")}>
              <span className="w-7 shrink-0">{i === NUIT.messages.length - 1 && <LogoBulle size={28} className="mb-0.5" />}</span>
              <span className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-paper px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-ink">{m.texte}</span>
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/** Le titre d’une section, au centre, et sa ligne dessous. */
function Titre({ id, titre, sous }: { id: string; titre: ReactNode; sous?: ReactNode }) {
  return (
    <div data-reveal="" className="flex flex-col items-center gap-3 text-center">
      <h2 id={id} className="m-0 max-w-[720px] text-[34px] font-black leading-[1.04] tracking-[-0.03em] [text-wrap:balance] lg:text-chiffre">
        {titre}
      </h2>
      {sous && <p className="m-0 max-w-[540px] text-accent font-extrabold leading-[1.5] text-soft [text-wrap:balance] lg:text-[19px]">{sous}</p>}
    </div>
  );
}
