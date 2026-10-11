import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cheminDesApercus, configDuChatLocal } from "@/server/drapeaux";
import { ApercuNav } from "../ApercuNav";
import { lireApercu } from "../lire";
import { ApercuAccueil } from "./ApercuAccueil";

export const metadata: Metadata = { title: "Aperçu de l’accueil" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : l’accueil avec une vraie mémoire (prompt 07) : la phrase du moment, les
 * 4 questions, les vraies réponses du chat (posées dans la conv, ou quand on tape une question). Lu là où pointe
 * BLUSH_APERCU.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/accueil">) {
  const { cas } = await searchParams;
  const a = await lireApercu(cheminDesApercus(), typeof cas === "string" ? cas : undefined);
  if (!a?.data.home) notFound();
  const { payload, story, home } = a.data;
  const { verdict, level, trend, nextStep } = payload.report;
  /* Le vrai chat, en direct, sur la mémoire de cette conv (BLUSH_DEMANDER dit où sont les mémoires) */
  const live = configDuChatLocal() ? `/apercu/demander${a.cas ? `?cas=${a.cas}` : ""}` : undefined;
  return (
    <div className="[background:var(--paper-light)]">
      <ApercuAccueil
        key={a.cas}
        quick={home.quick}
        answers={home.answers}
        script={home.script}
        liveUrl={live}
        contact={{ report: { verdict, level, trend, nextStep }, fiche: home.fiche, period: story.period, ficheHref: `/apercu/fiche${a.cas ? `?cas=${a.cas}` : ""}` }}
      />
      <ApercuNav cas={a.cas} ici="accueil" />
    </div>
  );
}
