"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { basDePage } from "@/lib/defilement";
import { figtree } from "@/lib/fonts";
import { formatCount, NBSP } from "@/lib/format";
import { QUESTION_MAX } from "@/lib/limites";
import { moiEtAutre } from "@/lib/participants";
import { peut } from "@/lib/acces";
import { delai, flipFrom, prefersReducedMotion, snapshotTops, spring } from "@/lib/motion";
import { noterEcriture } from "@/lib/query";
import { play } from "@/lib/sound";
import { askQuestion, souciQuestion } from "@/services/api";
import type { QuestionAnswer } from "@/types";
import { BubbleLogo } from "@/components/brand/objects3d";
import { ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Bubble as MessageBubble, ConfidenceLine, BlushTyping, GroupeBulles } from "@/components/ui/messages";
import { AppScreen, useAccess } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";
import type { Story } from "@/types";

/*
 * Écran 12 — Ta question, en conversation avec BLUSH.
 * BLUSH t’accueille, propose des questions tirées du rapport (un toucher la met dans le champ, sans l’envoyer :
 * la question incluse ne part pas par erreur), écrit, puis répond en bulles, preuve et confiance comprises.
 * Absent des maquettes, textes relus le 8 octobre (voix de BLUSH).
 */
export function QuestionChat({ ideas, story }: { ideas: string[]; story: Story }) {
  /*
   * La réponse de la visite. Pas de question déjà posée à relire : elle passe par le chat (son historique est sur
   * l’accueil). Le champ et les idées sont là dès le premier affichage ; au retour sur l’écran, la question est à poser.
   */
  const [answer, setAnswer] = useState<QuestionAnswer | null>(null);
  const { plan } = useAccess();
  const [draft, setDraft] = useState("");
  /* La question en route : BLUSH écrit, puis sa bulle se replie (leaving) avant la réponse */
  const [asking, setAsking] = useState<{ question: string; leaving: boolean } | null>(null);
  /* La question n’est pas partie : BLUSH dit pourquoi, et la question revient dans le champ */
  const [souci, setSouci] = useState<string | null>(null);
  const first = useRef(true);
  const conv = useRef<HTMLDivElement>(null);
  const avant = useRef<Map<string, number> | null>(null);
  const question = answer?.question ?? asking?.question ?? null;
  const typed = draft.trim().length > 0;

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
    let a: QuestionAnswer;
    /* La question passe par le chat : l’accueil préchargé avant sa fin doit relire son historique (src/lib/query.ts) */
    noterEcriture("chat");
    try {
      a = await askQuestion(q);
    } catch (e) {
      setAsking(null);
      setDraft(q);
      setSouci(souciQuestion(e));
      play("non");
      return;
    } finally {
      noterEcriture("chat");
    }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAsking({ question: q, leaving: true });
      await new Promise((r) => setTimeout(r, 190));
    }
    if (conv.current) avant.current = snapshotTops([conv.current], () => "conv");
    setAnswer(a);
    setAsking(null);
    play("reponse");
  };

  const composer = (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2">
      {souci && <Alert variant="carte">{souci}</Alert>}
      <label className="flex min-h-[52px] items-end gap-2 rounded-[26px] bg-white py-1.5 pl-[18px] pr-1.5 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_10px_26px_-16px_rgba(17,17,20,0.35)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_var(--ink),0_10px_26px_-16px_rgba(17,17,20,0.35)]">
        <span className="sr-only">Ta question à BLUSH</span>
        <textarea
          rows={1}
          maxLength={QUESTION_MAX}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSouci(null);
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
        <button
          type="submit"
          aria-label="Poser ma question"
          disabled={!typed}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-[background-color,box-shadow,transform] duration-200 active:scale-95 disabled:bg-[#D9D6CF] disabled:shadow-none"
        >
          <Icon name="arrow" size={18} stroke={2.8} className="-rotate-90 text-white" />
        </button>
      </label>
    </form>
  );

  /* Après la réponse : le rapport ; et pour aller plus loin, le chat (BLUSH+) */
  const after = (
    <div data-rise="" className="flex flex-col items-center gap-1">
      <ButtonLink href="/rapport" arrow>
        Retour au rapport
      </ButtonLink>
      {/* Sans remise en haut : l’accueil s’ouvre sur le dernier échange */}
      <Link href="/app" scroll={false} className="relative inline-flex min-h-11 items-center px-1 text-detail font-black text-soft no-underline transition-colors hover:text-ink">
        {peut(plan, "chat") ? "Continuer dans ton chat avec BLUSH" : "Toutes tes questions, avec BLUSH+"}
      </Link>
    </div>
  );

  return (
    <AppScreen
      besoin="question"
      autre={moiEtAutre(story).autre.name}
      srTitle="Ta question"
      /* Figtree pour le vrai message cité en preuve (src/lib/fonts.ts) */
      className={figtree.variable}
      aside={null}
      mise="etroit"
      footerWidth={600}
      contentGap={16}
      mobileTop={<MobileTopBar back="/rapport" title="Ta question" />}
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
        {plan === "rapport" && (
          <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-legende font-black text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.07),0_6px_14px_-8px_rgba(17,17,20,0.3)]">
            <Icon name="bolt" size={13} color="#2F7BFF" stroke={2.6} />1 question incluse
          </span>
        )}
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
                  <ConfidenceLine level={answer.confidence}>{answer.limits}</ConfidenceLine>
                </span>,
              ]}
            />
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
    </AppScreen>
  );
}
