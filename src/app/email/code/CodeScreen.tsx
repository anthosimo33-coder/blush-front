"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { play } from "@/lib/sound";
import { createAccount, sendLoginCode, startAnalysis, verifyLoginCode } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";

const LENGTH = 6;
const RESEND_AFTER = 30;

/*
 * Écran 07b — Le code reçu par email. Un seul champ (le collage et le remplissage automatique
 * du téléphone marchent), affiché en 6 cases. Le code complet valide tout seul.
 */
export function CodeScreen() {
  const router = useRouter();
  const [j, set] = useJourney();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const [resent, setResent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const email = j.email.trim();

  /* Le bouton « Renvoyer le code » se libère au bout de 30 secondes */
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (value.length !== LENGTH || busy) return;
    setBusy(true);
    const { ok } = await verifyLoginCode(email, value);
    play(ok ? "oui" : "non");
    if (!ok) {
      setBusy(false);
      setWrong(true);
      setCode("");
      input.current?.focus();
      return;
    }
    await createAccount(email);
    const { jobId } = await startAnalysis({ me: j.me ?? "hugo", pronom: j.pronom, prenom: j.prenom, guess: j.guess ?? "flou", goal: j.goal ?? "ensemble" });
    set({ jobId });
    router.push("/lecture");
  };

  const resend = async () => {
    setWait(RESEND_AFTER);
    setWrong(false);
    await sendLoginCode(email);
    setResent(true);
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back="/email" progress={3} />}
      desktopBack={{ target: "/email" }}
      aside={<FlowSteps step={3} />}
      contentGap={22}
      head={
        <>
          <ScreenTitle>Entre ton code.</ScreenTitle>
          <Lead size={15} weight={800}>
            On vient de l’envoyer à <span className="font-black text-ink">{email || "ton email"}</span>.
          </Lead>
        </>
      }
      footer={
        <Button arrow={!busy} disabled={code.length !== LENGTH || busy} aria-busy={busy} onClick={() => verify(code)}>
          {busy ? <TypingDots color="#FFFFFF" label="Création de ton rapport" /> : "Créer mon rapport"}
        </Button>
      }
    >
      {/* Un seul vrai champ, posé sur les 6 cases : saisie, collage et code proposé par le téléphone */}
      <div className="relative" onClick={() => input.current?.focus()}>
        <label htmlFor="code" className="sr-only">
          Code à 6 chiffres reçu par email
        </label>
        <input
          ref={input}
          id="code"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
            setCode(v);
            setWrong(false);
            if (v.length === LENGTH) verify(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={LENGTH}
          disabled={busy}
          aria-invalid={wrong || undefined}
          aria-describedby={wrong ? "code-erreur" : undefined}
          className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
        />
        <div aria-hidden="true" className={cn("grid grid-cols-6 gap-2 sm:gap-2.5", wrong && "motion-safe:animate-[codeShake_0.4s_ease-in-out]")}>
          {Array.from({ length: LENGTH }, (_, i) => {
            const digit = code[i];
            const active = i === Math.min(code.length, LENGTH - 1) && !busy;
            return (
              <span
                key={i}
                className={cn(
                  "flex h-[60px] items-center justify-center rounded-[16px] bg-white text-[26px] font-black tabular-nums text-ink transition-shadow",
                  wrong ? "shadow-[inset_0_0_0_2px_#D93036]" : active ? "shadow-[inset_0_0_0_2px_var(--elle),0_0_0_4px_rgb(255_79_154/0.16)]" : "shadow-soft",
                )}
              >
                {digit ?? (active ? <span className="h-7 w-0.5 rounded-full bg-ink motion-safe:animate-pulse" /> : null)}
              </span>
            );
          })}
        </div>
      </div>

      <div aria-live="polite" className="-mt-1 min-h-5">
        {wrong && (
          <p id="code-erreur" className="m-0 text-[14px] font-extrabold text-[#D93036]">
            Ce code ne marche pas. Vérifie-le, ou demande-en un nouveau.
          </p>
        )}
        {!wrong && resent && <p className="m-0 text-[14px] font-extrabold text-vrai-ink">Nouveau code envoyé.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <button type="button" onClick={resend} disabled={wait > 0} className="-my-2 inline-flex min-h-11 items-center text-[14px] font-black text-toi-ink disabled:text-grey">
          {wait > 0 ? `Renvoyer le code (${wait} s)` : "Renvoyer le code"}
        </button>
        <Link href="/email" className="-my-2 inline-flex min-h-11 items-center text-[14px] font-black text-ink no-underline">
          Changer d’email
        </Link>
      </div>

      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Pas de mot de passe : ce code suffit. Il expire au bout de 10 minutes.
      </p>
    </Screen>
  );
}
