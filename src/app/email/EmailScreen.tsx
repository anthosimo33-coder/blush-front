"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendLoginCode } from "@/services/api";
import { ErreurApi } from "@/services/reel";
import { Button } from "@/components/ui/Button";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";

/* Écran 07 — Email seul : on y envoie un code (pas de mot de passe), à saisir sur l’écran suivant. */
export function EmailScreen() {
  const router = useRouter();
  const [j, set] = useJourney();
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Le code n’est pas parti : pourquoi, dit simplement (⚠ textes à valider) */
  const [problem, setProblem] = useState<string | null>(null);
  const valid = EMAIL_RE.test(j.email.trim());

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
      const code = e instanceof ErreurApi ? e.code : "";
      /* Bêta fermée, email pas invité : il est inscrit sur la liste d’attente, l’écran de la liste le lui dit */
      if (code === "beta") {
        router.push("/attente?inscrit=1");
        return;
      }
      setProblem(code === "trop" ? "Trop de codes demandés. Réessaie dans une heure." : "Le code n’est pas parti. Réessaie dans un instant.");
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
          <ScreenTitle>On t’envoie ton rapport où ?</ScreenTitle>
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
          errorText={problem ?? "Vérifie ton email : il manque quelque chose."}
        />
      </form>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Pas de mot de passe, pas de spam. Ton email n’est jamais partagé.
      </p>
    </Screen>
  );
}
