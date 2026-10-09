"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { setForceSound } from "@/lib/sound";
import { ligneA } from "@/lib/vocal";
import { noterEcouteVocal } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Icon } from "@/components/ui/icons";
import type { VocalRapport } from "@/types";
import { bloquerDefilement } from "@/lib/defilement";

/*
 * Le vocal de BLUSH, en haut du rapport : une tuile, puis une story plein écran. Elle parle, les perles du logo
 * parlent avec elle, les sous-titres s’allument mot à mot et les messages qu’elle cite apparaissent en bulles.
 * En mode sobre : encre et papier seulement, pas de logo en volume, pas de punchline en couleur.
 * Textes relus le 8 octobre (voix de BLUSH).
 */

type Pret = Extract<VocalRapport, { etat: "pret" }>;
/** L’écran de fin : le verdict (ou le titre du mode sobre), et le bouton qui ramène au rapport. */
export type FinVocal = { emoji?: string; titre: string; sousTitre: string; action: string };

/* Les vocaux déjà écoutés (ce navigateur) : la tuile ne bouge plus pour eux */
const ECOUTES_KEY = "blush.vocal.ecoutes.v1";
function dejaEcoute(audio: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(ECOUTES_KEY) ?? "[]") as string[]).includes(audio);
  } catch {
    return true;
  }
}
function marquerEcoute(audio: string) {
  try {
    const l = JSON.parse(localStorage.getItem(ECOUTES_KEY) ?? "[]") as string[];
    if (!l.includes(audio)) localStorage.setItem(ECOUTES_KEY, JSON.stringify([...l, audio].slice(-20)));
  } catch {
    /* stockage indisponible : la tuile bougera encore la prochaine fois */
  }
}

export function VocalDuRapport({ vocal, titre, fin, ecrit, sobre = false }: { vocal: VocalRapport; titre: string; fin: FinVocal; ecrit: boolean; sobre?: boolean }) {
  if (vocal.etat === "en_cours") return <TuileEnregistre ecrit={ecrit} sobre={sobre} />;
  return <Lecteur vocal={vocal} titre={titre} fin={fin} sobre={sobre} />;
}

/* ———— La tuile ———— */

const FOND_TUILE = "radial-gradient(70% 120% at 18% 110%, rgba(232,53,138,0.55) 0%, rgba(232,53,138,0) 60%), linear-gradient(160deg, #2A2A30, #121214)";
const OMBRE_TUILE = "inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 34px -16px rgba(17,17,20,0.6)";

/** Pendant que BLUSH l’enregistre : le point rouge et une onde qui bouge. */
function TuileEnregistre({ ecrit, sobre }: { ecrit: boolean; sobre: boolean }) {
  return (
    <div role="status" className="flex items-center gap-3.5 rounded-card p-4 pl-3.5 text-white" style={{ background: sobre ? "#1B1B1F" : FOND_TUILE, boxShadow: OMBRE_TUILE }}>
      {!sobre && <BubbleLogo size={58} />}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[18px] font-black leading-tight">
          <span aria-hidden="true" data-vocal-rec="" className="mb-0.5 mr-2 inline-block size-[9px] rounded-full bg-[#FF5A60] align-middle" />
          BLUSH enregistre <span className="whitespace-nowrap">ton vocal</span>
        </span>
        <span className="text-[14px] font-extrabold text-white/75">{ecrit ? "Prêt avant ton rapport" : "Prêt dans quelques secondes"}</span>
        <span aria-hidden="true" className="mt-1 flex h-[22px] items-center gap-[3px]">
          {Array.from({ length: 26 }, (_, i) => (
            <span
              key={i}
              data-vocal-eq=""
              className="w-[3px] rounded-full bg-white/85"
              style={{ height: 8 + ((i * 7) % 5) * 3.5, animationDelay: `${((i * 37) % 9) / 10}s`, animationDuration: `${0.6 + ((i * 13) % 5) / 10}s` }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

/* ———— Le lecteur : la tuile, puis la story ———— */

function Lecteur({ vocal, titre, fin, sobre }: { vocal: Pret; titre: string; fin: FinVocal; sobre: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const debutNote = useRef(false);
  const [ouvert, setOuvert] = useState(false);
  const [joue, setJoue] = useState(false);
  const [termine, setTermine] = useState(false);
  const [t, setT] = useState(0);
  const [nouveau, setNouveau] = useState(false);
  /* Le son se charge (réseau lent) : le logo ne « parle » pas dans le vide. Le son ne vient pas (réseau coupé) : on le dit */
  const [attente, setAttente] = useState(false);
  const [coupe, setCoupe] = useState(false);
  /* Où en est l’écoute, pour la noter « fermée avant la fin » si on quitte la page (les états ne se lisent pas au démontage) */
  const enCours = useRef(false);
  useEffect(() => {
    enCours.current = ouvert && !termine;
  }, [ouvert, termine]);

  /* La tuile bouge tant que ce vocal n’a jamais été écouté (lu après le premier rendu : le stockage n’existe pas côté serveur) */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage local
    setNouveau(!dejaEcoute(vocal.audio));
  }, [vocal.audio]);

  /* Pendant la lecture, le temps suit l’audio à chaque image : les mots s’allument au bon moment */
  useEffect(() => {
    if (!joue) return;
    let raf = 0;
    const suivre = () => {
      if (audio.current) setT(audio.current.currentTime);
      raf = requestAnimationFrame(suivre);
    };
    raf = requestAnimationFrame(suivre);
    return () => cancelAnimationFrame(raf);
  }, [joue]);

  /* On quitte le rapport (ou la page) : l’écoute en cours est notée fermée, le son s’arrête, les sons de BLUSH retrouvent le mode silencieux */
  useEffect(() => {
    const quitter = () => {
      if (enCours.current && audio.current) noterEcouteVocal("ferme", audio.current.currentTime);
      enCours.current = false;
    };
    window.addEventListener("pagehide", quitter);
    return () => {
      window.removeEventListener("pagehide", quitter);
      quitter();
      audio.current?.pause();
      setForceSound(false);
    };
  }, []);

  /* L’élément audio naît dans le toucher (sinon Safari refuse de jouer) et lit le fichier au fil de l’eau */
  const lecteur = () => {
    /* Un élément en erreur ne repart pas : on en refait un (le réseau est peut-être revenu) */
    if (audio.current && !audio.current.error) return audio.current;
    const a = new Audio(vocal.audio);
    a.preload = "auto";
    a.onplay = () => setJoue(true);
    a.onpause = () => setJoue(false);
    a.onwaiting = a.onstalled = () => setAttente(true);
    a.onplaying = () => setAttente(false);
    a.onerror = () => {
      setJoue(false);
      setAttente(false);
      setCoupe(true);
      setForceSound(false);
    };
    a.onended = () => {
      setJoue(false);
      setTermine(true);
      setT(vocal.duree);
      setForceSound(false);
      noterEcouteVocal("fin", a.currentTime || vocal.duree);
    };
    audio.current = a;
    return a;
  };

  const jouer = (depuis?: number) => {
    setCoupe(false);
    const a = lecteur();
    if (depuis !== undefined) {
      a.currentTime = depuis;
      setT(depuis);
    }
    /* Comme une story : le vocal s’entend même quand le téléphone est en silencieux */
    setForceSound(true);
    a.play().catch(() => setJoue(false));
  };

  const ouvrir = () => {
    setOuvert(true);
    setTermine(false);
    marquerEcoute(vocal.audio);
    setNouveau(false);
    if (!debutNote.current) {
      debutNote.current = true;
      noterEcouteVocal("debut", 0);
    }
    jouer(0);
  };

  const fermer = () => {
    const a = audio.current;
    if (a && !termine) noterEcouteVocal("ferme", a.currentTime);
    enCours.current = false;
    a?.pause();
    setForceSound(false);
    setOuvert(false);
  };

  const basculer = () => {
    const a = lecteur();
    if (a.paused) jouer();
    else a.pause();
  };

  const reecouter = () => {
    setTermine(false);
    noterEcouteVocal("reecoute", 0);
    jouer(0);
  };

  const reculer = () => {
    const a = lecteur();
    a.currentTime = Math.max(0, a.currentTime - 5);
    setT(a.currentTime);
  };

  const duree = Math.max(1, Math.round(vocal.duree));
  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        data-vocal-nouveau={nouveau ? "" : undefined}
        aria-label={`Écouter le vocal de BLUSH, ${duree} secondes`}
        className="lift relative flex w-full items-center gap-3.5 overflow-hidden rounded-card p-4 pl-3.5 text-left text-white"
        style={{ background: sobre ? "linear-gradient(160deg, #2A2A30, #121214)" : FOND_TUILE, boxShadow: OMBRE_TUILE }}
      >
        {!sobre && <BubbleLogo size={58} />}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          {/* Sur un téléphone étroit, la coupure tombe avant « un vocal » */}
          <span className={cn("font-black leading-tight", sobre ? "text-[17px]" : "text-[19px] [@media(max-width:380px)]:text-[18px]")}>
            BLUSH t’a laissé <span className="whitespace-nowrap">un vocal</span>
          </span>
          <span className="text-[14px] font-extrabold text-white/75">{sobre ? "Écoute-le quand tu veux" : `Ton rapport en ${duree}\u00a0s`}</span>
        </span>
        <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-white">
          <Icon name="play" size={17} color="#121214" fill="#121214" stroke={0} className="translate-x-px" />
        </span>
      </button>
      {ouvert &&
        createPortal(
          <Story
            vocal={vocal}
            titre={titre}
            fin={fin}
            sobre={sobre}
            t={t}
            joue={joue && !attente}
            termine={termine}
            coupe={coupe}
            onFermer={fermer}
            onBasculer={basculer}
            onReculer={reculer}
            onReecouter={reecouter}
          />,
          document.body,
        )}
    </>
  );
}

/* ———— La story plein écran ———— */

function Story({
  vocal,
  titre,
  fin,
  sobre,
  t,
  joue,
  termine,
  coupe,
  onFermer,
  onBasculer,
  onReculer,
  onReecouter,
}: {
  vocal: Pret;
  titre: string;
  fin: FinVocal;
  sobre: boolean;
  t: number;
  joue: boolean;
  termine: boolean;
  /** Le son ne vient pas (réseau coupé) : on le dit, lecture le relance. */
  coupe: boolean;
  onFermer: () => void;
  onBasculer: () => void;
  onReculer: () => void;
  onReecouter: () => void;
}) {
  const principal = useRef<HTMLButtonElement>(null);
  /* La fermeture change à chaque rendu (le temps avance à chaque image) : l’effet ci-dessous la lit ici, sans se relancer */
  const fermer = useRef(onFermer);
  useEffect(() => {
    fermer.current = onFermer;
  }, [onFermer]);
  const k = ligneA(vocal.lignes, t);
  const ligne = vocal.lignes[k];
  const avant = k > 0 ? vocal.lignes[k - 1] : null;
  /* Le message cité reste à l’écran pendant sa ligne et un peu après */
  const recu = ligne?.recu && t >= ligne.debut + 0.3 ? ligne.recu : avant?.recu && t < avant.fin + 1.2 ? avant.recu : null;
  const cleRecu = recu === ligne?.recu ? k : k - 1;

  /* La page derrière ne défile plus ; Échap ferme ; la barre de Safari prend la couleur de la story */
  useEffect(() => {
    const liberer = bloquerDefilement();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const avantCouleur = meta?.content;
    if (meta) meta.content = sobre ? "#17171A" : "#0E0E10";
    principal.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer.current();
    };
    window.addEventListener("keydown", touche);
    return () => {
      liberer();
      if (meta && avantCouleur) meta.content = avantCouleur;
      window.removeEventListener("keydown", touche);
    };
  }, [sobre]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Le vocal de BLUSH"
      data-vocal-story=""
      className="fixed inset-0 z-[80] flex flex-col text-white"
      style={{
        background: sobre ? "#17171A" : "radial-gradient(90% 45% at 50% 105%, rgba(232,53,138,0.42) 0%, rgba(232,53,138,0) 70%), #0E0E10",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col">
        <div className="flex flex-col gap-1.5 px-4 pt-3">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/20">
            {/* Une échelle plutôt qu’une largeur : la barre avance sans recalculer la page à chaque image */}
            <div className="h-full w-full origin-left rounded-full bg-white" style={{ transform: `scaleX(${Math.min(1, t / vocal.duree)})` }} />
          </div>
          <div className="flex h-11 items-center gap-2">
            {!sobre && <BubbleLogo size={24} />}
            <span className="text-[15px] font-black">BLUSH</span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-white/60">{titre}</span>
            <button type="button" onClick={onFermer} aria-label="Fermer et revenir au rapport" className="-mr-2.5 flex size-11 items-center justify-center">
              <Icon name="close" size={22} color="#FFFFFF" stroke={2.6} />
            </button>
          </div>
        </div>

        {termine ? (
          <div data-vocal-pop="" className="flex min-h-0 flex-1 flex-col justify-end gap-3.5 px-6 pb-8 [@media(max-height:620px)]:pb-4">
            <div aria-hidden="true" className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {sobre ? <PerlesSobres /> : <BubbleLogo size={96} />}
            </div>
            {fin.emoji && (
              <span aria-hidden="true" className="text-[56px] leading-none">
                {fin.emoji}
              </span>
            )}
            <h2 className="m-0 text-[38px] font-black leading-[1.04] tracking-[-0.02em] [text-wrap:balance] [@media(max-height:620px)]:text-[30px]">{fin.titre}</h2>
            <p className="m-0 text-[18px] font-extrabold leading-[1.4] text-white/70">{fin.sousTitre}</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <button ref={principal} type="button" onClick={onFermer} className="h-14 rounded-[28px] bg-white text-[17px] font-black text-ink">
                {fin.action}
              </button>
              <button type="button" onClick={onReecouter} className="flex h-[52px] items-center justify-center gap-2 rounded-[26px] bg-white/10 text-[16px] font-black">
                <IconeReecoute />
                Réécouter
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col px-6">
              {/* Le logo prend la place qui reste : sur un petit écran, il rapetisse avant que les sous-titres ne débordent */}
              <div className="relative mt-2 flex max-h-[170px] min-h-0 flex-1 items-center justify-center overflow-hidden [@media(max-height:700px)]:[&>*]:scale-[0.7] [@media(max-height:620px)]:[&>*]:scale-[0.5]">
                {sobre ? (
                  <PerlesSobres />
                ) : (
                  <>
                    <span aria-hidden="true" data-vocal-halo="" className="absolute size-[190px] rounded-full" style={{ background: "radial-gradient(circle, rgba(255,125,186,0.35) 0%, rgba(255,125,186,0) 68%)" }} />
                    <span data-vocal-parle={joue ? "" : undefined} className="relative">
                      <BubbleLogo size={132} layered />
                    </span>
                  </>
                )}
              </div>
              <div className="flex min-h-[104px] shrink-0 flex-col justify-end [@media(max-height:700px)]:min-h-[78px]">
                {recu && (
                  <div key={cleRecu} data-vocal-pop="" className={cn("flex flex-col gap-1", recu.from === "toi" ? "items-end" : "items-start")}>
                    <span
                      className={cn(
                        "max-w-[260px] rounded-[19px] px-3.5 py-[9px] font-message text-[17px] font-medium leading-[1.3] [@media(max-height:700px)]:py-[7px] [@media(max-height:700px)]:text-[15px]",
                        recu.from === "toi" ? "bg-bubble-me" : "bg-[#2A2A30]",
                      )}
                    >
                      {recu.text}
                    </span>
                    {recu.caption && <span className="text-[12px] font-extrabold text-white/60">{recu.caption}</span>}
                  </div>
                )}
              </div>
              <p role={coupe ? "alert" : undefined} className={cn("m-0 mt-[22px] min-h-[22px] shrink-0 truncate text-[16px] font-extrabold leading-[1.35] [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:text-[14px]", coupe ? "text-white" : "text-white/45")}>
                {coupe ? "Le vocal ne charge pas. Vérifie ta connexion, puis relance-le." : avant?.texte}
              </p>
              {ligne && (
                <p
                  key={k}
                  className={cn(
                    "m-0 mt-2 shrink-0 font-black tracking-[-0.02em] [@media(max-height:700px)]:text-[27px] [@media(max-height:620px)]:text-[23px] [@media(max-width:340px)]:text-[26px]",
                    sobre ? "text-[30px] leading-[1.18]" : "text-[34px] leading-[1.1]",
                  )}
                >
                  <span className="sr-only" aria-live="polite">
                    {ligne.texte}
                  </span>
                  <span aria-hidden="true">
                    {ligne.mots.map((m, i) => (
                      <span key={i} className="transition-colors duration-100" style={{ color: t >= m.debut ? (ligne.punch && !sobre ? "#FF7DBA" : "#FFFFFF") : "rgba(255,255,255,0.26)" }}>
                        {m.t}{" "}
                      </span>
                    ))}
                  </span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-center gap-7 px-6 pb-8 pt-4 [@media(max-height:700px)]:pb-4 [@media(max-height:700px)]:pt-2">
              <button type="button" onClick={onReculer} aria-label="Revenir 5 secondes en arrière" className="flex size-12 items-center justify-center rounded-full bg-white/10">
                <IconeReecoute size={22} />
              </button>
              <button
                ref={principal}
                type="button"
                onClick={onBasculer}
                aria-label={joue ? "Mettre en pause" : "Reprendre le vocal"}
                className="flex size-[68px] items-center justify-center rounded-full bg-white [@media(max-height:620px)]:size-[60px]"
                style={{ boxShadow: sobre ? undefined : "0 12px 30px -10px rgba(255,125,186,0.6)" }}
              >
                {joue ? <Icon name="pause" size={22} color="#121214" stroke={3.2} /> : <Icon name="play" size={22} color="#121214" fill="#121214" stroke={0} className="translate-x-0.5" />}
              </button>
              <button type="button" onClick={onFermer} aria-label="Passer et lire le rapport" className="flex size-12 items-center justify-center rounded-full bg-white/10">
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 5l8 7-8 7M18 5v14" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IconeReecoute({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mode sobre : pas de logo en volume, trois points blancs qui respirent doucement. */
function PerlesSobres() {
  return (
    <span aria-hidden="true" data-vocal-respire="" className="flex items-center gap-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-4 rounded-full bg-white/85" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </span>
  );
}
