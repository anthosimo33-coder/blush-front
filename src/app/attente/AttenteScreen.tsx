"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NBSP } from "@/lib/format";

/*
 * La bêta fermée : BLUSH est sur invitation. On laisse son email : un mail le confirme (l’inscription a pu venir de
 * quelqu’un d’autre, il permet de se retirer), et un autre arrive quand une place se libère.
 * Textes relus le 8 octobre (voix de BLUSH).
 */
export function AttenteScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [etat, setEtat] = useState<"saisie" | "envoi" | "fait" | "erreur">("saisie");
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
              On vient de t’écrire pour te le confirmer. On te réécrit dès que ta place est prête.
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
            Pour l’instant, BLUSH lit les convs de quelques testeurs, sur invitation. Laisse ton email{NBSP}: on te prévient dès qu’une place se libère.
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
          errorText={etat === "erreur" ? "Ça n’a pas marché. Réessaie dans un instant." : "Vérifie ton email\u00a0: il manque quelque chose."}
        />
      </form>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        Un mail pour confirmer, puis un autre le jour où ta place est prête. Ton email n’est jamais partagé.
      </p>
    </Screen>
  );
}
