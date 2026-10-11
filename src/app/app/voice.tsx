"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { arreterLeVocal, chargerEnMemoire, creerAudioContext, setRecording, useLecteurAudio } from "@/lib/audio";
import { cn } from "@/lib/cn";
import { auRepos } from "@/lib/repos";
import { tracer } from "@/lib/tracer";
import { Icon } from "@/components/ui/icons";

/*
 * Les vocaux du chat : on enregistre avec le micro, on voit l’onde bouger, on envoie ou on jette.
 * Tout reste dans le navigateur (aucun envoi réseau) : le vocal part ensuite par la couche de service.
 */

export type VoiceClip = { url: string; blob: Blob; seconds: number; peaks: number[] };
export type VoiceError = "denied" | "unsupported";

/** Au-delà, le vocal part tout seul. */
const MAX_SECONDS = 120;
/**
 * Le débit demandé à l’enregistreur (S-15). Chromium le suit : la voix y reste nette, et un vocal de 2 minutes pèse
 * environ 500 ko (au lieu de 2 Mo à ses 128 kb/s par défaut). Mais rien n’oblige un navigateur à le suivre : le WebKit
 * de Playwright (26.6, le moteur de Safari) l’accepte, l’annonce, puis encode en AAC à un débit qui ne dépend que du son
 * (de 33 à 169 kb/s mesurés, environ 2,5 Mo pour 2 minutes de bruit) ; et un navigateur qui refuse l’option enregistre
 * à son débit par défaut (`enregistreur`). Les 500 ko ne valent donc que là où l’option est suivie : la borne du
 * serveur, c’est la durée du vocal (environ 130 s), et sa taille maximale doit couvrir 130 s au débit par défaut
 * (environ 3,1 Mo à 192 kb/s), pas 130 s à 32 kb/s. tests/e2e/chat-vocal.spec.ts mesure le débit sur les deux
 * navigateurs.
 * TODO(produit): 32 kb/s ; la taille maximale du serveur (TAILLE_VOCAL_MAX, environ 3,1 Mo) ne descend pas plus bas
 * tant que le débit réel d’un vocal de 2 minutes sur un vrai iPhone (Safari et l’appli installée) n’est pas mesuré.
 */
const DEBIT_VOCAL = 32_000;
/** Nombre de barres de l’onde, pendant l’enregistrement et dans la bulle. */
const LIVE_BARS = 34;
const NOTE_BARS = 28;

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  ctx: AudioContext | null;
  started: number;
  chunks: Blob[];
  all: number[];
  raf: number;
  timer: number;
};

/** Ce que l’enregistrement montre en direct : le temps écoulé (à la seconde) et les derniers niveaux du micro. */
type Ecoute = { seconds: number; levels: readonly number[] };

/**
 * Le direct d’un enregistrement : la dernière valeur, et l’abonnement à ses changements (useSyncExternalStore). Les
 * niveaux changent environ 14 fois par seconde : seuls ceux qui les montrent se refont (la barre d’enregistrement,
 * RecordingBar) ou les suivent hors de React (les perles du logo, accueil/Composer.tsx), pas l’écran qui tient
 * l’enregistreur.
 */
export type EcouteEnDirect = { lire: () => Ecoute; abonner: (suivre: () => void) => () => void };

/** Le direct quand rien ne s’enregistre : zéro seconde, aucun niveau. */
const SILENCE: Ecoute = { seconds: 0, levels: [] };

function creerEcoute() {
  let valeur = SILENCE;
  const abonnes = new Set<() => void>();
  return {
    lire: () => valeur,
    abonner: (suivre: () => void) => {
      abonnes.add(suivre);
      return () => void abonnes.delete(suivre);
    },
    poser: (v: Ecoute) => {
      if (v === valeur) return;
      valeur = v;
      abonnes.forEach((suivre) => suivre());
    },
  };
}

/**
 * L’enregistreur au débit de la voix (DEBIT_VOCAL). Un navigateur qui refuse l’option enregistre à son débit par
 * défaut (souvent 128 à 192 kb/s) : le vocal part quand même, tant que le serveur l’accepte à ce débit-là. Le format,
 * lui, reste celui du navigateur : le serveur ne lit que WebM ou Ogg en Opus et MP4 en AAC (src/server/ia/duree-audio.ts).
 * Un mimeType fixé ici (audio/mp4;codecs=opus, par exemple) doit d’abord y être lisible, sinon chaque vocal serait refusé.
 */
function enregistreur(stream: MediaStream) {
  try {
    return new MediaRecorder(stream, { audioBitsPerSecond: DEBIT_VOCAL });
  } catch (e) {
    tracer("vocal:debit", e);
    return new MediaRecorder(stream);
  }
}

function formatClock(s: number) {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * L’enregistreur. `start` demande le micro (le navigateur pose la question la première fois),
 * `stop(true)` rend le vocal, `stop(false)` le jette.
 */
export function useVoiceRecorder({ onError, onLimit }: { onError: (e: VoiceError) => void; onLimit: () => void }) {
  const [phase, setPhase] = useState<"idle" | "starting" | "recording">("idle");
  /* Le temps et les niveaux : hors de l’état de l’écran, qui ne se refait qu’aux changements de phase */
  const [ecoute] = useState(creerEcoute);
  const session = useRef<Session | null>(null);
  /* L’écran est-il toujours là ? Le micro s’ouvre après un temps : si on a quitté l’écran entre-temps, on le referme */
  const monte = useRef(true);
  const handlers = useRef({ onError, onLimit });

  useEffect(() => {
    handlers.current = { onError, onLimit };
  }, [onError, onLimit]);

  /* On coupe le micro si on quitte l’écran en plein enregistrement */
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
      const s = session.current;
      if (!s) return;
      if (s.recorder.state !== "inactive") s.recorder.stop();
      release(s);
      session.current = null;
    };
  }, []);

  const start = async () => {
    if (phase !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      handlers.current.onError("unsupported");
      return;
    }
    setPhase("starting");
    /* Un vocal qui joue (de BLUSH ou le tien) s’arrête : on ne s’enregistre pas par-dessus */
    arreterLeVocal();
    /* Safari doit pouvoir ouvrir le micro : les sons de BLUSH lui rendent la session audio le temps du vocal */
    setRecording(true);
    /* Le contexte audio naît pendant le toucher : sur iPhone, sinon, il reste muet */
    const ctx = creerAudioContext();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      /* Refusé, ou pas de micro (NotAllowedError, NotFoundError) : la conv le dit, la console garde lequel */
      tracer("vocal:micro", e);
      fermerAudio(ctx);
      setRecording(false);
      setPhase("idle");
      handlers.current.onError("denied");
      return;
    }
    /* L’écran a été quitté pendant que le micro s’ouvrait : on le referme tout de suite, rien ne s’enregistre */
    if (!monte.current) {
      stream.getTracks().forEach((t) => t.stop());
      fermerAudio(ctx);
      setRecording(false);
      return;
    }
    let recorder: MediaRecorder;
    try {
      recorder = enregistreur(stream);
    } catch (e) {
      tracer("vocal:enregistreur", e);
      stream.getTracks().forEach((t) => t.stop());
      fermerAudio(ctx);
      setRecording(false);
      setPhase("idle");
      handlers.current.onError("unsupported");
      return;
    }
    const s: Session = { recorder, stream, ctx, started: performance.now(), chunks: [], all: [], raf: 0, timer: 0 };
    recorder.ondataavailable = (e) => {
      if (e.data.size) s.chunks.push(e.data);
    };
    /* L’onde : le volume du micro, relevé environ 14 fois par seconde */
    if (ctx) {
      try {
        ctx.resume().catch((e) => tracer("vocal:reprise", e));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          if (t - last > 70) {
            last = t;
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += ((v - 128) / 128) ** 2;
            const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.4);
            s.all.push(level);
            const avant = ecoute.lire();
            ecoute.poser({ ...avant, levels: [...avant.levels.slice(1 - LIVE_BARS), level] });
          }
          s.raf = requestAnimationFrame(tick);
        };
        s.raf = requestAnimationFrame(tick);
      } catch (e) {
        /* Pas de niveaux : l’onde reste calme, l’enregistrement continue */
        tracer("vocal:niveaux", e);
      }
    }
    /* Le temps affiché ne change qu’une fois par seconde : entre deux, rien à refaire */
    let affichee = 0;
    s.timer = window.setInterval(() => {
      const secs = (performance.now() - s.started) / 1000;
      if (Math.floor(secs) !== affichee) ecoute.poser({ ...ecoute.lire(), seconds: (affichee = Math.floor(secs)) });
      if (secs >= MAX_SECONDS) handlers.current.onLimit();
    }, 200);
    /* Par tranches de 250 ms : Safari livre le son au fil de l’eau (à l’arrêt seul, il peut ne rien rendre) */
    recorder.start(250);
    session.current = s;
    ecoute.poser(SILENCE);
    setPhase("recording");
  };

  /** Rend le vocal, `null` s’il est jeté (ou trop court), ou "empty" si le micro n’a rien capté. */
  const stop = (keep: boolean) =>
    new Promise<VoiceClip | "empty" | null>((resolve) => {
      const s = session.current;
      if (!s) return resolve(null);
      session.current = null;
      const secs = (performance.now() - s.started) / 1000;
      const done = () => {
        release(s);
        setPhase("idle");
        ecoute.poser(SILENCE);
        const blob = new Blob(s.chunks, { type: s.recorder.mimeType || "audio/mp4" });
        /* Un toucher trop court (moins d’une demi-seconde) ne fait pas de vocal */
        if (!keep || secs < 0.5) return resolve(null);
        if (blob.size === 0) return resolve("empty");
        resolve({ url: URL.createObjectURL(blob), blob, seconds: Math.max(1, Math.round(secs)), peaks: resample(s.all, NOTE_BARS) });
      };
      if (s.recorder.state === "inactive") return done();
      s.recorder.onstop = done;
      try {
        s.recorder.requestData();
      } catch (e) {
        /* Rien à demander : l’arrêt livrera le reste */
        tracer("vocal:donnees", e);
      }
      s.recorder.stop();
    });

  /** Le temps et les niveaux en direct, par abonnement (RecordingBar, les perles du logo) : qui les lit ne les écrit pas. */
  const direct: EcouteEnDirect = ecoute;
  return { phase, ecoute: direct, start, stop };
}

/** Le contexte audio de l’onde, refermé ; un refus (déjà fermé) se trace sans gêner la suite. */
function fermerAudio(ctx: AudioContext | null | undefined) {
  ctx?.close().catch((e) => tracer("vocal:fermeture", e));
}

function release(s: Session) {
  cancelAnimationFrame(s.raf);
  clearInterval(s.timer);
  s.stream.getTracks().forEach((t) => t.stop());
  fermerAudio(s.ctx);
  setRecording(false);
}

/** Ramène tous les niveaux relevés à `n` barres (le plus fort de chaque tranche). */
function resample(levels: number[], n: number) {
  if (levels.length === 0) return Array.from({ length: n }, () => 0.2);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * levels.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    return Math.max(0.12, ...levels.slice(a, b));
  });
}

/**
 * Pendant l’enregistrement : le point rouge, le temps, l’onde qui bouge, et le bouton pour envoyer. Abonnée au direct de
 * l’enregistreur, elle seule se refait à chaque relevé du micro.
 */
export function RecordingBar({ ecoute, onSend }: { ecoute: EcouteEnDirect; onSend: () => void }) {
  const { seconds, levels } = useSyncExternalStore(ecoute.abonner, ecoute.lire, ecoute.lire);
  const bars = [...Array.from({ length: Math.max(0, LIVE_BARS - levels.length) }, () => 0), ...levels];
  return (
    <>
      <span className="sr-only" role="status">
        Enregistrement du vocal en cours
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
        <span className="w-[38px] text-detail font-black tabular-nums text-ink">{formatClock(seconds)}</span>
      </span>
      <span aria-hidden="true" data-onde="" className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
        {bars.map((l, i) => (
          /* Une échelle plutôt qu’une hauteur : 14 fois par seconde pendant l’enregistrement, sans recalculer la page */
          <span key={i} className="h-[25px] w-[3px] shrink-0 rounded-full bg-ink transition-transform duration-75" style={{ transform: `scaleY(${(3 + l * 22) / 25})`, opacity: l === 0 ? 0.18 : 0.85 }} />
        ))}
      </span>
      <button type="button" onClick={onSend} aria-label="Envoyer le vocal" data-popin="" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink">
        <Icon name="arrow" size={17} stroke={2.8} className="-rotate-90 text-white" />
      </button>
    </>
  );
}

/** Le vocal envoyé, dans ta bulle bleue : lecture, onde (la partie écoutée s’éclaire) et durée. */
export function VoiceNote({ clip }: { clip: Pick<VoiceClip, "url" | "seconds" | "peaks"> }) {
  /* Arrêté d’ailleurs (un autre vocal lancé, un enregistrement) : le bouton revient sur lecture. Au bout, l’onde se rallume du début */
  const { joue: playing, temps, duree, basculer: toggle, poserTemps } = useLecteurAudio({ source: () => clip.url, suivreTemps: true, surFin: () => poserTemps(0) });
  const progress = temps / (duree ?? clip.seconds);

  return (
    <span className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre ton vocal en pause" : `Écouter ton vocal (${formatClock(clip.seconds)})`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white"
      >
        {playing ? <Icon name="pause" size={15} stroke={3.2} className="text-toi-ink" /> : <Icon name="play" size={15} fill="currentColor" stroke={0} className="translate-x-px text-toi-ink" />}
      </button>
      <span aria-hidden="true" className="flex h-7 items-center gap-[2px]">
        {clip.peaks.map((p, i) => (
          <span key={i} className={cn("w-[3px] rounded-full", (i + 0.5) / clip.peaks.length <= progress ? "bg-white" : "bg-white/50")} style={{ height: 4 + p * 22 }} />
        ))}
      </span>
      <span className="text-legende font-black tabular-nums text-white/90">{formatClock(clip.seconds)}</span>
    </span>
  );
}

/* Les vocaux de BLUSH à l’écran : chacun se demande, quand un autre arrive, s’il est encore le dernier de la conv */
const vocauxDuChat = new Set<() => void>();

/**
 * La réponse de BLUSH dite en vocal, dans sa bulle blanche : le bouton rose, l’onde (la partie écoutée en rose) et la
 * durée. Comme une story, elle s’entend même quand le téléphone est en silencieux.
 */
export function VocalBlush({ vocal }: { vocal: { audio: string; duree: number; peaks: number[] } }) {
  /* Le son déjà en mémoire (plus bas) : l’élément audio, né au toucher (sinon Safari refuse de jouer), part de lui */
  const enMemoire = useRef<string | null>(null);
  /* Au bout, l’onde se rallume du début ; en pause (à la main, ou par un autre vocal), les sons de l’appli reviennent en « ambient » */
  const {
    element: audio,
    joue: playing,
    temps: t,
    basculer: toggle,
    poserTemps,
  } = useLecteurAudio({ source: (refait) => (!refait && enMemoire.current) || vocal.audio, forcerSon: true, suivreTemps: true, surFin: () => poserTemps(0) });

  /*
   * La dernière réponse vocale de la conv (la plus bas), préparée en mémoire avant le toucher dès qu’elle est à l’écran,
   * comme le vocal du rapport (jamais sur le disque : l’audio reste « no-store »). Au toucher, l’élément audio part d’elle,
   * sans attendre le réseau. Une réponse vocale plus récente la libère (sauf si elle a déjà servi) ; les plus anciennes
   * se lisent sur le réseau.
   */
  const bulle = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let arret: AbortController | null = null;
    let annuler = () => {};
    let vue = false;
    const liberer = () => {
      annuler();
      annuler = () => {};
      arret?.abort();
      arret = null;
      if (enMemoire.current) URL.revokeObjectURL(enMemoire.current);
      enMemoire.current = null;
    };
    const revoir = () => {
      /* Déjà lu : l’élément audio garde ce qu’il a */
      if (audio.current) return;
      const tous = document.querySelectorAll("[data-vocal-blush]");
      const dernier = !!bulle.current && tous[tous.length - 1] === bulle.current;
      if (!dernier) return liberer();
      if (arret || !vue) return;
      const a = (arret = new AbortController());
      annuler = auRepos(() => {
        void chargerEnMemoire(vocal.audio, a.signal).then((url) => {
          if (!url) return;
          /* Lu entre-temps, sur le réseau : la mémoire ne servira plus */
          if (audio.current) URL.revokeObjectURL(url);
          else enMemoire.current = url;
        });
      }, 300);
    };
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        vue = true;
        revoir();
      },
      { rootMargin: "200px 0px" },
    );
    if (bulle.current) obs.observe(bulle.current);
    vocauxDuChat.add(revoir);
    vocauxDuChat.forEach((f) => f());
    return () => {
      obs.disconnect();
      vocauxDuChat.delete(revoir);
      liberer();
    };
  }, [vocal.audio, audio]);

  const duree = vocal.duree || 1;
  return (
    <span ref={bulle} data-vocal-blush="" className="flex min-w-[220px] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre le vocal de BLUSH en pause" : `Écouter le vocal de BLUSH (${formatClock(Math.round(duree))})`}
        className="flex size-[42px] shrink-0 items-center justify-center rounded-full shadow-[0_6px_14px_-6px_rgba(200,29,107,0.7)]"
        style={{ background: "linear-gradient(160deg, #FF94C8 0%, #E8358A 60%, var(--color-elle-ink) 100%)" }}
      >
        {playing ? <Icon name="pause" size={15} stroke={3.2} className="text-white" /> : <Icon name="play" size={15} fill="currentColor" stroke={0} className="translate-x-px text-white" />}
      </button>
      <span aria-hidden="true" className="flex h-7 flex-1 items-center justify-between gap-[2px]">
        {vocal.peaks.map((p, i) => (
          <span key={i} className={cn("w-[3px] rounded-full", (i + 0.5) / vocal.peaks.length <= t / duree ? "bg-[#E8358A]" : "bg-[#D9D6CF]")} style={{ height: 5 + p * 22 }} />
        ))}
      </span>
      <span className="shrink-0 text-legende font-black tabular-nums text-grey">{formatClock(playing || t > 0 ? t : Math.round(duree))}</span>
    </span>
  );
}
