"use client";

import { useId, useState } from "react";
import { NOTE_DU_RAPPORT as N } from "@/contenu/mesures";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/cards";
import { ChoiceTile, Chip, RadioGroup } from "@/components/ui/controls";
import { RowIcon } from "@/components/ui/inset";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { ChapterRule } from "@/components/ui/report";
import type { Pronom } from "@/types";

/*
 * Proposition du 26 octobre (src/contenu/mesures.ts) : au bas d’un rapport écrit, « Il t’a parlé, ce rapport ? » avec
 * les tuiles de « Qui es-tu ? » (ChoiceTile). « Bof » : ce qui n’allait pas, en pastilles (Chip). « Oui, grave » : un
 * avis, un prénom et une phrase, relu avant d’aller sur le site. Une fois donnée, la note se replie en un merci. Rien
 * n’est encore envoyé au serveur.
 */

type Note = "oui" | "bof";

/** Les champs de l’avis, comme le prénom de « Qui es-tu ? » (QuiScreen, CHAMP_PRENOM), un cran plus petits. */
const CHAMP =
  "w-full rounded-field bg-white px-4 text-corps font-extrabold text-ink shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_1px_2px_rgba(17,17,20,0.04)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]";

/** La note du rapport, sous sa dernière ligne (Suite). `autre` : le pronom de l’autre, pour l’exemple de l’avis. */
export function NoteDuRapport({ autre }: { autre: Pronom }) {
  const id = useId();
  const [note, setNote] = useState<Note | null>(null);
  const [raison, setRaison] = useState<string | null>(null);
  const [fini, setFini] = useState(false);
  return (
    <>
      <ChapterRule />
      <section id="note-du-rapport" aria-labelledby={id} className="flex scroll-mt-24 flex-col gap-3">
        <h2 id={id} className="m-0 text-[22px] font-black leading-[1.15] tracking-[-0.01em]">
          {N.titre}
        </h2>
        {fini ? (
          <Card className="flex items-center gap-3 p-[18px]">
            <RowIcon icon="check" tone="vrai" />
            <span role="status" className="flex flex-col gap-0.5">
              <span className="text-corps font-black">{N.merci}</span>
              <span className="text-legende font-extrabold text-grey">{N.merciSous}</span>
            </span>
          </Card>
        ) : (
          <>
            <RadioGroup labelledBy={id} className="flex gap-3">
              <ChoiceTile icon="heart" tone="elle" label={N.oui} selected={note === "oui"} onClick={() => setNote("oui")} />
              <ChoiceTile icon="cloud" tone="flou" label={N.bof} selected={note === "bof"} onClick={() => setNote("bof")} />
            </RadioGroup>

            {note === "bof" && (
              <Card className="flex flex-col gap-3.5 p-[18px]">
                <p className="m-0 text-accent font-black">{N.bofTitre}</p>
                <div className="flex flex-wrap gap-2">
                  {N.raisons.map((r) => (
                    <Chip key={r} selected={raison === r} onClick={() => setRaison(r)}>
                      {r}
                    </Chip>
                  ))}
                </div>
                <Button size="md" disabled={!raison} onClick={() => setFini(true)}>
                  {N.envoyer}
                </Button>
              </Card>
            )}

            {note === "oui" && (
              <Card className="flex flex-col gap-3.5 p-[18px]">
                <span className="flex flex-col gap-1">
                  <span className="text-accent font-black">{N.avisTitre}</span>
                  <span className="text-detail font-bold leading-[1.4] text-soft">{N.avisSous}</span>
                </span>
                <input aria-label={N.prenom} placeholder={N.prenom} autoComplete="given-name" maxLength={30} className={`${CHAMP} h-[52px]`} />
                <textarea aria-label={N.phrase} placeholder={N.exemple(autre)} rows={3} maxLength={200} className={`${CHAMP} resize-none py-3 leading-[1.4]`} />
                <div className="flex flex-col gap-1">
                  <Button size="md" onClick={() => setFini(true)}>
                    {N.publier}
                  </Button>
                  <Button variant="link" onClick={() => setFini(true)}>
                    {N.plusTard}
                  </Button>
                </div>
                <NotePrivee icone="shield" petite>
                  {N.relu}
                </NotePrivee>
              </Card>
            )}
          </>
        )}
      </section>
    </>
  );
}
