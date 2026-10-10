"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { play } from "@/lib/sound";
import { messageErreur } from "@/lib/messages-erreur";
import { sendLoginCode, startAnalysis, verifyLoginCode } from "@/services/api";
import { cheminDe } from "@/lib/navigation";
import { CODE_MINUTES } from "@/lib/limites";
import { connexionPuis, suiteSure } from "@/lib/suite";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";
import { quiComplet, reponsesQui, vientDeCaptures } from "@/state/parcours";
import { retenirLecture } from "@/state/lecture";

const LENGTH = 6;
const RESEND_AFTER = 30;

/*
 * Écran 07b — Le code reçu par email. Un seul champ (le collage et le remplissage automatique
 * du téléphone marchent), affiché en 6 cases. Le code complet valide tout seul.
 * `connexion` : on se reconnecte (un autre appareil) ; le bon code ouvre ses convs, sans relancer de lecture.
 * `fermee` : la bêta est fermée. Tout le monde arrive ici, invité ou pas (personne ne peut savoir si un email est invité) :
 * l’invité a reçu son code, les autres le mail de la liste d’attente. L’écran le dit sans savoir lequel.
 */
export function CodeScreen({ connexion = false, suite = "/app", fermee = false }: { connexion?: boolean; suite?: string; fermee?: boolean }) {
  const router = useRouter();
  const [j] = useJourney();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const [resent, setResent] = useState(false);
  /* Autre chose qu’un mauvais code : trop d’essais, pas de réseau */
  const [souci, setSouci] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const email = j.email.trim();
  /* Revenir changer d’email garde la page où l’on allait */
  const retour = !connexion ? "/email" : suite === "/app" ? "/connexion" : connexionPuis(suite);

  /* Le bouton « Renvoyer le code » se libère au bout de 30 secondes */
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (value.length !== LENGTH || busy) return;
    setBusy(true);
    setSouci(null);
    let ok: boolean;
    try {
      ({ ok } = await verifyLoginCode(email, value));
    } catch (e) {
      play("non");
      setBusy(false);
      /* Ce qui a empêché la vérification, dit simplement (un mauvais code a son propre message) */
      setSouci(messageErreur("verification", e));
      return;
    }
    play(ok ? "oui" : "non");
    if (!ok) {
      setBusy(false);
      setWrong(true);
      setCode("");
      input.current?.focus();
      return;
    }
    /* La page où l’on allait. Le lien du mail (/ouvrir/…) est une route, pas une page : un vrai chargement, qui repart de zéro */
    if (connexion && suite.startsWith("/ouvrir/")) {
      /*
       * Surtout pas de router.refresh() avant : le chargement couperait sa requête, et Next, la croyant perdue, rechargerait
       * la page du code par-dessus (WebKit), sans jamais ouvrir le lien
       */
      window.location.assign(suite);
      return;
    }
    /*
     * Connecté : ce que le routeur garde des pages déjà vues ou préchargées (5 minutes) date d’avant la connexion. Or /,
     * /commencer et /connexion changent selon le cookie, à la même adresse : sans ça, un retour sur /commencer remontrerait
     * la version sans compte. On l’oublie. /lecture n’est pas préchargée : ses gardes (layout.tsx) lisent la conv que
     * le lancement rattache au compte, avec « Qui es-tu ? » ; préchargée avant, elle garderait une redirection périmée
     * (vers la connexion ou /qui) que router.push suivrait
     */
    router.refresh();
    if (connexion) {
      /* L’accueil se pose lui-même sur le dernier échange : Next ne doit pas le remettre en haut */
      router.push(suite, { scroll: cheminDe(suite) !== "/app" });
      return;
    }
    /*
     * Sans les réponses de « Qui es-tu ? » (le parcours de cet onglet perdu), la lecture viserait la conv déjà suivie,
     * pas celle qu’on importe. Sur des captures, sans ton prénom, tu y serais « Moi ». « Qui es-tu ? » les redemande, et
     * lance la lecture de la bonne conv.
     */
    const captures = vientDeCaptures(j);
    if (!quiComplet(j, { captures })) {
      router.push("/qui");
      return;
    }
    try {
      /*
       * Le lancement est attendu avant d’ouvrir /lecture (la page serveur lit la conv que ce POST rattache au compte), mais
       * l’écran de lecture le reprend tel quel : pas de second POST avant de suivre la lecture (src/state/lecture.ts)
       */
      await startAnalysis(reponsesQui(j, { captures }));
      retenirLecture();
      router.push("/lecture");
    } catch {
      /* Le code est bon (déjà utilisé), la session ouverte : « Qui es-tu ? » relance la lecture d’ici, et dit pourquoi elle bloque */
      router.push("/qui");
    }
  };

  const resend = async () => {
    setWait(RESEND_AFTER);
    setWrong(false);
    setSouci(null);
    setResent(false);
    try {
      await sendLoginCode(email);
      setResent(true);
    } catch (e) {
      setSouci(messageErreur("code", e));
    }
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back={retour} progress={connexion ? undefined : 3} />}
      desktopBack={{ target: retour }}
      aside={connexion ? undefined : <FlowSteps step={3} />}
      contentGap={22}
      head={
        <>
          <ScreenTitle>Entre ton code.</ScreenTitle>
          <Lead size={15} weight={800}>
            {fermee ? "On vient d’écrire à " : "On vient de l’envoyer à "}
            <span className="font-black text-ink">{email || "ton email"}</span>.
          </Lead>
        </>
      }
      footer={
        <Button arrow={!busy} disabled={code.length !== LENGTH || busy} aria-busy={busy} onClick={() => verify(code)}>
          {busy ? (
            <TypingDots color="#FFFFFF" label={!connexion ? "Création de ton rapport" : suite.startsWith("/importer/") ? "Connexion" : "Ouverture de tes convs"} />
          ) : !connexion ? (
            "Créer mon rapport"
          ) : suite.startsWith("/importer/") ? (
            /* Venu de l’import : un premier accès, la suite est l’envoi de sa conv (texte à valider) */
            "Continuer"
          ) : (
            "Retrouver mes convs"
          )}
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
        {!wrong && souci && <p className="m-0 text-[14px] font-extrabold text-[#D93036]">{souci}</p>}
        {!wrong && !souci && resent && <p className="m-0 text-[14px] font-extrabold text-vrai-ink">Nouveau code envoyé.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <button type="button" onClick={resend} disabled={wait > 0} className="-my-2 inline-flex min-h-11 items-center text-[14px] font-black text-toi-ink disabled:text-grey">
          {wait > 0 ? `Renvoyer le code (${wait} s)` : "Renvoyer le code"}
        </button>
        <Link href={retour} className="-my-2 inline-flex min-h-11 items-center text-[14px] font-black text-ink no-underline">
          Changer d’email
        </Link>
      </div>

      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        {/* La fin de la phrase d’un seul tenant : coupée autour du nombre, Chromium la dessinait à quelques pixels près */}
        Pas de mot de passe{NBSP}
        {`: ce code suffit. Il expire au bout de ${CODE_MINUTES} minutes.`}
      </p>
      {fermee && <p className="m-0 -mt-2 pl-6 text-[13px] font-extrabold text-grey">Pas de code dans le mail{NBSP}? BLUSH est en bêta privée{NBSP}: ton email est sur la liste d’attente, le mail t’explique tout.</p>}
    </Screen>
  );
}

/** /connexion/code statique : `?suite=` se lit dans le navigateur, avec la même garde que côté serveur (suiteSure). */
export function CodeDepuisLadresse({ fermee = false }: { fermee?: boolean }) {
  return <CodeScreen connexion suite={suiteSure(useSearchParams().get("suite")) ?? undefined} fermee={fermee} />;
}
