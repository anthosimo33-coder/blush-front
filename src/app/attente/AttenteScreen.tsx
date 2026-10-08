"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";

/*
 * La bêta fermée : BLUSH est sur invitation. On laisse son email, on est prévenu quand une place se libère.
 * Arrivé refusé de l’écran email (`inscrit`), on est déjà sur la liste, et on sait que sa conv n’a pas été gardée.
 * ⚠ Textes à valider.
 */
export function AttenteScreen({ inscrit }: { inscrit: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [etat, setEtat] = useState<"saisie" | "envoi" | "fait" | "erreur">(inscrit ? "fait" : "saisie");
  const valid = EMAIL_RE.test(email.trim());

  const envoyer = async () => {
    if (!valid || etat === "envoi") {
      setTouched(true);
      return;
    }
    setEtat("envoi");
    const r = await fetch("/api/attente", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) }).catch(() => null);
    setEtat(r?.ok ? "fait" : "erreur");
  };

  if (etat === "fait")
    return (
      <Screen
        mobileTop={<MobileTopBar back={() => router.push("/")} />}
        desktopBack={{ target: "/" }}
        head={
          <>
            <span className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 8px 18px -8px rgba(18,192,138,0.6)" }}>
              <Icon name="check" size={22} color="#FFFFFF" stroke={3.2} />
            </span>
            <ScreenTitle>Tu es sur la liste.</ScreenTitle>
            <Lead size={15} weight={800}>
              {inscrit
                ? "BLUSH est en bêta privée et ton email n’est pas encore invité. On t’a mis sur la liste d’attente : on t’écrit dès que ta place est prête. Ta conv n’a pas été gardée."
                : "On t’écrit dès que ta place est prête. D’ici là, garde ta conv sous le coude."}
            </Lead>
          </>
        }
        footer={
          <ButtonLink href="/" arrow>
            Revenir à l’accueil
          </ButtonLink>
        }
      >
        <span />
      </Screen>
    );

  return (
    <Screen
      mobileTop={<MobileTopBar back={() => router.back()} />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <ScreenTitle>BLUSH est en bêta privée.</ScreenTitle>
          <Lead size={15} weight={800}>
            Pour l’instant, BLUSH lit les convs de quelques testeurs, sur invitation. Laisse ton email : on te prévient dès qu’une place se libère.
          </Lead>
        </>
      }
      footer={
        <Button arrow={etat !== "envoi"} disabled={!valid || etat === "envoi"} aria-busy={etat === "envoi"} onClick={envoyer}>
          {etat === "envoi" ? <TypingDots color="#FFFFFF" label="Inscription" /> : "Rejoindre la liste"}
        </Button>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
      >
        <EmailField
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (etat === "erreur") setEtat("saisie");
          }}
          onBlur={() => setTouched(true)}
          invalid={etat === "erreur" || (touched && email.length > 0 && !valid)}
          errorText={etat === "erreur" ? "Ça n’a pas marché. Réessaie dans un instant." : "Vérifie ton email : il manque quelque chose."}
        />
      </form>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Un seul mail, le jour où ta place est prête. Ton email n’est jamais partagé.
      </p>
    </Screen>
  );
}
