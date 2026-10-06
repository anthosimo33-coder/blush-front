import Link from "next/link";
import { cn } from "@/lib/cn";
import { BubbleLogo } from "./objects3d";

/** Logo officiel : la bulle rose en volume suivie de « blush » en minuscules, Nunito 900. */
export function Logo({
  size = 32,
  fontSize = 22,
  onInk = false,
  animated = false,
  href,
  className,
}: {
  size?: number;
  fontSize?: number;
  onInk?: boolean;
  animated?: boolean;
  href?: string;
  className?: string;
}) {
  const mark = (
    <span
      className={cn("inline-flex items-center gap-2 font-black", onInk ? "text-white" : "text-ink", className)}
      style={{ fontSize, letterSpacing: "-0.03em" }}
    >
      <BubbleLogo size={size} animated={animated} />
      blush
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label="blush, accueil" className="relative block no-underline after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']">
      {mark}
    </Link>
  );
}
