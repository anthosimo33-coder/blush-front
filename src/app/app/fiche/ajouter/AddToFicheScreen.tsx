"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { takePendingFile } from "@/lib/pending";
import { invalidate } from "@/lib/query";
import { extractFromCapture, getFiche, updateFiche } from "@/services/api";
import { AppBadge } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { InsetGroup } from "@/components/ui/inset";
import { AppScreen } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";
import type { FicheExtraction, FicheFact } from "@/types";

/* Écran 17 — Ajouter à sa fiche : CRUSH lit une capture (bio, post) ; tu gardes ce que tu veux, dans une liste à cocher. */
export function AddToFicheScreen() {
  const router = useRouter();
  const [file] = useState(() => takePendingFile());
  const [data, setData] = useState<FicheExtraction | null>(null);
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  useEffect(() => {
    extractFromCapture(file).then((d) => {
      setData(d);
      setKept(Object.fromEntries(d.items.map((i) => [i.id, true])));
    });
  }, [file]);

  const add = async () => {
    if (!data) return;
    setBusy(true);
    const fiche = await getFiche();
    const facts: FicheFact[] = [...fiche.facts];
    for (const it of data.items) {
      if (!kept[it.id]) continue;
      const same = facts.find((f) => f.section === it.section && f.text === it.fact);
      if (same) {
        if (!same.sourceLabel.includes(data.factSourceLabel)) same.sourceLabel = `${same.sourceLabel} · ${data.factSourceLabel}`;
      } else facts.push({ id: `c${it.id}${Date.now()}`, section: it.section, text: it.fact, sourceLabel: data.factSourceLabel, sources: ["capture"] });
    }
    await updateFiche(facts);
    invalidate("fiche");
    router.push("/app/fiche");
  };

  return (
    <AppScreen
      requires="crushplus"
      srTitle="Ajouter à sa fiche"
      aside={null}
      mainWidth={600}
      frameWidth={600}
      contentGap={0}
      mobileTop={<MobileTopBar back="/app/fiche" title="Ajouter à sa fiche" />}
      desktopBack={{ target: "/app/fiche", trailing: "Ajouter à sa fiche" }}
      footer={
        <Button onClick={busy ? undefined : add} disabled={!data || !Object.values(kept).some(Boolean)} aria-busy={busy}>
          Ajouter à sa fiche
        </Button>
      }
    >
      {/* La capture lue : d’où elle vient, l’image, la phrase relevée */}
      <div className="flex flex-col gap-3 rounded-[24px] bg-white p-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <AppBadge app={data?.sourceApp ?? "hinge"} size={32} radius={9} />
          <span className="text-[14px] font-black">{data?.sourceLabel ?? "Capture"}</span>
        </div>
        <div
          className="flex h-[150px] items-end rounded-[18px] p-3 text-[12px] font-extrabold text-white"
          style={preview ? { background: `center / cover no-repeat url(${preview})` } : { background: "linear-gradient(160deg, #FFC48F, #FF9AA8 50%, #B79CFF)" }}
          role={preview ? "img" : undefined}
          aria-label={preview ? "Ta capture" : undefined}
        >
          {!preview && "photo"}
        </div>
        {data ? <div className="text-[15px] font-extrabold leading-[1.45]">{data.quote}</div> : <TypingDots label="CRUSH lit ta capture" />}
      </div>

      {/* Ce que CRUSH en retient : une liste à cocher, tout est coché au départ */}
      {data && (
        <InsetGroup title={<span className="text-vrai-ink">Ce que CRUSH en retient</span>} id="kept-label" className="mt-7" footer="Décoche ce qui ne doit pas être gardé.">
          {data.items.map((it) => {
            const on = !!kept[it.id];
            return (
              <button
                key={it.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setKept((k) => ({ ...k, [it.id]: !on }))}
                className="row-hover flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left text-ink"
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", on ? "bg-ink" : "bg-white shadow-[inset_0_0_0_2px_#D6D2C8]")}>
                  {on && <Icon name="check" size={13} color="#FFFFFF" stroke={3.4} />}
                </span>
                <span className={cn("text-[16px] font-black transition-colors", !on && "text-grey line-through decoration-2")}>{it.text}</span>
              </button>
            );
          })}
        </InsetGroup>
      )}
    </AppScreen>
  );
}
