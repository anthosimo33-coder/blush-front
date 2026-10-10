"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { suiteSure } from "@/lib/suite";
import { ErreurApi, sendLoginCode } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";

/*
 * Se connecter : retrouver ses convs sur un autre appareil. L’email du compte, un code (pas de mot de passe),
 * et tout est là. Textes relus le 8 octobre (voix de BLUSH).
 * Venu de l’import (`suite` sous /importer/ : en bêta fermée, les captures se lisent pour un compte connecté) : un premier
 * accès, pas un retour. Le texte le dit, le retour mène au choix de l’appli, et le lien « Analyser ma conv » (qui ramènerait
 * ici) disparaît. Textes à valider.
 */
export function ConnexionScreen({ suite = null }: { suite?: string | null }) {
  const router = useRouter();
  const depuisImport = !!suite?.startsWith("/importer/");
  const retour = depuisImport ? "/commencer" : "/";
  const [j, set] = useJourney();
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const valid = EMAIL_RE.test(j.email.trim());
  const versCode = suite ? `/connexion/code?suite=${encodeURIComponent(suite)}` : "/connexion/code";
  /* L’écran du code est statique : préchargé pendant qu’on tape son email, il s’ouvre tout de suite après l’envoi */
  useEffect(() => {
    router.prefetch(versCode);
  }, [router, versCode]);

  const submit = async () => {
    if (!valid || busy) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sendLoginCode(j.email.trim());
      router.push(versCode);
    } catch (e) {
      const code = e instanceof ErreurApi ? e.code : "";
      setProblem(code === "trop" ? "Trop de codes demandés. Réessaie dans une heure." : "Le code n’est pas parti. Réessaie dans un instant.");
      setBusy(false);
    }
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back={retour} />}
      desktopBack={{ target: retour }}
      head={
        depuisImport ? (
          <>
            <ScreenTitle>D’abord, ton email.</ScreenTitle>
            <Lead size={15} weight={800}>
              BLUSH est en bêta privée{" "}: on t’envoie un code, puis tu envoies ta conv.
            </Lead>
          </>
        ) : (
          <>
            <ScreenTitle>Retrouve tes convs.</ScreenTitle>
            <Lead size={15} weight={800}>
              Entre l’email de ton compte{" "}: on t’envoie un code, et tout est là, sur cet appareil aussi.
            </Lead>
          </>
        )
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
          errorText={problem ?? "Vérifie ton email : il manque quelque chose."}
        />
      </form>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold leading-[1.45] text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Pas de mot de passe{" "}: un code suffit, sur chaque nouvel appareil. Tes convs restent chiffrées.
      </p>
      {!depuisImport && (
        <p className="m-0 text-[14px] font-extrabold text-grey">
          Pas encore de compte{" "}?{" "}
          <Link href="/commencer" className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
            Analyser ma conv
          </Link>
        </p>
      )}
    </Screen>
  );
}

/** /connexion statique : `?suite=` se lit dans le navigateur, avec la même garde que côté serveur (suiteSure). */
export function ConnexionDepuisLadresse() {
  return <ConnexionScreen suite={suiteSure(useSearchParams().get("suite"))} />;
}
