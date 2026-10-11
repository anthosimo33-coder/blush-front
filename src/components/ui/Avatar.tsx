import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AppKind } from "@/types";
import { Icon } from "./icons";

/* Avatars ronds avec reflet : bleu = toi, rose = elle, vert = la vérité. */
const AVATAR_BG = {
  toi: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), #3D8BFF",
  elle: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), #FF4F9A",
  vrai: "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 55%), #12C08A",
} as const;

export function Avatar({
  tone,
  size = 40,
  fontSize,
  children,
  className,
  style,
}: {
  tone: keyof typeof AVATAR_BG;
  size?: number;
  fontSize?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-black text-white", className)}
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[tone],
        boxShadow: tone === "vrai" ? "0 3px 8px -3px rgba(18,192,138,0.6)" : "inset 0 -2px 4px rgba(0,0,0,0.12), 0 3px 8px -3px rgba(17,17,20,0.3)",
        fontSize: fontSize ?? Math.round(size * 0.41),
        ...style,
      }}
    >
      {children}
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
      <span className="rounded-full" style={{ marginLeft: -Math.round(size / 4), boxShadow: "0 0 0 3px #FFFFFF" }}>
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
        <span aria-hidden="true" className={cls} style={{ ...box, background: `${GLOSS}, linear-gradient(180deg, #5BE584, #1FBF5B)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 14px -6px rgba(31,191,91,0.65)" }}>
          <Icon name="whatsapp" size={glyph} color="#FFFFFF" stroke={1.9} />
        </span>
      );
    case "imessage":
      return (
        <span aria-hidden="true" className={cls} style={{ ...box, background: "linear-gradient(180deg, #6EC1FF, #2F7BFF)" }}>
          <Icon name="imessage" size={glyph} color="#FFFFFF" fill="#FFFFFF" stroke={2} />
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
          <Icon name="instagram" size={glyph} color="#FFFFFF" stroke={2} />
        </span>
      );
    case "hinge":
      return (
        <span aria-hidden="true" className={cn(cls, "font-black text-white")} style={{ ...box, background: `${GLOSS}, #121214`, boxShadow: "0 6px 14px -6px rgba(17,17,20,0.55)", fontSize: Math.round(size * 0.43) }}>
          H
        </span>
      );
    case "autre":
      return (
        <span aria-hidden="true" className={cls} style={{ ...box, background: "#F1EFEA" }}>
          <span data-dots="" className="inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full bg-grey" />
            <span className="inline-block size-1.5 rounded-full bg-grey" />
            <span className="inline-block size-1.5 rounded-full" style={{ background: "var(--degrade-perle)" }} />
          </span>
        </span>
      );
  }
}
