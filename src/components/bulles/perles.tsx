import { Sphere } from "@/components/brand/objects3d";

/*
 * Les perles des bulles (le crédit du chat) : une bulle se dessine comme la perle opale du logo (Sphere « opale »). Des
 * dessins seulement, cachés aux lecteurs d’écran (aria-hidden) : l’écran qui les pose dit le nombre en texte à côté.
 * Reprises du prototype validé des bulles (12 octobre).
 */

/** Une bulle : la perle opale du logo, de `taille` pixels. */
export function Perle({ taille = 16 }: { taille?: number }) {
  return <Sphere size={taille} kind="opale" shadow={false} />;
}

/** Une bulle dépensée : la place vide d’une perle, de `taille` pixels. */
export function PerleVide({ taille = 16 }: { taille?: number }) {
  return (
    <span
      aria-hidden="true"
      data-perle="vide"
      className="shrink-0 rounded-full bg-segment shadow-[inset_0_1px_2px_rgba(17,17,20,0.14)]"
      style={{ width: taille, height: taille }}
    />
  );
}

/** `pleines` perles, puis `vides` places vides, en rangée (« Plus que N bulles », l’offre ③). */
export function Rangee({ pleines, vides = 0, taille = 14 }: { pleines: number; vides?: number; taille?: number }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-[3px]">
      {Array.from({ length: Math.max(0, pleines) }, (_, i) => (
        <Perle key={`p${i}`} taille={taille} />
      ))}
      {Array.from({ length: Math.max(0, vides) }, (_, i) => (
        <PerleVide key={`v${i}`} taille={taille} />
      ))}
    </span>
  );
}

/* Les trois perles de la grappe, dessinées pour 40 px : leur coin haut gauche et leur taille */
const GRAPPE = [
  { left: 2, top: 15, taille: 17 },
  { left: 15, top: 4, taille: 20 },
  { left: 19, top: 21, taille: 15 },
] as const;

/** Trois perles en grappe, dans un carré de `taille` pixels : un paquet de bulles. */
export function Grappe({ taille = 40 }: { taille?: number }) {
  const t = taille / 40;
  return (
    <span aria-hidden="true" className="relative block shrink-0" style={{ width: taille, height: taille }}>
      {GRAPPE.map((p) => (
        <span key={`${p.left}-${p.top}`} className="absolute" style={{ left: p.left * t, top: p.top * t }}>
          <Perle taille={p.taille * t} />
        </span>
      ))}
    </span>
  );
}

/** Un cadeau, au trait des icônes de l’appli (src/components/ui/icons.tsx) : les bulles offertes de Premium. */
export function Cadeau({ taille = 18, className }: { taille?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
