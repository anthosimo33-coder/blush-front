"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { setForceSound, setRecording } from "@/lib/sound";
import { Icon } from "@/components/ui/icons";

/*
 * Les vocaux du chat : on enregistre avec le micro, on voit l’onde bouger, on envoie ou on jette.
 * Tout reste dans le navigateur (aucun envoi réseau) : le vocal part ensuite par la couche de service.
 */

export type VoiceClip = { url: string; blob: Blob; seconds: number; peaks: number[] };
export type VoiceError = "denied" | "unsupported";

/** Au-delà, le vocal part tout seul. */
const MAX_SECONDS = 120;
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

export function formatClock(s: number) {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * L’enregistreur. `start` demande le micro (le navigateur pose la question la première fois),
 * `stop(true)` rend le vocal, `stop(false)` le jette.
 */
export function useVoiceRecorder({ onError, onLimit }: { onError: (e: VoiceError) => void; onLimit: () => void }) {
  const [phase, setPhase] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
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
    enCours?.pause();
    /* Safari doit pouvoir ouvrir le micro : les sons de BLUSH lui rendent la session audio le temps du vocal */
    setRecording(true);
    /* Le contexte audio naît pendant le toucher : sur iPhone, sinon, il reste muet */
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = AC ? new AC() : null;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      ctx?.close().catch(() => {});
      setRecording(false);
      setPhase("idle");
      handlers.current.onError("denied");
      return;
    }
    /* L’écran a été quitté pendant que le micro s’ouvrait : on le referme tout de suite, rien ne s’enregistre */
    if (!monte.current) {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      setRecording(false);
      return;
    }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
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
        ctx.resume().catch(() => {});
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
            setLevels((l) => [...l.slice(1 - LIVE_BARS), level]);
          }
          s.raf = requestAnimationFrame(tick);
        };
        s.raf = requestAnimationFrame(tick);
      } catch {
        /* Pas de niveaux : l’onde reste calme, l’enregistrement continue */
      }
    }
    s.timer = window.setInterval(() => {
      const secs = (performance.now() - s.started) / 1000;
      setSeconds(secs);
      if (secs >= MAX_SECONDS) handlers.current.onLimit();
    }, 200);
    /* Par tranches de 250 ms : Safari livre le son au fil de l’eau (à l’arrêt seul, il peut ne rien rendre) */
    recorder.start(250);
    session.current = s;
    setLevels([]);
    setSeconds(0);
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
        setLevels([]);
        setSeconds(0);
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
      } catch {
        /* Rien à demander : l’arrêt livrera le reste */
      }
      s.recorder.stop();
    });

  return { phase, seconds, levels, start, stop };
}

function release(s: Session) {
  cancelAnimationFrame(s.raf);
  clearInterval(s.timer);
  s.stream.getTracks().forEach((t) => t.stop());
  s.ctx?.close().catch(() => {});
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

/** Pendant l’enregistrement : le point rouge, le temps, l’onde qui bouge, et le bouton pour envoyer. */
export function RecordingBar({ seconds, levels, onSend }: { seconds: number; levels: number[]; onSend: () => void }) {
  const bars = [...Array.from({ length: Math.max(0, LIVE_BARS - levels.length) }, () => 0), ...levels];
  return (
    <>
      <span className="sr-only" role="status">
        Enregistrement du vocal en cours
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-[#E5484D]" />
        <span className="w-[38px] text-[15px] font-black tabular-nums text-ink">{formatClock(seconds)}</span>
      </span>
      <span aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
        {bars.map((l, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full bg-ink transition-[height] duration-75" style={{ height: 3 + l * 22, opacity: l === 0 ? 0.18 : 0.85 }} />
        ))}
      </span>
      <button type="button" onClick={onSend} aria-label="Envoyer le vocal" data-popin="" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink">
        <Icon name="arrow" size={17} color="#FFFFFF" stroke={2.8} className="-rotate-90" />
      </button>
    </>
  );
}

/** Le vocal envoyé, dans ta bulle bleue : lecture, onde (la partie écoutée s’éclaire) et durée. */
export function VoiceNote({ clip }: { clip: Pick<VoiceClip, "url" | "seconds" | "peaks"> }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    let a = audio.current;
    if (!a) {
      const el = new Audio(clip.url);
      el.ontimeupdate = () => setProgress(el.currentTime / (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : clip.seconds));
      /* Arrêté d’ailleurs (un autre vocal lancé, un enregistrement) : le bouton revient sur lecture */
      el.onpause = () => setPlaying(false);
      el.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.current = el;
      a = el;
    }
    if (a.paused) {
      if (enCours && enCours !== a) enCours.pause();
      enCours = a;
      a.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  return (
    <span className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre ton vocal en pause" : `Écouter ton vocal (${formatClock(clip.seconds)})`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white"
      >
        {playing ? <Icon name="pause" size={15} color="#1A66DB" stroke={3.2} /> : <Icon name="play" size={15} color="#1A66DB" fill="#1A66DB" stroke={0} className="translate-x-px" />}
      </button>
      <span aria-hidden="true" className="flex h-7 items-center gap-[2px]">
        {clip.peaks.map((p, i) => (
          <span key={i} className={cn("w-[3px] rounded-full", (i + 0.5) / clip.peaks.length <= progress ? "bg-white" : "bg-white/50")} style={{ height: 4 + p * 22 }} />
        ))}
      </span>
      <span className="text-[13px] font-black tabular-nums text-white/90">{formatClock(clip.seconds)}</span>
    </span>
  );
}

/* Un seul vocal à la fois (de BLUSH ou le tien) : en lancer un arrête celui qui jouait */
let enCours: HTMLAudioElement | null = null;

/**
 * La réponse de BLUSH dite en vocal, dans sa bulle blanche : le bouton rose, l’onde (la partie écoutée en rose) et la
 * durée. Comme une story, elle s’entend même quand le téléphone est en silencieux.
 */
export function VocalBlush({ vocal }: { vocal: { audio: string; duree: number; peaks: number[] } }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);

  useEffect(
    () => () => {
      if (audio.current && enCours === audio.current) {
        audio.current.pause();
        setForceSound(false);
      }
    },
    [],
  );

  const toggle = () => {
    let a = audio.current;
    if (!a) {
      const el = new Audio(vocal.audio);
      el.preload = "auto";
      el.ontimeupdate = () => setT(el.currentTime);
      el.onplay = () => setPlaying(true);
      /*
       * En pause (à la main, ou par un autre vocal) : les sons de l’appli reviennent en « ambient », muets en mode
       * silencieux. Seulement s’il était le vocal en cours : celui qui le remplace garde sa session « lecture ».
       */
      el.onpause = () => {
        setPlaying(false);
        if (enCours === el) setForceSound(false);
      };
      el.onended = () => {
        setPlaying(false);
        setT(0);
        if (enCours === el) setForceSound(false);
      };
      audio.current = el;
      a = el;
    }
    if (a.paused) {
      if (enCours && enCours !== a) enCours.pause();
      enCours = a;
      setForceSound(true);
      const el = a;
      a.play().catch(() => {
        setPlaying(false);
        if (enCours === el) setForceSound(false);
      });
    } else a.pause();
  };

  const duree = vocal.duree || 1;
  return (
    <span className="flex min-w-[220px] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre le vocal de BLUSH en pause" : `Écouter le vocal de BLUSH (${formatClock(Math.round(duree))})`}
        className="flex size-[42px] shrink-0 items-center justify-center rounded-full shadow-[0_6px_14px_-6px_rgba(200,29,107,0.7)]"
        style={{ background: "linear-gradient(160deg, #FF94C8 0%, #E8358A 60%, #C81D6B 100%)" }}
      >
        {playing ? <Icon name="pause" size={15} color="#FFFFFF" stroke={3.2} /> : <Icon name="play" size={15} color="#FFFFFF" fill="#FFFFFF" stroke={0} className="translate-x-px" />}
      </button>
      <span aria-hidden="true" className="flex h-7 flex-1 items-center justify-between gap-[2px]">
        {vocal.peaks.map((p, i) => (
          <span key={i} className={cn("w-[3px] rounded-full", (i + 0.5) / vocal.peaks.length <= t / duree ? "bg-[#E8358A]" : "bg-[#D9D6CF]")} style={{ height: 5 + p * 22 }} />
        ))}
      </span>
      <span className="shrink-0 text-[13px] font-black tabular-nums text-grey">{formatClock(playing || t > 0 ? t : Math.round(duree))}</span>
    </span>
  );
}
