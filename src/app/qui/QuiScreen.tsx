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
  { id: "ensemble", icon: "heart", color: "#FF4F9A" },
];

type GoalTile = { id: Goal; label: string; icon: IconName; color: string };

/* Ce que tu veux : avant d’être ensemble, ou en couple. ⚠ Objectifs en couple absents des maquettes : à valider. */
const GOALS: GoalTile[] = [
  { id: "ensemble", label: "Qu’on soit ensemble", icon: "heart", color: "#FF4F9A" },
  { id: "reciproque", label: "Savoir si c’est réciproque", icon: "swap", color: "#3D8BFF" },
  { id: "comprendre", label: "Juste comprendre", icon: "eye", color: "#FFAA2C" },
];
const COUPLE_GOALS: GoalTile[] = [
  { id: "mieux", label: "Que ça aille mieux", icon: "bolt", color: "#FF4F9A" },
  { id: "point", label: "Savoir où on en est", icon: "swap", color: "#3D8BFF" },
  { id: "comprendre", label: "Juste comprendre", icon: "eye", color: "#FFAA2C" },
];
const goalsFor = (guess: Guess | null) => (guess === "ensemble" ? COUPLE_GOALS : GOALS);

/* Écran 06 — Qui est qui, la devinette, ce que tu veux. */
/** `captures` : la conv vient de captures, où l’utilisateur n’est que « Moi » (à droite) : on lui demande son prénom. */
export function QuiScreen({ people, captures = false }: { people: [Person, Person]; captures?: boolean }) {
  const router = useRouter();
  const [j, set] = useJourney();
  const goals = goalsFor(j.guess);
  const ready = !!((captures ? j.prenom.trim() : j.me) && j.pronom && j.guess && j.goal);
  /* En passant à « On est ensemble » (ou l’inverse), un objectif qui n’existe plus de l’autre côté est décoché */
  const pickGuess = (guess: Guess) => set({ guess, goal: goalsFor(guess).some((g) => g.id === j.goal) ? j.goal : null });
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

      {captures ? (
        /* ⚠ Absent des maquettes : à valider. Sur des captures, l’utilisateur est à droite : il ne reste que son prénom */
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-black text-grey">Ton prénom (sur tes captures avec {people[1].name}, tu es à droite)</span>
          <input
            value={j.prenom}
            onChange={(e) => set({ prenom: e.target.value, me: people[0].id })}
            autoComplete="given-name"
            maxLength={40}
            placeholder="Ton prénom"
            className="h-[60px] rounded-field bg-white px-[18px] text-[17px] font-extrabold text-ink shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_1px_2px_rgba(17,17,20,0.04)] outline-none focus:shadow-[inset_0_0_0_2px_#121214]"
          />
        </label>
      ) : (
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
      )}

      {/* BLUSH accompagne un garçon qui parle à une fille, ou l’inverse. ⚠ Absent des maquettes : à valider */}
      <div id="pronom-label" className="text-[13px] font-black text-grey">
        Tu es
      </div>
      <div role="radiogroup" aria-labelledby="pronom-label" className="flex gap-2.5">
        <ChoiceTile icon="user" color="#3D8BFF" label="Un garçon" selected={j.pronom === "il"} onClick={() => set({ pronom: "il" })} />
        <ChoiceTile icon="user" color="#FF4F9A" label="Une fille" selected={j.pronom === "elle"} onClick={() => set({ pronom: "elle" })} />
      </div>

      <div id="guess-label" className="text-[13px] font-black text-grey">
        Où vous en êtes, selon toi
      </div>
      <div role="radiogroup" aria-labelledby="guess-label" className="flex gap-2.5">
        {GUESSES.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} color={g.color} label={GUESS_LABELS[g.id].tile} selected={j.guess === g.id} onClick={() => pickGuess(g.id)} />
        ))}
      </div>

      <div id="goal-label" className="text-[13px] font-black text-grey">
        Ce que tu veux
      </div>
      <div role="radiogroup" aria-labelledby="goal-label" className="flex gap-2.5">
        {goals.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} color={g.color} label={g.label} selected={j.goal === g.id} onClick={() => set({ goal: g.id })} />
        ))}
      </div>
    </Screen>
  );
}
