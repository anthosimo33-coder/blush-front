import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icons";
import { HeroHeader } from "@/components/ui/inset";
import type { Bloc } from "@/contenu/conditions";

/*
 * Les morceaux des pages légales (les conditions, les mentions légales), rendus sur le serveur comme la page
 * Confidentialité : l’en-tête, une section de texte en carte blanche, et les liens d’une page légale à l’autre, posés
 * aussi au pied de « Mon compte » et de la confidentialité.
 */

/** L’en-tête d’une page légale : son icône dans un rond noir, son titre, sa phrase. */
export function EnTeteJuridique({ icone, titre, sous }: { icone: IconName; titre: string; sous: string }) {
  return (
    <HeroHeader
      visual={
        <span className="flex size-16 items-center justify-center rounded-full bg-ink shadow-[0_14px_30px_-14px_rgba(17,17,20,0.6)]">
          <Icon name={icone} size={28} stroke={2.2} className="text-white" />
        </span>
      }
      title={titre}
      sub={sous}
      className="mb-6 mt-2"
    />
  );
}

/**
 * Une section de texte, au dessin des listes groupées (InsetGroup) : son titre discret au-dessus (un h3 sous la partie
 * de la page, un h2 sinon), puis ses paragraphes et ses listes dans une carte blanche. `id` : son ancre.
 */
export function SectionJuridique({ id, titre, niveau = 2, children, className }: { id: string; titre: string; niveau?: 2 | 3; children: ReactNode; className?: string }) {
  const Titre = niveau === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-2", className)}>
      <Titre id={id} className="m-0 pl-4 text-legende font-black text-grey">
        {titre}
      </Titre>
      <div className="flex flex-col gap-2.5 rounded-[20px] bg-white px-4 py-3.5 text-detail font-extrabold leading-[1.5] text-soft shadow-card">{children}</div>
    </section>
  );
}

/** Les paragraphes d’une section : une chaîne fait un paragraphe, une liste fait des puces. */
export function Blocs({ blocs }: { blocs: readonly Bloc[] }) {
  return blocs.map((b, k) =>
    typeof b === "string" ? (
      <p key={k} className="m-0">
        {b}
      </p>
    ) : (
      <ul key={k} className="m-0 flex list-disc flex-col gap-1.5 pl-5 marker:text-pale">
        {b.map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>
    ),
  );
}

/** Les pages légales, dans l’ordre du pied de page. */
const PAGES: readonly { href: Route; nom: string }[] = [
  { href: "/conditions", nom: "Conditions" },
  { href: "/mentions-legales", nom: "Mentions légales" },
  { href: "/confidentialite", nom: "Confidentialité" },
];

/** Les liens vers les pages légales, au pied d’une page (sans celle où l’on est, `ici`). */
export function LiensJuridiques({ ici, className }: { ici?: Route; className?: string }) {
  return (
    <nav aria-label="Pages légales" className={cn("flex flex-wrap justify-center gap-x-5 gap-y-2 text-note font-extrabold", className)}>
      {PAGES.filter((p) => p.href !== ici).map((p) => (
        <Link key={p.href} href={p.href} className="text-soft no-underline hover:text-ink">
          {p.nom}
        </Link>
      ))}
    </nav>
  );
}
