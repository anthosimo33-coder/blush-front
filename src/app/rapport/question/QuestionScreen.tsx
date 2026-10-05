"use client";

import { useState } from "react";
import { useQuery, setQueryData } from "@/lib/query";
import { askQuestion, getQuestion } from "@/services/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardLabel } from "@/components/ui/cards";
import { TypingDots } from "@/components/ui/FileInput";
import { ConfidenceLine } from "@/components/ui/messages";
import { AppScreen } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";

/* Écran 12 — Ta question : une question personnelle incluse. Réponse courte, preuve, confiance, limites. */
export function QuestionScreen() {
  const { data: answer, loading } = useQuery("question", getQuestion);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const asked = answer?.question ?? (busy ? draft : null);

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const a = await askQuestion(draft.trim());
    setQueryData("question", a);
    setBusy(false);
  };

  return (
    <AppScreen
      requires="rapport"
      srTitle="Ta question"
      aside={null}
      mainWidth={600}
      frameWidth={600}
      mobileTop={<MobileTopBar back="/rapport" title="Ta question" />}
      desktopBack={{ target: "/rapport", trailing: "Ta question" }}
      footer={
        answer || loading ? (
          <ButtonLink href="/rapport">Retour au rapport</ButtonLink>
        ) : (
          /* ⚠ État de saisie absent des maquettes */
          <Button onClick={submit} disabled={!draft.trim() && !busy} aria-busy={busy}>
            {busy ? <TypingDots color="#FFFFFF" label="CRUSH réfléchit" /> : "Poser ma question"}
          </Button>
        )
      }
    >
      <label htmlFor="question" className="text-[13px] font-black text-grey">
        Ta question
      </label>
      {asked ? (
        <Card className="flex flex-col gap-2 px-4 py-3.5">
          <div className="text-[17px] font-black leading-[1.45]">{asked}</div>
        </Card>
      ) : (
        <Card className="px-4 py-3.5 focus-within:shadow-[inset_0_0_0_2px_#121214,0_14px_32px_-14px_rgba(17,17,20,0.16)]">
          <textarea
            id="question"
            rows={2}
            maxLength={200}
            value={draft}
            disabled={loading}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Est-ce qu’elle voit quelqu’un d’autre ?"
            className="block w-full resize-none border-none bg-transparent text-[17px] font-black leading-[1.45] text-ink outline-none focus-visible:outline-none"
          />
        </Card>
      )}

      {busy && <TypingDots label="CRUSH analyse votre conv" />}

      {answer && (
        <>
          <div data-rise="" className="text-[13px] font-black text-vrai-ink">
            La réponse de CRUSH
          </div>
          <h2 className="m-0 mt-1.5 text-[28px] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">{answer.title}</h2>
          <Card className="flex flex-col gap-1.5 px-4 py-3.5" >
            <CardLabel>{answer.evidenceLabel}</CardLabel>
            <div className="text-[15px] font-extrabold leading-[1.45]">{answer.evidence}</div>
          </Card>
          <ConfidenceLine level={answer.confidence}>{answer.limits}</ConfidenceLine>
        </>
      )}
    </AppScreen>
  );
}
