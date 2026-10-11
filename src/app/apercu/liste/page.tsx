import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import { NBSP } from "@/lib/format";
import { lireTous } from "@/server/apercu";
import { cheminDesApercus } from "@/server/drapeaux";

export const metadata: Metadata = { title: "Aperçu des convs de test" };
export const dynamic = "force-dynamic";

/** Hors de Vercel seulement (src/proxy.ts) : toutes les convs de test de la passe, avec leur verdict, et leurs trois vues. */
export default async function Page() {
  const tous = await lireTous(cheminDesApercus());
  if (!tous.length) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-4 px-4 py-10 [background:var(--paper-light)]">
      <h1 className="text-[28px] font-black leading-tight">Les convs de test</h1>
      <p className="text-detail font-bold text-grey">
        La passe finale des prompts, dans l’appli. Chaque conv{NBSP}: son rapport, l’accueil (les vraies réponses du chat déjà dans la conv) et sa fiche.
      </p>
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
                  <span className="text-micro font-black text-grey">
                    {cas} · {toi?.name} → {autre?.name}
                    {data.payload.sober ? " · mode sobre" : ""}
                  </span>
                  <span className="text-accent font-black leading-snug">{v.title}</span>
                  <span className="text-note font-bold leading-snug text-soft">{v.subtitle}</span>
                </div>
              </div>
              <div className="flex gap-2 pl-10 text-legende font-extrabold">
                <Link href={`/apercu${q}` as Route} className="rounded-full bg-ink px-3 py-1.5 text-white no-underline">
                  Rapport
                </Link>
                {data.home && (
                  <Link href={`/apercu/accueil${q}` as Route} className="rounded-full bg-[#F3F7FF] px-3 py-1.5 text-toi-ink no-underline">
                    Accueil
                  </Link>
                )}
                {data.fiche && (
                  <Link href={`/apercu/fiche${q}` as Route} className="rounded-full bg-[#F3F7FF] px-3 py-1.5 text-toi-ink no-underline">
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
