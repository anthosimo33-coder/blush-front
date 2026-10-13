import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { NombreEnLigne } from "./SondeDuDirect";

/*
 * L’en-tête d’/admin : le logo, « Admin », et les rubriques (Pilotage, En direct avec le nombre en ligne, Outils). Sur un
 * grand écran, les rubriques sont des onglets dans l’en-tête ; sur un téléphone, une barre fixée en bas de l’écran (la
 * même nav, posée autrement). `base` : /admin, ou l’aperçu de l’équipe (/apercu/admin).
 */

export type BaseDeLAdmin = "/admin" | "/apercu/admin";

const ONGLET =
  "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[3px] rounded-[20px] px-2 text-[11px] font-black no-underline md:min-h-10 md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-detail";
const ONGLET_ICI = "text-ink md:bg-white md:shadow-[0_1px_2px_rgba(17,17,20,0.08),0_6px_14px_-8px_rgba(17,17,20,0.3)]";
const ONGLET_AILLEURS = "text-grey hover:text-ink";

/** Une icône d’onglet, sur téléphone seulement (le texte suffit sur un grand écran). */
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="md:hidden"
    >
      {children}
    </svg>
  );
}

export function EnTete({ base, ici, droite }: { base: BaseDeLAdmin; ici: "pilotage" | "direct"; droite?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <Logo size={30} fontSize={24} href="/" />
          <span className="rounded-full bg-ink px-2.5 py-1 text-legende font-black text-white">Admin</span>
        </div>
        <nav
          aria-label="Rubriques"
          className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex rounded-[26px] bg-white/92 p-1.5 shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_18px_40px_-16px_rgba(17,17,20,0.4)] backdrop-blur md:static md:z-auto md:gap-1 md:rounded-full md:bg-segment md:p-1 md:shadow-none md:backdrop-blur-none"
        >
          <Link href={base} aria-current={ici === "pilotage" ? "page" : undefined} className={cn(ONGLET, ici === "pilotage" ? ONGLET_ICI : ONGLET_AILLEURS)}>
            <Icone>
              <path d="M4 20V10" />
              <path d="M10 20V4" />
              <path d="M16 20v-7" />
              <path d="M22 20H2" />
            </Icone>
            Pilotage
          </Link>
          <Link href={`${base}/direct`} aria-current={ici === "direct" ? "page" : undefined} className={cn(ONGLET, ici === "direct" ? ONGLET_ICI : ONGLET_AILLEURS)}>
            <Icone>
              <circle cx="12" cy="12" r="2.5" />
              <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9" />
              <path d="M16.5 7.5a6.4 6.4 0 0 1 0 9" />
              <path d="M4.5 4.5a10.6 10.6 0 0 0 0 15" />
              <path d="M19.5 4.5a10.6 10.6 0 0 1 0 15" />
            </Icone>
            En direct {/* Sur téléphone, le nombre se pose en pastille au-dessus de l’icône */}
            <span className="absolute left-1/2 top-0.5 ml-2 md:static md:ml-0">
              <NombreEnLigne />
            </span>
          </Link>
          {ici === "pilotage" ? (
            <a href="#outils" className={cn(ONGLET, ONGLET_AILLEURS)}>
              <IconeOutils />
              Outils
            </a>
          ) : (
            <Link href={`${base}#outils`} className={cn(ONGLET, ONGLET_AILLEURS)}>
              <IconeOutils />
              Outils
            </Link>
          )}
        </nav>
      </div>
      {droite}
    </header>
  );
}

function IconeOutils() {
  return (
    <Icone>
      <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" />
    </Icone>
  );
}
