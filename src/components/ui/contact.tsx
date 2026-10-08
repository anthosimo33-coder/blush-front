import type { LevelId, Verdict } from "@/types";
import { Avatar } from "./Avatar";
import { scaleOf } from "./progress";

/**
 * Une personne comme un contact : son initiale dans l’anneau de votre niveau, le verdict en badge (comme Sophie sur
 * l’accueil). Sans niveau ni verdict (BLUSH lit encore la conv) : l’anneau vide, sans badge.
 */
export function ContactRing({ initial, level, emoji, size = 52 }: { initial: string; level: LevelId | null; emoji: Verdict["emoji"] | null; size?: number }) {
  const { levels, index } = level ? scaleOf(level) : { levels: [], index: -1 };
  const ring = 2 * Math.PI * 21;
  return (
    <span aria-hidden="true" className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="21" fill="none" stroke="#E6E3DC" strokeWidth="3.5" />
        {level && <circle cx="24" cy="24" r="21" fill="none" stroke="#12C08A" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(ring * (index + 1)) / levels.length} ${ring}`} />}
      </svg>
      <Avatar tone="elle" size={Math.round(size * 0.75)}>
        {initial}
      </Avatar>
      {emoji && (
        <span className="absolute -bottom-1 -right-1.5 flex size-[22px] items-center justify-center rounded-full bg-white text-[12px] leading-none shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_3px_8px_-3px_rgba(17,17,20,0.35)]">
          {emoji}
        </span>
      )}
    </span>
  );
}
