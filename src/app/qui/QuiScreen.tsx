"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { PRENOM_MAX } from "@/lib/limites";
import { messageErreur } from "@/lib/messages-erreur";
import { startAnalysis } from "@/services/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { ChoiceTile, RadioGroup, SelectedCheck, type TileTone } from "@/components/ui/controls";
import type { IconName } from "@/components/ui/icons";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { ScreenTitle } from "@/components/shell/Screen";
import { GUESS_LABELS } from "@/contenu/parcours";
import { useJourney } from "@/state/journey";
import { quiComplet, reponsesQui } from "@/state/parcours";
import { retenirLecture } from "@/state/lecture";
import type { Goal, Guess, Person } from "@/types";

const GUESSES: { id: Guess; icon: IconName; tone: TileTone }[] = [
  { id: "parle", icon: "imessage", tone: "toi" },
  { id: "vus", icon: "people", tone: "vrai" },
  { id: "flou", icon: "cloud", tone: "flou" },
  { id: "ensemble", icon: "heart", tone: "elle" },
];

type GoalTile = { id: Goal; label: string; icon: IconName; tone: TileTone };

/* Ce que tu veux : avant d’être ensemble, ou en couple. Objectifs en couple absents des maquettes, relus le 8 octobre. */
const GOALS: GoalTile[] = [
  { id: "ensemble", label: "Qu’on soit ensemble", icon: "heart", tone: "elle" },
  { id: "reciproque", label: "Savoir si c’est réciproque", icon: "swap", tone: "toi" },
  { id: "comprendre", label: "Juste comprendre", icon: "eye", tone: "attente" },
];
const COUPLE_GOALS: GoalTile[] = [
  { id: "mieux", label: "Que ça aille mieux", icon: "bolt", tone: "elle" },
  { id: "point", label: "Savoir où on en est", icon: "swap", tone: "toi" },
  { id: "comprendre", label: "Juste comprendre", icon: "eye", tone: "attente" },
];
const goalsFor = (guess: Guess | null) => (guess === "ensemble" ? COUPLE_GOALS : GOALS);

/* Écran 06 — Qui est qui, la devinette, ce que tu veux. */
/**
 * `captures` : la conv vient de captures, où l’utilisateur n’est que « Moi » (à droite) : on lui demande son prénom.
 * `connecte` : déjà un compte (une autre conv) : pas d’écran email, la lecture part d’ici.
 */
export function QuiScreen({ people, captures = false, connecte = false }: { people: [Person, Person]; captures?: boolean; connecte?: boolean }) {
  const router = useRouter();
  const [j, set] = useJourney();
  const [busy, setBusy] = useState(false);
  /* La lecture n’est pas partie : pourquoi, dit simplement (textes relus le 8 octobre) */
  const [problem, setProblem] = useState<string | null>(null);
  /* Les titres des trois groupes de tuiles, qui les nomment */
  const titres = { pronom: useId(), guess: useId(), goal: useId() };
  const goals = goalsFor(j.guess);
  const ready = quiComplet(j, { captures });
  /* En passant à « On est ensemble » (ou l’inverse), un objectif qui n’existe plus de l’autre côté est décoché */
  const pickGuess = (guess: Guess) => set({ guess, goal: goalsFor(guess).some((g) => g.id === j.goal) ? j.goal : null });
  /* Arrivé sans le parcours de cet onglet (importée dans un autre, puis ouverte par une connexion) : d’après la conv */
  const back = j.capturesAdded ? "/importer/histoire" : j.exportFileName ? "/importer/ok" : captures ? "/importer/captures" : "/importer/ok";
  /*
   * L’écran suivant, préparé pendant qu’on répond : l’email (statique, en entier). Pas /lecture (déjà connecté) : ses
   * gardes (layout.tsx) renvoient ici tant que la lecture n’est pas lancée, et le préchargement garderait ce renvoi, que
   * router.push suivrait après « Lancer la lecture »
   */
  useEffect(() => {
    if (!connecte) router.prefetch("/email");
  }, [router, connecte]);

  const next = async () => {
    if (!connecte) return router.push("/email");
    if (busy || !quiComplet(j, { captures })) return;
    setBusy(true);
    setProblem(null);
    try {
      /*
       * Attendu avant d’ouvrir /lecture (sa page serveur lit « Qui es-tu ? »), puis repris tel quel par l’écran de lecture :
       * pas de second POST. Le bouton n’est actif qu’avec toutes les réponses (`ready`) : sur des captures, ton prénom
       * donne aussi `me`
       */
      await startAnalysis(reponsesQui(j, { captures }));
      retenirLecture();
      router.push("/lecture");
    } catch (e) {
      setProblem(messageErreur("lecture", e));
      setBusy(false);
    }
  };

  return (
    <ParcoursScreen
      step={2}
      back={back}
      contentGap={12}
      head={<ScreenTitle size={30}>Qui es-tu dans cette conv{NBSP}?</ScreenTitle>}
      footer={
        <>
          {problem && (
            <p role="alert" className="m-0 mb-3 rounded-[16px] bg-white px-4 py-3 text-center text-[14px] font-extrabold leading-[1.4] text-[#D93036] shadow-card">
              {problem}
            </p>
          )}
          <Button arrow={!busy} disabled={!ready || busy} aria-busy={busy} onClick={next}>
            {busy ? <TypingDots color="#FFFFFF" label="BLUSH commence la lecture" /> : connecte ? "Lancer la lecture" : "Continuer"}
          </Button>
        </>
      }
    >

      {captures ? (
        /* Absent des maquettes, relu le 8 octobre. Sur des captures, l’utilisateur est à droite : il ne reste que son prénom */
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-black text-grey">Ton prénom (sur tes captures avec {people[1].name}, tu es à droite)</span>
          <input
            value={j.prenom}
            onChange={(e) => set({ prenom: e.target.value, me: people[0].id })}
            autoComplete="given-name"
            maxLength={PRENOM_MAX}
            placeholder="Ton prénom"
            className="h-[60px] rounded-field bg-white px-[18px] text-[17px] font-extrabold text-ink shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_1px_2px_rgba(17,17,20,0.04)] outline-none focus:shadow-[inset_0_0_0_2px_#121214]"
          />
        </label>
      ) : (
      <RadioGroup label={"Qui es-tu dans cette conv\u00a0?"} className="flex gap-3">
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
      </RadioGroup>
      )}

      {/* BLUSH accompagne un garçon qui parle à une fille, ou l’inverse. Absent des maquettes, relu le 8 octobre */}
      <div id={titres.pronom} className="text-[13px] font-black text-grey">
        Tu es
      </div>
      <RadioGroup labelledBy={titres.pronom} className="flex gap-2.5">
        <ChoiceTile icon="user" tone="toi" label="Un garçon" selected={j.pronom === "il"} onClick={() => set({ pronom: "il" })} />
        <ChoiceTile icon="user" tone="elle" label="Une fille" selected={j.pronom === "elle"} onClick={() => set({ pronom: "elle" })} />
      </RadioGroup>

      <div id={titres.guess} className="text-[13px] font-black text-grey">
        Où vous en êtes, selon toi
      </div>
      <RadioGroup labelledBy={titres.guess} className="flex gap-2.5">
        {GUESSES.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} tone={g.tone} label={GUESS_LABELS[g.id].tile} selected={j.guess === g.id} onClick={() => pickGuess(g.id)} />
        ))}
      </RadioGroup>

      <div id={titres.goal} className="text-[13px] font-black text-grey">
        Ce que tu veux
      </div>
      <RadioGroup labelledBy={titres.goal} className="flex gap-2.5">
        {goals.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} tone={g.tone} label={g.label} selected={j.goal === g.id} onClick={() => set({ goal: g.id })} />
        ))}
      </RadioGroup>
    </ParcoursScreen>
  );
}
