"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { PRENOM_MAX } from "@/lib/limites";
import { marquerJalon } from "@/lib/jalons";
import { messageErreur } from "@/lib/messages-erreur";
import { retenirSecrets } from "@/lib/secrets";
import { startAnalysis } from "@/services/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ChoiceTile, RadioGroup, SelectedCheck, type TileTone } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import type { IconName } from "@/components/ui/icons";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { ScreenTitle } from "@/components/shell/Screen";
import { GUESS_LABELS } from "@/contenu/parcours";
import { useJourney } from "@/state/journey";
import { aideDuPrenom, quiComplet, reponsesQui } from "@/state/parcours";
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

/** Un prénom à écrire (le tien, le sien) : le champ blanc, cerclé d’encre au focus. */
const CHAMP_PRENOM =
  "h-[60px] rounded-field bg-white px-[18px] text-accent font-extrabold text-ink shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_1px_2px_rgba(17,17,20,0.04)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]";

/* Écran 06 — Qui est qui, la devinette, ce que tu veux. */
/**
 * `captures` : la conv vient de captures (seules, sans export parmi ses morceaux), où l’utilisateur n’est que « Moi » (à
 * droite) : on lui demande son prénom.
 * `connecte` : déjà un compte (une autre conv) : pas d’écran email, la lecture part d’ici.
 */
export function QuiScreen({ people, captures = false, connecte = false }: { people: [Person, Person]; captures?: boolean; connecte?: boolean }) {
  /* Leurs prénoms (et leurs noms d’export, sous deux prénoms pareils) : masqués dans l’enregistrement des visites (src/lib/secrets.ts), retenus avant l’affichage */
  retenirSecrets(people.flatMap((p) => [p.name, p.detail?.split(" · ")[0]]));
  const router = useRouter();
  const [j, set] = useJourney();
  const [busy, setBusy] = useState(false);
  /* La lecture n’est pas partie : pourquoi, dit simplement (textes relus le 8 octobre) */
  const [problem, setProblem] = useState<string | null>(null);
  /* Les titres des trois groupes de tuiles, qui les nomment */
  const titres = { pronom: useId(), guess: useId(), goal: useId() };
  const goals = goalsFor(j.guess);
  /* L’autre : sur des captures, le second ; sur un export, celui que tu n’as pas choisi (personne tant que tu n’as pas choisi) */
  const autre = captures ? people[1] : j.me ? people.find((p) => p.id !== j.me) : undefined;
  /*
   * Son nom ne dit pas son prénom (doutePrenom, src/lib/participants.ts) : on le demande quand rien ne le dit (« Elle »,
   * un numéro, un compte supprimé), on propose de l’écrire devant un surnom (« Mon amour »)
   */
  const doute = autre?.nameCheck;
  const sonPrenom = doute === "unknown";
  /* Deux personnes au même prénom : chaque carte dit aussi son nom d’export et ses messages, et grandit pour eux */
  const details = people.some((p) => p.detail);
  const ready = quiComplet(j, { captures, sonPrenom });
  /* En passant à « On est ensemble » (ou l’inverse), un objectif qui n’existe plus de l’autre côté est décoché */
  const pickGuess = (guess: Guess) => set({ guess, goal: goalsFor(guess).some((g) => g.id === j.goal) ? j.goal : null });
  /* La conv reçue (un export, des captures), ou l’histoire réunie de ses morceaux (que /importer/ok montre aussi) */
  const back = j.capturesAdded ? "/importer/histoire" : "/importer/ok";
  /*
   * L’écran suivant, préparé pendant qu’on répond : l’email (statique, en entier). Pas /lecture (déjà connecté) : ses
   * gardes (layout.tsx) renvoient ici tant que la lecture n’est pas lancée, et le préchargement garderait ce renvoi, que
   * router.push suivrait après « Lancer la lecture »
   */
  useEffect(() => {
    if (!connecte) router.prefetch("/email");
  }, [router, connecte]);

  const next = async () => {
    marquerJalon("qui");
    if (!connecte) return router.push("/email");
    if (busy || !quiComplet(j, { captures, sonPrenom })) return;
    setBusy(true);
    setProblem(null);
    try {
      /*
       * Attendu avant d’ouvrir /lecture (sa page serveur lit « Qui es-tu ? »), puis repris tel quel par l’écran de lecture :
       * pas de second POST. Le bouton n’est actif qu’avec toutes les réponses (`ready`) : sur des captures, ton prénom
       * donne aussi `me`
       */
      await startAnalysis(reponsesQui(j, { captures }));
      marquerJalon("lecture");
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
            <Alert variant="carte" className="mb-3 text-center">
              {problem}
            </Alert>
          )}
          <Button arrow disabled={!ready || busy} loading={busy} loadingLabel="BLUSH commence la lecture" onClick={() => void next()}>
            {connecte ? "Lancer la lecture" : "Continuer"}
          </Button>
        </>
      }
    >
      {captures ? (
        <>
          {/* Absent des maquettes, relu le 8 octobre. Sur des captures, l’utilisateur est à droite : il ne reste que son prénom */}
          <label className="flex flex-col gap-2">
            <span className="text-legende font-black text-grey">{aideDuPrenom(people[1].name)}</span>
            <input
              value={j.prenom}
              onChange={(e) => set({ prenom: e.target.value, me: people[0].id })}
              autoComplete="given-name"
              maxLength={PRENOM_MAX}
              placeholder="Ton prénom"
              className={CHAMP_PRENOM}
            />
          </label>
        </>
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
                /* Changer de carte change l’autre : le prénom écrit pour l’autre d’avant s’efface (pas au premier choix, après un morceau ajouté) */
                onClick={() => set({ me: p.id, ...(j.me && !me ? { prenomAutre: "" } : {}) })}
                /* Hauteur fixe : avatar et prénom centrés dans la carte, « c’est moi » posé en bas sans rien décaler */
                className={cn(
                  "lift relative flex flex-1 flex-col items-center justify-center gap-2 rounded-[26px] bg-white px-3 text-ink",
                  details ? "h-[184px] pb-8" : "h-[156px] pb-4",
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
                <span className="text-carte font-black">{p.name}</span>
                {/* Le nom d’export entier et ses messages : jamais dans l’enregistrement des visites */}
                {p.detail && (
                  <span data-prive="" className="-mt-1 max-w-full truncate text-micro font-extrabold text-grey">
                    {p.detail}
                  </span>
                )}
                {me && <span className="absolute inset-x-0 bottom-3.5 text-center text-micro font-extrabold text-grey">c’est moi</span>}
              </button>
            );
          })}
        </RadioGroup>
      )}

      {/* Son nom ne dit pas son prénom : sans lui, tout le rapport l’appellerait « Elle », par un numéro, ou « Mon amour » */}
      {autre && doute && (
        <label className="flex flex-col gap-2">
          <span className="text-legende font-black text-grey">
            {doute === "unknown" ? "Son prénom (on ne l’a pas trouvé dans votre conv)" : `Son prénom (\u00ab\u00a0${autre.name}\u00a0\u00bb, c’est un surnom\u00a0?)`}
          </span>
          <input
            value={j.prenomAutre}
            onChange={(e) => set({ prenomAutre: e.target.value })}
            autoComplete="off"
            maxLength={PRENOM_MAX}
            placeholder="Son prénom"
            className={CHAMP_PRENOM}
          />
        </label>
      )}

      {/* Ton pronom seulement : celui de l’autre se lit dans la conv, ou se corrige sur sa fiche (src/server/accords.ts). Absent des maquettes, relu le 8 octobre */}
      <div id={titres.pronom} className="text-legende font-black text-grey">
        Tu es
      </div>
      <RadioGroup labelledBy={titres.pronom} className="flex gap-2.5">
        <ChoiceTile icon="user" tone="toi" label="Un garçon" selected={j.pronom === "il"} onClick={() => set({ pronom: "il" })} />
        <ChoiceTile icon="user" tone="elle" label="Une fille" selected={j.pronom === "elle"} onClick={() => set({ pronom: "elle" })} />
      </RadioGroup>

      <div id={titres.guess} className="text-legende font-black text-grey">
        Où vous en êtes, selon toi
      </div>
      <RadioGroup labelledBy={titres.guess} className="flex gap-2.5">
        {GUESSES.map((g) => (
          <ChoiceTile key={g.id} icon={g.icon} tone={g.tone} label={GUESS_LABELS[g.id].tile} selected={j.guess === g.id} onClick={() => pickGuess(g.id)} />
        ))}
      </RadioGroup>

      <div id={titres.goal} className="text-legende font-black text-grey">
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
