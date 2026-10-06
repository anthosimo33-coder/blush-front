"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { setQueryData, useQuery } from "@/lib/query";
import { askQuestion, getQuestion } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Bubble as MessageBubble, ConfidenceLine, BlushTyping } from "@/components/ui/messages";
import { AppScreen, useAccess } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";
import type { Story } from "@/types";

/*
 * Écran 12 — Ta question, en conversation avec BLUSH (proposition ; l’écran actuel reste sur ?version=actuelle).
 * BLUSH t’accueille, propose des questions tirées du rapport (un toucher la met dans le champ, sans l’envoyer :
 * la question incluse ne part pas par erreur), écrit, puis répond en bulles, preuve et confiance comprises.
 * ⚠ Absent des maquettes : textes à valider.
 */
export function QuestionChat({ ideas, story }: { ideas: string[]; story: Story }) {
  const { data: answer, loading } = useQuery("question", getQuestion);
  const { plan } = useAccess();
  const [draft, setDraft] = useState("");
  /* La question en route : BLUSH écrit, puis sa bulle se replie (leaving) avant la réponse */
  const [asking, setAsking] = useState<{ question: string; leaving: boolean } | null>(null);
  const first = useRef(true);
  const question = answer?.question ?? asking?.question ?? null;
  const typed = draft.trim().length > 0;
  const ready = !loading;

  /* Chaque nouveau message fait descendre la conv (pas à l’arrivée sur l’écran) */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [question, asking?.leaving, answer]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || asking || answer) return;
    setDraft("");
    setAsking({ question: q, leaving: false });
    const a = await askQuestion(q);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAsking({ question: q, leaving: true });
      await new Promise((r) => setTimeout(r, 190));
    }
    setQueryData("question", a);
    setAsking(null);
  };

  const composer = (
    <form onSubmit={submit}>
      <label className="flex min-h-[52px] items-end gap-2 rounded-[26px] bg-white py-1.5 pl-[18px] pr-1.5 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_10px_26px_-16px_rgba(17,17,20,0.35)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_#121214,0_10px_26px_-16px_rgba(17,17,20,0.35)]">
        <span className="sr-only">Ta question à BLUSH</span>
        <textarea
          rows={1}
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /* Entrée envoie, Maj + Entrée passe à la ligne */
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Écris ta question"
          enterKeyHint="send"
          className="max-h-[132px] min-h-10 flex-1 resize-none bg-transparent py-[9px] text-[16px] font-extrabold leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-grey"
        />
        <button
          type="submit"
          aria-label="Poser ma question"
          disabled={!typed}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-[background-color,box-shadow,transform] duration-200 active:scale-95 disabled:bg-[#D9D6CF] disabled:shadow-none"
        >
          <Icon name="arrow" size={18} color="#FFFFFF" stroke={2.8} className="-rotate-90" />
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
      <Link href="/app" className="relative inline-flex min-h-11 items-center px-1 text-[15px] font-black text-soft no-underline transition-colors hover:text-ink">
        {plan === "blushplus" ? "Continuer dans ton chat avec BLUSH" : "Toutes tes questions, avec BLUSH+"}
      </Link>
    </div>
  );

  return (
    <AppScreen
      requires="rapport"
      srTitle="Ta question"
      aside={null}
      mainWidth={600}
      frameWidth={600}
      footerWidth={600}
      contentGap={16}
      mobileTop={<MobileTopBar back="/rapport" title="Ta question" />}
      desktopBack={{ target: "/rapport", trailing: "Ta question" }}
      footer={!ready ? undefined : answer ? after : asking ? null : composer}
    >
      {/* BLUSH en grand ; sa bulle s’anime quand il écrit */}
      <div className="flex flex-col items-center pt-1 text-center">
        <span data-float="" className="block" style={{ "--r": "-3deg" } as CSSProperties}>
          <span className="block drop-shadow-[0_14px_16px_rgba(232,53,138,0.24)]">
            <BubbleLogo size={72} animated={asking !== null} />
          </span>
        </span>
        {plan === "rapport" && (
          <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-black text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.07),0_6px_14px_-8px_rgba(17,17,20,0.3)]">
            <Icon name="bolt" size={13} color="#2F7BFF" stroke={2.6} />1 question incluse
          </span>
        )}
      </div>

      {/* La conv, posée en bas, près du champ */}
      <div className="flex flex-1 flex-col justify-end gap-5 pb-2 pt-4 lg:pt-6">
        <div role="log" aria-label="Ta conversation avec BLUSH" aria-live="polite" className="flex flex-col gap-4">
          <BlushSays
            bubbles={[
              <span key="a" className="text-[17px] font-black leading-[1.3]">
                Une question sur vous deux&nbsp;? Pose-la-moi.
              </span>,
              <span key="b" className="text-[14px] font-extrabold leading-[1.45] text-soft">
                Je te réponds avec vos {formatCount(story.totalMessages)} messages, preuves à l’appui.
              </span>,
            ]}
          />
          {question && (
            <div data-rise="" className="flex justify-end">
              <span className="max-w-[80%] whitespace-pre-wrap rounded-[20px] bg-toi-ink px-4 py-2.5 text-[16px] font-bold leading-[1.4] text-white">{question}</span>
            </div>
          )}
          {asking && (
            <div className="flex items-end pt-1">
              <BlushTyping label="BLUSH analyse votre conv" leaving={asking.leaving} />
            </div>
          )}
          {answer && (
            <BlushSays
              bubbles={[
                <span key="titre" className="text-[19px] font-black leading-[1.25] tracking-[-0.01em]">
                  {answer.title}
                </span>,
                <span key="preuve" className="flex flex-col gap-2.5">
                  <span className="text-[12px] font-black text-grey">{answer.evidenceLabel}</span>
                  {answer.message && (
                    <MessageBubble from={answer.message.from} caption={answer.message.caption} className="!max-w-full">
                      {answer.message.text}
                    </MessageBubble>
                  )}
                  <span className="text-[15px] font-extrabold leading-[1.45]">{answer.evidence}</span>
                  <ConfidenceLine level={answer.confidence}>{answer.limits}</ConfidenceLine>
                </span>,
              ]}
            />
          )}
        </div>

        {/* Des idées tirées du rapport, comme des réponses toutes prêtes : un toucher la met dans le champ */}
        {ready && !question && (
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
                  style={{ "--d": `${0.2 + i * 0.07}s` } as CSSProperties}
                  className={cn(
                    "max-w-[88%] rounded-[20px] rounded-br-[6px] px-4 py-2.5 text-left text-[15px] font-extrabold leading-[1.35] transition-[background-color,color,box-shadow] duration-200",
                    on
                      ? "bg-toi-ink text-white shadow-[0_10px_22px_-12px_rgba(26,102,219,0.8)]"
                      : "bg-white text-toi-ink shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.3)] [@media(hover:hover)]:hover:shadow-[inset_0_0_0_1.5px_#1A66DB]",
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

/** Les bulles de BLUSH, groupées comme dans le chat de l’accueil : sa petite bulle à côté de la dernière. */
function BlushSays({ bubbles }: { bubbles: ReactNode[] }) {
  const n = bubbles.length;
  return (
    <div className="flex flex-col gap-[3px]">
      {bubbles.map((b, i) => (
        <div key={i} data-rise="" className="flex items-end gap-2" style={{ "--d": `${i * 0.08}s` } as CSSProperties}>
          {i === n - 1 ? <BubbleLogo size={34} className="-mb-0.5 shrink-0" /> : <span aria-hidden="true" className="w-[34px] shrink-0" />}
          <div
            className={cn(
              "flex max-w-[318px] flex-col rounded-[20px] bg-white px-4 py-3 text-left text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.045),0_1px_2px_rgba(17,17,20,0.06)]",
              n > 1 && (i === 0 ? "rounded-bl-[6px]" : i === n - 1 ? "rounded-tl-[6px]" : "rounded-l-[6px]"),
            )}
          >
            {b}
          </div>
        </div>
      ))}
    </div>
  );
}
