"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { basDePage } from "@/lib/defilement";
import { figtree } from "@/lib/fonts";
import { gardeLeFocus } from "@/lib/hooks";
import { formatCount, NBSP } from "@/lib/format";
import { QUESTION_MAX } from "@/lib/limites";
import { codeDe } from "@/lib/messages-erreur";
import { moiEtAutre } from "@/lib/participants";
import { delai, flipFrom, prefersReducedMotion, snapshotTops, spring } from "@/lib/motion";
import { FRAIS_DU_RENDU, noterEcriture, setQueryData } from "@/lib/query";
import { useCompte } from "@/lib/requetes";
import { play } from "@/lib/sound";
import { askQuestion, cleEnvoi, souciQuestion } from "@/services/api";
import type { QuestionAnswer } from "@/types";
import { BubbleLogo } from "@/components/brand/objects3d";
import { CompteurBulles, soldeAffiche } from "@/components/bulles/CompteurBulles";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { FeuilleRecharge } from "@/components/bulles/FeuilleRecharge";
import { Perle } from "@/components/bulles/perles";
import { PetitBouton, RecuDeLaReponse } from "@/components/bulles/pieces";
import { CARTES, REPONSE_PRETE } from "@/contenu/bulles-du-chat";
import { ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Bubble as MessageBubble, ConfidenceLine, BlushTyping, GroupeBulles } from "@/components/ui/messages";
import { AppScreen } from "@/components/shell/AppScreen";
import { useCompteDeLaPage } from "@/components/shell/compte-de-la-page";
import { MobileTopBar } from "@/components/shell/Screen";
import type { Story } from "@/types";

/*
 * Écran 12 — Ta question, en conversation avec BLUSH.
 * BLUSH t’accueille, propose des questions tirées du rapport (un toucher la met dans le champ, sans l’envoyer :
 * la question ne part pas par erreur), écrit, puis répond en bulles, preuve et confiance comprises.
 * Absent des maquettes, textes relus le 8 octobre (voix de BLUSH).
 * Sa réponse est une réponse du chat comme une autre (une bulle) : les bulles s’y montrent avec les pièces du chat
 * (src/components/bulles) : le compteur à côté du retour (de « Mon compte » sur ordinateur), le reçu sous la réponse,
 * « C’est quoi une bulle ? » et la recharge.
 */
export function QuestionChat({ ideas, story, ferme = false }: { ideas: string[]; story: Story; ferme?: boolean }) {
  /*
   * La réponse de la visite. Pas de question déjà posée à relire : elle passe par le chat (son historique est sur
   * l’accueil). Le champ et les idées sont là dès le premier affichage ; au retour sur l’écran, la question est à poser.
   */
  const [answer, setAnswer] = useState<QuestionAnswer | null>(null);
  const [draft, setDraft] = useState("");
  /* La question en route : BLUSH écrit, puis sa bulle se replie (leaving) avant la réponse */
  const [asking, setAsking] = useState<{ question: string; leaving: boolean } | null>(null);
  /*
   * La question n’est pas partie : BLUSH dit pourquoi, et la question revient dans le champ. `bulles` : refusée faute de
   * bulles (402 « bulles ») ; ce souci porte les numéros d’aide (le message n’a atteint personne) : il reste affiché
   * quand on réécrit, avec « Recharger »
   */
  const [souci, setSouci] = useState<{ texte: string; bulles: boolean } | null>(null);
  /*
   * La dernière question qui n’a pas eu de réponse, et sa clé : renvoyée telle quelle (« Réessayer »), elle repart avec
   * la même. Le réseau coupé pendant que BLUSH écrit ne l’arrête pas côté serveur : la réponse s’y écrit et se paie, et
   * le serveur la rend au nouvel essai sans la débiter de nouveau (src/app/api/chat/route.ts). Une autre question a sa clé
   */
  const enSouffrance = useRef<{ question: string; cle: string } | null>(null);
  const first = useRef(true);
  const conv = useRef<HTMLDivElement>(null);
  const avant = useRef<Map<string, number> | null>(null);
  const question = answer?.question ?? asking?.question ?? null;
  const typed = draft.trim().length > 0;
  const autre = moiEtAutre(story).autre.name;

  /*
   * Les bulles, comme dans le chat (src/app/app/HomeScreen.tsx) : le solde vient du compte que la page a rendu, puis de
   * la réponse (ce qu’il en reste, dit par le serveur avec elle). L’équipe a des bulles illimitées : ni reçu, ni recharge.
   */
  const comptePage = useCompteDeLaPage();
  const { data: compte } = useCompte(comptePage?.compte ?? undefined, { rendu: comptePage?.rendu, frais: FRAIS_DU_RENDU });
  const compteVu = useRef(compte);
  useEffect(() => {
    compteVu.current = compte;
  });
  const solde = soldeAffiche(compte);
  const [feuille, setFeuille] = useState<"bulle" | "recharge" | null>(null);

  /* Chaque nouveau message fait descendre la conv (pas à l’arrivée sur l’écran) */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* Jamais plus bas que le bas de la page : clavier ouvert, Safari décollerait le champ du clavier */
    window.scrollTo({ top: basDePage(), behavior: smooth ? "smooth" : "auto" });
  }, [question, asking?.leaving, answer]);

  /*
   * La réponse arrive : la conv, posée en bas, remonte d’un coup de toute sa hauteur (et le pied change). Elle glisse
   * plutôt de son ancienne place à la nouvelle (FLIP, en transform), la réponse montant avec elle depuis le bas.
   */
  useLayoutEffect(() => {
    const b = avant.current;
    avant.current = null;
    if (b && conv.current && !prefersReducedMotion()) flipFrom(b, [conv.current], () => "conv", spring("soft"));
  }, [answer]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || asking || answer) return;
    setDraft("");
    setSouci(null);
    setAsking({ question: q, leaving: false });
    play("envoi");
    const cle = enSouffrance.current?.question === q ? enSouffrance.current.cle : cleEnvoi();
    enSouffrance.current = { question: q, cle };
    let a: QuestionAnswer;
    /* La question passe par le chat : l’accueil préchargé avant sa fin doit relire son historique (src/lib/query.ts) */
    noterEcriture("chat");
    try {
      a = await askQuestion(q, cle);
      enSouffrance.current = null;
    } catch (e) {
      setAsking(null);
      setDraft(q);
      const bulles = codeDe(e) === "bulles";
      setSouci({ texte: souciQuestion(e), bulles });
      play("non");
      /* Plus de bulles (une réponse verrouillée attend déjà) : la recharge s’ouvre, comme dans le chat */
      if (bulles && soldeAffiche(compteVu.current) !== null) setFeuille("recharge");
      return;
    } finally {
      noterEcriture("chat");
    }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAsking({ question: q, leaving: true });
      await new Promise((r) => setTimeout(r, 190));
    }
    if (conv.current) avant.current = snapshotTops([conv.current], () => "conv");
    /* Ce qu’il reste de bulles, dit avec la réponse : le compteur (et Mon compte) le suivent */
    const c = compteVu.current;
    if (a.bulles && c) setQueryData("account", { ...c, bulles: a.bulles.restantes });
    setAnswer(a);
    setAsking(null);
    play("reponse");
  };

  const composer = (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2">
      {souci && (
        <Alert variant="carte">
          {souci.texte}
          {/* Plus de bulles : la recharge, rouverte d’ici une fois fermée (comme la carte du chat, « Recharger ») */}
          {souci.bulles && solde !== null && (
            <span className="mt-2.5 flex">
              <PetitBouton onClick={() => setFeuille("recharge")}>{CARTES.recharger}</PetitBouton>
            </span>
          )}
        </Alert>
      )}
      {/*
       * La pastille du champ, avec son bouton à côté : le <label> n’entoure que le champ, qui porte ainsi son seul nom. Il
       * couvre la pastille hors du bouton (son retrait de gauche, et le vertical par une marge négative) : un toucher au
       * bord donne encore le focus au champ
       */}
      <div className="flex min-h-[52px] items-end gap-2 rounded-[26px] bg-white py-1.5 pr-1.5 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_10px_26px_-16px_rgba(17,17,20,0.35)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_var(--ink),0_10px_26px_-16px_rgba(17,17,20,0.35)]">
        <label className="-my-1.5 flex min-w-0 flex-1 self-stretch py-1.5 pl-[18px]">
          <span className="sr-only">Ta question à BLUSH</span>
          <textarea
            rows={1}
            maxLength={QUESTION_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSouci((s) => (s?.bulles ? s : null));
            }}
            onKeyDown={(e) => {
              /* Entrée envoie, Maj + Entrée passe à la ligne */
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Écris ta question"
            enterKeyHint="send"
            className="max-h-[132px] min-h-10 flex-1 resize-none bg-transparent py-[9px] text-corps font-extrabold leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-grey"
          />
        </label>
        <button
          type="submit"
          aria-label="Poser ma question"
          disabled={!typed}
          /* Le champ garde le focus après l’envoi : le clavier reste ouvert */
          onMouseDown={gardeLeFocus}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-[background-color,box-shadow,transform] duration-200 active:scale-95 disabled:bg-disabled disabled:shadow-none"
        >
          <Icon name="arrow" size={18} stroke={2.8} className="-rotate-90 text-white" />
        </button>
      </div>
    </form>
  );

  /* Après la réponse : le rapport ; et pour aller plus loin, le chat */
  const after = (
    <div data-rise="" className="flex flex-col items-center gap-1">
      <ButtonLink href="/rapport" arrow>
        Retour au rapport
      </ButtonLink>
      {/* Sans remise en haut : l’accueil s’ouvre sur le dernier échange */}
      <Link href="/app" scroll={false} className="relative inline-flex min-h-11 items-center px-1 text-detail font-black text-soft no-underline transition-colors hover:text-ink">
        Continuer dans ton chat avec BLUSH
      </Link>
    </div>
  );

  /* Le compteur de bulles, dès que le compte est lu : un toucher ouvre « C’est quoi une bulle ? », d’où l’on recharge */
  const compteur = compte ? <CompteurBulles bulles={solde} ouvrir={() => setFeuille("bulle")} /> : undefined;
  const fermer = () => setFeuille(null);

  return (
    <AppScreen
      /* Le rapport de cette conv pas encore débloqué : « Ta question » vient avec lui, le paiement s’ouvre par-dessus */
      ferme={ferme}
      autre={autre}
      srTitle="Ta question"
      /* Figtree pour le vrai message cité en preuve (src/lib/fonts.ts) */
      className={figtree.variable}
      aside={null}
      mise="etroit"
      footerWidth={600}
      contentGap={16}
      /* Le compteur, au même endroit que dans le chat : à côté du retour sur mobile, de « Mon compte » sur ordinateur */
      mobileTop={<MobileTopBar back="/rapport" aGauche={compteur} title="Ta question" />}
      aCoteDuCompte={compteur}
      desktopBack={{ target: "/rapport", trailing: "Ta question" }}
      footer={answer ? after : asking ? null : composer}
    >
      {/* BLUSH en grand ; sa bulle s’anime quand il écrit */}
      <div className="flex flex-col items-center pt-1 text-center">
        <span data-float="" className="block" style={{ "--r": "-3deg" }}>
          <span className="block drop-shadow-[0_14px_16px_rgba(232,53,138,0.24)]">
            <BubbleLogo size={72} animated={asking !== null} />
          </span>
        </span>
      </div>

      {/* La conv, posée en bas, près du champ */}
      <div className="flex flex-1 flex-col justify-end gap-5 pb-2 pt-4 lg:pt-6">
        <div ref={conv} role="log" aria-label="Ta conversation avec BLUSH" aria-live="polite" className="flex flex-col gap-4">
          <GroupeBulles
            bulles={[
              <span key="a" className="text-accent font-black leading-[1.3]">
                une question sur vous deux{NBSP}? balance
              </span>,
              <span key="b" className="text-note font-extrabold leading-[1.45] text-soft">
                je te réponds avec vos {formatCount(story.totalMessages)} messages, preuves à l’appui
              </span>,
            ]}
          />
          {question && (
            <div data-rise="" className="flex justify-end">
              <span className="max-w-[80%] whitespace-pre-wrap rounded-[20px] bg-toi-ink px-4 py-2.5 text-corps font-bold leading-[1.4] text-white">{question}</span>
            </div>
          )}
          {asking && (
            <div className="flex items-end pt-1">
              <BlushTyping label="BLUSH analyse votre conv" leaving={asking.leaving} />
            </div>
          )}
          {answer && (
            <div className="flex flex-col gap-[3px]">
              <GroupeBulles
                bulles={[
                  <span key="titre" className="text-[19px] font-black leading-[1.25] tracking-[-0.01em]">
                    {answer.title}
                  </span>,
                  <span key="preuve" className="flex flex-col gap-2.5">
                    <span className="text-micro font-black text-grey">{answer.evidenceLabel}</span>
                    {answer.message && (
                      <MessageBubble from={answer.message.from} caption={answer.message.caption} className="!max-w-full">
                        {answer.message.text}
                      </MessageBubble>
                    )}
                    <span className="text-detail font-extrabold leading-[1.45]">{answer.evidence}</span>
                    {!answer.verrouillee && <ConfidenceLine level={answer.confidence}>{answer.limits}</ConfidenceLine>}
                    {/* Écrite à 0 bulle : la recharge, comme sous la réponse prête du chat ; une fois payé, elle s’y lit */}
                    {answer.verrouillee && solde !== null && (
                      <span className="flex">
                        <PetitBouton onClick={() => setFeuille("recharge")}>
                          <Perle taille={14} />
                          {REPONSE_PRETE.recharger}
                        </PetitBouton>
                      </span>
                    )}
                  </span>,
                ]}
              />
              {/* Ce que la réponse a coûté, et ce qu’il reste, comme sous chaque réponse du chat (offerte, une alerte : rien) */}
              {!!answer.bulles?.depensees && (
                <span data-rise="" className="mt-0.5 flex h-3.5 items-center pl-[46px]" style={delai(0.16)}>
                  <RecuDeLaReponse depensees={answer.bulles.depensees} restantes={answer.bulles.restantes} />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Des idées tirées du rapport, comme des réponses toutes prêtes : un toucher la met dans le champ */}
        {!question && (
          <div role="group" aria-labelledby="idees" className="flex flex-col items-end gap-2">
            <p id="idees" className="m-0 mb-0.5 text-[12.5px] font-black text-grey">
              Des idées, tirées de ton rapport
            </p>
            {ideas.map((q, i) => {
              const on = draft.trim() === q;
              return (
                <button
                  key={q}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft(on ? "" : q)}
                  data-rise=""
                  style={delai(0.2 + i * 0.07)}
                  className={cn(
                    "max-w-[88%] rounded-[20px] rounded-br-[6px] px-4 py-2.5 text-left text-detail font-extrabold leading-[1.35] transition-[background-color,color,box-shadow] duration-200",
                    on
                      ? "bg-toi-ink text-white shadow-[0_10px_22px_-12px_rgba(26,102,219,0.8)]"
                      : "bg-white text-toi-ink shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.3)] [@media(hover:hover)]:hover:shadow-[inset_0_0_0_1.5px_var(--color-toi-ink)]",
                  )}
                >
                  {q}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* « C’est quoi une bulle ? » (le compteur), d’où l’on recharge ; puis la recharge, comme dans le chat */}
      {compte &&
        (solde === null ? (
          <FeuilleBulle open={feuille === "bulle"} onClose={fermer} />
        ) : (
          <FeuilleBulle open={feuille === "bulle"} onClose={fermer} solde={Math.max(0, solde)} recharger={() => setFeuille("recharge")} />
        ))}
      {solde !== null && (
        <FeuilleRecharge
          open={feuille === "recharge"}
          onClose={fermer}
          reponsePrete={!!answer?.verrouillee}
          autre={autre}
          /* Payé : la réponse prête de cette question se lit dans le chat, qui la débloque au retour (`?recharge=`) ; sinon, retour ici */
          suite={(bulles) => (answer?.verrouillee ? `/app?recharge=${bulles}` : "/rapport/question")}
        />
      )}
    </AppScreen>
  );
}
