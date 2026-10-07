import Link from "next/link";

/** En local : passer d’une vue à l’autre de la même conv (rapport, accueil, fiche), ou revenir à la liste. */
export function ApercuNav({ cas, ici }: { cas: string | null; ici: "rapport" | "accueil" | "fiche" }) {
  const q = cas ? `?cas=${cas}&plan=blushplus` : "?plan=blushplus";
  const liens = [
    { id: "rapport", label: "Rapport", href: `/apercu${q}` },
    { id: "accueil", label: "Accueil", href: `/apercu/accueil${q}` },
    { id: "fiche", label: "Fiche", href: `/apercu/fiche${q}` },
  ] as const;
  return (
    <nav aria-label="Aperçu" className="fixed bottom-4 right-4 z-[100] flex items-center gap-1 rounded-full bg-ink/90 p-1 text-[12px] font-extrabold text-white shadow-card backdrop-blur">
      {cas && (
        <Link href="/apercu/liste" className="rounded-full px-2.5 py-1.5 text-white/70 no-underline hover:text-white">
          ← {cas}
        </Link>
      )}
      {liens.map((l) => (
        <Link key={l.id} href={l.href} aria-current={l.id === ici ? "page" : undefined} className={`rounded-full px-2.5 py-1.5 no-underline ${l.id === ici ? "bg-white text-ink" : "text-white hover:bg-white/15"}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
