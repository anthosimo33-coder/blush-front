"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ChoiceTile, SelectedCheck } from "@/components/ui/controls";
import type { IconName } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { GUESS_LABELS } from "@/mocks/report";
import { useJourney } from "@/state/journey";
import type { Goal, Guess, Person } from "@/types";

const GUESSES: { id: Guess; icon: IconName; color: string }[] = [
  { id: "parle", icon: "imessage", color: "#3D8BFF" },
  { id: "vus", icon: "people", color: "#12C08A" },
  { id: "flou", icon: "cloud", color: "#9B7BFF" },
];

const GOALS: { id: Goal; label: string; icon: IconName; color: string }[] = [
  { id: "ensemble", label: "Qu’on soit ensemble", icon: "heart", color: "#FF4F9A" },
  { id: "reciproque", label: "Savoir si c’est réciproque", icon: "swap", color: "#3D8BFF" },
  { id: "comprendre", label: "Juste comprendre", icon: "eye", color: "#FFAA2C" },
];

/* Écran 06 — Qui est qui, la devinette, ce que tu veux. */
export function QuiScreen({ people }: { people: [Person, Person] }) {
  const router = useRouter();
  const [j, set] = useJourney();
  const ready = !!(j.me && j.guess && j.goal);
  const back = j.capturesAdded ? "/importer/histoire" : j.exportFileName ? "/importer/ok" : "/importer/captures";

  return (
    <Screen
      mobileTop={<MobileTopBar back={back} progress={2} />}
      desktopBack={{ target: back }}
      aside={<FlowSteps step={2} />}
      contentGap={12}
      head={<ScreenTitle size={30}>Qui es-tu dans cette conv ?</ScreenTitle>}
      footer={
        <Button arrow disabled={!ready} onClick={() => router.push("/email")}>
          Continuer
        </Button>
      }
    >

      <div role="radiogroup" aria-label="Qui es-tu dans cette conv ?" className="flex gap-3">
        {people.map((p, i) => {
          const me = j.me === p.id;
          /* Bleu = toi, rose = elle : la couleur suit le rôle choisi. */
          const tone = j.me ? (me ? "toi" : "elle") : i === 0 ? "toi" : "elle";
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={me}
              onClick={() => set({ me: p.id })}
              /* Hauteur fixe : avatar et prénom centrés dans la carte, « c’est moi » posé en bas sans rien décaler */
              className={cn(
                "lift relative flex h-[156px] flex-1 flex-col items-center justify-center gap-2 rounded-[26px] bg-white px-3 pb-4 text-ink",
                me ? "shadow-selected" : "shadow-soft",
              )}
            >
              {me && (
                <span className="absolute right-3 top-3">
                  <SelectedCheck />
                </span>
              )}
              <Avatar tone={tone} size={58} fontSize={24} className="lift-pop">
                {p.initial}
              </Avatar>
              <span className="text-[18px] font-black">{p.name}</span>
              {me && <span className="absolute inset-x-0 bottom-3.5 text-center text-[12px] font-extrabold text-grey">c’est moi</span>}
            </button>
          );
        })}
      </div>

      <div id="guess-label" className="text-[13px] font-black text-grey">
        Où vous en êtes, selon toi
      </div>
      <div role="radiogroup" aria-labelledby="guess-label" className="flex gap-2.5">
        {GUESSES.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} color={g.color} label={GUESS_LABELS[g.id].tile} selected={j.guess === g.id} onClick={() => set({ guess: g.id })} />
        ))}
      </div>

      <div id="goal-label" className="text-[13px] font-black text-grey">
        Ce que tu veux
      </div>
      <div role="radiogroup" aria-labelledby="goal-label" className="flex gap-2.5">
        {GOALS.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} color={g.color} label={g.label} selected={j.goal === g.id} onClick={() => set({ goal: g.id })} />
        ))}
      </div>
    </Screen>
  );
}
