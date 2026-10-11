import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { cache, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { NoteIcone } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { CLES, compter, estUnRobot } from "@/server/compteurs";
import { verdictPartage } from "@/server/partages";

/*
 * Un verdict partagé, tel que le voient les potes, dans l’habit de la landing : BLUSH parle en bulles roses,
 * le verdict en grand, et la réponse de celui qui regarde, en bleu, mène à BLUSH.
 * Le verdict seul (le prénom de l’autre masqué) : jamais un message, jamais un chapitre. Textes relus le 8 octobre (voix de BLUSH).
 */

/*
 * Le verdict du lien, lu une fois par requête : les métadonnées (l’aperçu dans WhatsApp ou iMessage) et la page le
 * lisent toutes les deux, et chaque lecture est un SELECT et un déchiffrement.
 */
const verdictDuLien = cache(verdictPartage);

export async function generateMetadata({ params }: PageProps<"/v/[id]">): Promise<Metadata> {
  const { id } = await params;
  const v = await verdictDuLien(id);
  if (!v) return { title: "Lien désactivé" };
  const titre = `${v.emoji} ${v.title}`;
  return {
    title: { absolute: titre },
    description: "BLUSH a lu toute leur conv. Et la tienne, elle dit quoi\u00a0?",
    openGraph: { title: titre, description: v.subtitle || "BLUSH a lu toute leur conv.", siteName: "BLUSH", type: "website", images: [{ url: `/v/${id}/image`, width: 1200, height: 630, alt: titre }] },
    twitter: { card: "summary_large_image", title: titre, images: [`/v/${id}/image`] },
  };
}

/** Une bulle de conv, comme dans le titre de la landing : reçue (BLUSH, rose) ou envoyée (toi, bleue). */
function Bulle({ moi = false, angle, children }: { moi?: boolean; angle: number; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block px-[0.7em] pb-[0.38em] pt-[0.3em] text-accent font-black leading-[1.15] text-white lg:text-[19px]",
        moi
          ? "rounded-[0.9em_0.9em_0.24em_0.9em] bg-bubble-me shadow-[0_16px_30px_-16px_rgba(26,102,219,0.7)]"
          : "rounded-[0.9em_0.9em_0.9em_0.24em] [background:var(--rose-blush)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_16px_30px_-16px_rgba(232,53,138,0.75)]",
      )}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      {children}
    </span>
  );
}

export default async function Page({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const v = await verdictDuLien(id);
  /* Une visite, si c’est une personne (les robots d’aperçu de WhatsApp ou iMessage ne comptent pas) */
  if (v && !estUnRobot((await headers()).get("user-agent"))) after(() => compter(CLES.lienVu));
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center overflow-x-clip bg-paper px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] lg:pt-10">
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[560px] w-[900px] -translate-x-1/2 bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]" />
      <Logo size={34} fontSize={24} href="/" />
      <div className="mt-10 flex w-full max-w-[520px] flex-col lg:mt-16">
        {v ? (
          <>
            <section aria-labelledby="verdict-titre" className="flex flex-col items-start">
              <div className="flex flex-col items-start gap-2">
                <Bulle angle={-1.5}>j’ai lu toute leur conv 👀</Bulle>
                <Bulle angle={1.2}>verdict{NBSP}:</Bulle>
              </div>
              <span className="mt-7 text-[76px] leading-none lg:text-[88px]" aria-hidden="true">
                {v.emoji}
              </span>
              <h1 id="verdict-titre" className="m-0 mt-4 text-[40px] font-black leading-[1.04] tracking-[-0.035em] [text-wrap:balance] lg:text-[48px]">
                {v.title}
              </h1>
              {v.subtitle && <p className="m-0 mt-3 text-carte font-extrabold leading-[1.4] text-soft [text-wrap:balance] lg:text-[20px]">{v.subtitle}</p>}
            </section>
            <div className="mt-9 flex justify-end">
              <Bulle moi angle={1.5}>
                et la mienne, elle dit quoi{NBSP}?
              </Bulle>
            </div>
          </>
        ) : (
          <section className="flex flex-col items-start">
            <Bulle angle={-1.5}>oups 🙈</Bulle>
            <h1 className="m-0 mt-5 text-[34px] font-black leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">Ce lien ne montre plus rien.</h1>
            <p className="m-0 mt-3 text-accent font-extrabold leading-[1.45] text-soft">La personne qui l’a partagé l’a désactivé. C’est elle qui décide.</p>
          </section>
        )}

        <section className="mt-6 flex flex-col items-center gap-3 rounded-[28px] bg-white px-5 pb-5 pt-6 text-center shadow-card lg:px-7">
          <h2 className="m-0 text-titre-3 font-black leading-[1.12] tracking-[-0.025em] [text-wrap:balance]">Ta conv en dit plus que tu crois.</h2>
          <p className="m-0 text-detail font-bold leading-[1.45] text-soft [text-wrap:balance]">Importe-la. BLUSH te dit ce qui se passe vraiment entre vous, messages à l’appui, et quoi répondre.</p>
          <ButtonLink href={`/v/${id}/essayer`} arrow className="mt-1 whitespace-nowrap">
            Analyser ma conv
          </ButtonLink>
        </section>
        {v && (
          <NoteIcone icone="shield" taille={15} serree className="mt-4 justify-center px-1 text-center text-[12.5px] leading-[1.45]">
            Leur conv reste privée{NBSP}: seul le verdict est partagé, sans le prénom de l’autre.
          </NoteIcone>
        )}
      </div>
    </main>
  );
}
