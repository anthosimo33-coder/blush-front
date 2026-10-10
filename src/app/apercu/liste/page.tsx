import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NBSP } from "@/lib/format";
import { lireTous } from "../lire";

export const metadata: Metadata = { title: "Aperçu des convs de test" };
export const dynamic = "force-dynamic";

/** En local seulement : toutes les convs de test de la passe, avec leur verdict, et leurs trois vues. */
export default async function Page() {
  const tous = await lireTous();
  if (!tous.length) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-4 px-4 py-10 [background:var(--paper-light)]">
      <h1 className="text-[28px] font-black leading-tight">Les convs de test</h1>
      <p className="text-[15px] font-bold text-grey">La passe finale des prompts, dans l’appli. Chaque conv{NBSP}: son rapport, l’accueil (les vraies réponses du chat déjà dans la conv) et sa fiche.</p>
      <ul className="flex flex-col gap-2.5">
        {tous.map(({ cas, data }) => {
          const v = data.payload.report.verdict;
          const [toi, autre] = data.story.participants;
          const q = `?cas=${cas}`;
          return (
            <li key={cas} className="flex flex-col gap-2 rounded-[20px] bg-white p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="text-[28px] leading-none">{v.emoji}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-black text-grey">
                    {cas} · {toi?.name} → {autre?.name}
                    {data.payload.sober ? " · mode sobre" : ""}
                  </span>
                  <span className="text-[17px] font-black leading-snug">{v.title}</span>
                  <span className="text-[14px] font-bold leading-snug text-soft">{v.subtitle}</span>
                </div>
              </div>
              <div className="flex gap-2 pl-10 text-[13px] font-extrabold">
                <Link href={`/apercu${q}`} className="rounded-full bg-ink px-3 py-1.5 text-white no-underline">
                  Rapport
                </Link>
                {data.home && (
                  <Link href={`/apercu/accueil${q}`} className="rounded-full bg-[#F3F7FF] px-3 py-1.5 text-toi-ink no-underline">
                    Accueil
                  </Link>
                )}
                {data.fiche && (
                  <Link href={`/apercu/fiche${q}`} className="rounded-full bg-[#F3F7FF] px-3 py-1.5 text-toi-ink no-underline">
                    Fiche
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
