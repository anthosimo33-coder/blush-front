"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container, CtaButton, useCta } from "./parts";

/* Le héros : « en dit plus » reçu, « que tu crois » envoyé, puis (children) les convs qui défilent. */

const GLOW = "pointer-events-none absolute left-1/2 top-0 -z-10 h-[640px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(closest-side,#FFFFFF,rgba(255,255,255,0))]";

/** `children` : ce qui suit dans le héros (les convs qui défilent). */
export function Hero({ children }: { children?: ReactNode }) {
  const cta = useCta();
  return (
    <section className={cn("relative isolate pt-14 lg:pt-24", children ? "pb-10 lg:pb-14" : "pb-12 lg:pb-16")}>
      <span aria-hidden="true" className={GLOW} />
      <Container className="flex flex-col items-center text-center">
        <h1 className="m-0 text-[38px] font-black leading-[1.26] tracking-[-0.035em] sm:text-[58px] lg:text-[74px]">
          <span className="block">
            Ta conv <Said>en dit plus</Said>
          </span>{" "}
          <span className="block">
            <Said me>que tu crois</Said>.
          </span>
        </h1>
        <p className="m-0 mt-6 max-w-[600px] text-[18px] font-extrabold leading-[1.5] text-soft [text-wrap:balance] lg:mt-8 lg:text-[21px]">
          Importe-la. BLUSH te dit ce qui se passe vraiment entre vous, messages à l’appui, et quoi répondre.
        </p>
        <CtaButton className="mt-8 lg:mt-10" />
        <span className="mt-3.5 text-[14px] font-extrabold text-grey">{cta.note}</span>
      </Container>
      {children}
    </section>
  );
}

/** Une expression du titre dans une bulle : reçue (rose BLUSH, à gauche) ou envoyée par toi (bleue, qui arrive après). */
function Said({ me = false, children }: { me?: boolean; children: string }) {
  const r = me ? 1.5 : -2;
  return (
    <span
      data-pop={me ? "" : undefined}
      className={cn(
        "mx-[0.04em] inline-block whitespace-nowrap px-[0.34em] pb-[0.12em] pt-[0.04em] align-[0.06em] text-[0.86em] leading-[1.1]",
        me
          ? "rounded-[0.5em_0.5em_0.16em_0.5em] bg-bubble-me text-white shadow-[0_20px_36px_-18px_rgba(26,102,219,0.7)]"
          : "rounded-[0.5em_0.5em_0.5em_0.16em] text-white [background:var(--rose-blush)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_34px_-18px_rgba(232,53,138,0.75)]",
      )}
      style={{ transform: `rotate(${r}deg)`, "--r": `${r}deg`, "--d": "0.45s" }}
    >
      <span className="sr-only">«&nbsp;</span>
      {children}
      <span className="sr-only">&nbsp;»</span>
    </span>
  );
}
