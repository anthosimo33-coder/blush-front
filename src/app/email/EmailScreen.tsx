"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages-erreur";
import { sendLoginCode } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";
import { NBSP } from "@/lib/format";

/* Écran 07 — Email seul : on y envoie un code (pas de mot de passe), à saisir sur l’écran suivant. */
export function EmailScreen() {
  const router = useRouter();
  const [j, set] = useJourney();
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Le code n’est pas parti : pourquoi, dit simplement (textes relus le 8 octobre) */
  const [problem, setProblem] = useState<string | null>(null);
  const valid = EMAIL_RE.test(j.email.trim());
  /* L’écran du code est statique : préchargé pendant qu’on tape son email, il s’ouvre tout de suite après l’envoi */
  useEffect(() => {
    router.prefetch("/email/code");
  }, [router]);

  const submit = async () => {
    if (!valid || busy) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sendLoginCode(j.email.trim());
      router.push("/email/code");
    } catch (e) {
      setProblem(messageErreur("code", e));
      setBusy(false);
    }
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back="/qui" progress={3} />}
      desktopBack={{ target: "/qui" }}
      aside={<FlowSteps step={3} />}
      head={
        <>
          <ScreenTitle>On t’envoie ton rapport où{NBSP}?</ScreenTitle>
          <Lead size={15} weight={800}>
            Pour le retrouver quand tu veux, et pour qu’on te relance au bon moment.
          </Lead>
        </>
      }
      footer={
        <Button arrow={!busy} disabled={!valid || busy} aria-busy={busy} onClick={submit}>
          {busy ? <TypingDots color="#FFFFFF" label="Envoi du code" /> : "Recevoir mon code"}
        </Button>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <EmailField
          value={j.email}
          onChange={(v) => {
            set({ email: v });
            setProblem(null);
          }}
          onBlur={() => setTouched(true)}
          invalid={!!problem || (touched && j.email.length > 0 && !valid)}
          errorText={problem ?? "Vérifie ton email\u00a0: il manque quelque chose."}
        />
      </form>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Pas de mot de passe, pas de spam. Ton email n’est jamais partagé. <Link href="/confidentialite" className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">Ce que BLUSH fait de ta conv</Link>
      </p>
    </Screen>
  );
}
