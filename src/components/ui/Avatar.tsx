import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AppKind } from "@/types";
import { Icon } from "./icons";

/* Avatars ronds avec reflet : bleu = toi, rose = elle, vert = la vérité. */
const AVATAR_BG = {
  toi: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), var(--toi)",
  elle: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), var(--elle)",
  vrai: "var(--gloss), var(--vrai)",
} as const;

export function Avatar({
  tone,
  size = 40,
  fontSize,
  photo,
  children,
  className,
  style,
}: {
  tone: keyof typeof AVATAR_BG;
  size?: number;
  fontSize?: number;
  /** Une photo carrée de public/ (un avis, une conv d’exemple de la landing) : à la place de l’initiale, sur sa couleur le temps qu’elle arrive. */
  photo?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      /* Une initiale dit un prénom : masquée dans l’enregistrement des visites (src/lib/secrets.ts) */
      data-prive=""
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full font-black text-white", className)}
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[tone],
        boxShadow: tone === "vrai" ? "0 3px 8px -3px rgba(18,192,138,0.6)" : "inset 0 -2px 4px rgba(0,0,0,0.12), 0 3px 8px -3px rgba(17,17,20,0.3)",
        fontSize: fontSize ?? Math.round(size * 0.41),
        ...style,
      }}
    >
      {photo ? (
        /* Déjà à la bonne taille (256 px pour un rond de 44 au plus) : servie telle quelle, sans passer par l’optimiseur */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={size} height={size} loading="lazy" decoding="async" className="block size-full object-cover" />
      ) : (
        children
      )}
    </span>
  );
}

/** Deux avatars qui se chevauchent (« Hugo & Sophie »). */
export function AvatarPair({ me, other, size = 40 }: { me: string; other: string; size?: number }) {
  return (
    <span className="flex shrink-0" aria-hidden="true">
      <Avatar tone="toi" size={size}>
        {me}
      </Avatar>
      <span className="rounded-full" style={{ marginLeft: -Math.round(size / 4), boxShadow: "0 0 0 3px white" }}>
        <Avatar tone="elle" size={size}>
          {other}
        </Avatar>
      </span>
    </span>
  );
}

const GLOSS = "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 55%)";

/** Pastilles d’applis : icônes neutres, pas les logos officiels. */
export function AppBadge({ app, size = 46, radius = 13, className }: { app: AppKind; size?: number; radius?: number; className?: string }) {
  const glyph = Math.round(size / 2);
  const box: CSSProperties = { width: size, height: size, borderRadius: radius };
  const cls = cn("flex shrink-0 items-center justify-center", className);
  switch (app) {
    case "whatsapp":
      return (
        <span
          aria-hidden="true"
          className={cls}
          style={{ ...box, background: `${GLOSS}, linear-gradient(180deg, #5BE584, #1FBF5B)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 14px -6px rgba(31,191,91,0.65)" }}
        >
          <Icon name="whatsapp" size={glyph} stroke={1.9} className="text-white" />
        </span>
      );
    case "imessage":
      return (
        <span aria-hidden="true" className={cls} style={{ ...box, background: "linear-gradient(180deg, #6EC1FF, #2F7BFF)" }}>
          <Icon name="imessage" size={glyph} fill="currentColor" stroke={2} className="text-white" />
        </span>
      );
    case "instagram":
      return (
        <span
          aria-hidden="true"
          className={cls}
          style={{
            ...box,
            background: `${GLOSS}, radial-gradient(circle at 30% 110%, #FDDC7A 0%, #FD8C4E 30%, #E1306C 58%, #9B34C8 82%, #5B5BD6 100%)`,
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 14px -6px rgba(225,48,108,0.6)",
          }}
        >
          <Icon name="instagram" size={glyph} stroke={2} className="text-white" />
        </span>
      );
    case "hinge":
      return (
        <span
          aria-hidden="true"
          className={cn(cls, "font-black text-white")}
          style={{ ...box, background: `${GLOSS}, var(--ink)`, boxShadow: "0 6px 14px -6px rgba(17,17,20,0.55)", fontSize: Math.round(size * 0.43) }}
        >
          H
        </span>
      );
    case "autre": {
      /* Des captures ou une vidéo de l’écran, de n’importe quelle appli : une photo, et sa pastille de lecture dans le coin */
      const pastille = Math.round(size * 0.43);
      const decalage = -Math.round(size * 0.11);
      return (
        <span
          aria-hidden="true"
          className={cn(cls, "relative")}
          style={{ ...box, background: `${GLOSS}, var(--rose-blush)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 14px -6px rgba(232,53,138,0.6)" }}
        >
          <Icon name="photo" size={glyph} stroke={2} className="text-white" />
          <span
            className="absolute flex items-center justify-center rounded-full bg-white"
            style={{ width: pastille, height: pastille, right: decalage, bottom: decalage, boxShadow: "0 0 0 1px rgba(17,17,20,0.08), 0 2px 6px rgba(17,17,20,0.2)" }}
          >
            <Icon name="play" size={Math.round(pastille * 0.55)} fill="currentColor" stroke={1} style={{ color: "#E8358A" }} />
          </span>
        </span>
      );
    }
  }
}
