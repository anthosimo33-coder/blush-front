"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useFilePicker } from "@/lib/hooks";
import { setPendingFile } from "@/lib/pending";
import { setQueryData, useQuery } from "@/lib/query";
import { getFiche, updateFiche } from "@/services/api";
import { FICHE_SECTIONS } from "@/mocks/daily";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FileInput } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import type { Fiche, FicheFact } from "@/types";

/** Largeur de la fiche sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const CARD_W = 600;

/*
 * Écran 16 — Sa fiche, à la manière d’une fiche Contacts : elle en grand, trois façons d’ajouter,
 * puis ce que CRUSH sait d’elle en listes, chaque info avec sa source. Un seul « Modifier » pour tout.
 * Rien n’est cherché ailleurs.
 */
export function FicheScreen({ initial }: { initial: Fiche }) {
  const router = useRouter();
  const { data } = useQuery("fiche", getFiche, initial);
  const fiche = data ?? initial;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const bio = useFilePicker();
  const post = useFilePicker();

  const save = async (facts: FicheFact[]) => {
    setQueryData("fiche", { ...fiche, facts });
    await updateFiche(facts);
  };

  const pick = (type: "bio" | "post") => ([file]: File[]) => {
    setPendingFile(file);
    router.push(`/app/fiche/ajouter?type=${type}`);
  };

  const editButton = (
    <button
      type="button"
      onClick={() => setEditing((v) => !v)}
      aria-pressed={editing}
      className={cn("relative h-10 rounded-full px-3 text-[15px] text-toi-ink transition-colors after:absolute after:-inset-1 after:content-['']", editing ? "font-black" : "font-extrabold")}
    >
      {editing ? "OK" : "Modifier"}
    </button>
  );

  return (
    <AppScreen
      requires="crushplus"
      aside={null}
      mainWidth={CARD_W}
      frameWidth={CARD_W}
      desktopTopPad={8}
      contentGap={0}
      mobileTop={
        <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3 lg:hidden">
          <Link href="/app" aria-label="Retour" className="flex size-11 items-center justify-center">
            <Icon name="back" size={24} color="#121214" stroke={2.6} />
          </Link>
          <span className="text-[14px] font-black text-grey">Sa fiche</span>
          <span className="flex justify-end">{editButton}</span>
        </header>
      }
    >
      {/* Desktop : retour à gauche, « Modifier » à droite */}
      <div className="mb-2 hidden items-center justify-between lg:flex">
        <Link href="/app" className="back-nudge relative inline-flex items-center gap-1.5 text-[14px] font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
          <Icon name="back" size={18} color="#4B4A47" stroke={2.6} />
          Retour
        </Link>
        {editButton}
      </div>

      {/* Elle, en grand */}
      <div className="flex flex-col items-center pt-2 text-center lg:pt-0">
        <Avatar tone="elle" size={96} fontSize={38}>
          {fiche.person.initial}
        </Avatar>
        <h1 className="m-0 mt-3.5 text-[30px] font-black leading-none tracking-[-0.02em]">{fiche.person.name}</h1>
        <p className="m-0 mt-2 text-[14px] font-extrabold text-grey">
          {fiche.portrait} · {fiche.updatedLabel}
        </p>
      </div>

      {/* Ajouter : trois gestes, comme les actions rapides d’une fiche contact */}
      <div className={cn("mt-6 grid grid-cols-3 gap-2.5 transition-opacity duration-200", editing && "pointer-events-none opacity-40")} aria-hidden={editing || undefined}>
        <QuickAction icon="photo" label="Sa bio" onClick={bio.open} />
        <QuickAction icon="instagram" label="Un post" onClick={post.open} />
        <QuickAction icon="pencil" label="Une note" onClick={() => setNote("")} />
      </div>
      <FileInput inputRef={bio.ref} accept="image/*" onFiles={pick("bio")} label="Capture de sa bio" />
      <FileInput inputRef={post.ref} accept="image/*" onFiles={pick("post")} label="Capture d’un post" />

      {/* Ce que CRUSH sait d’elle : une liste par sujet, la source de chaque info à droite */}
      <div className="mt-7 flex flex-col gap-6">
        {FICHE_SECTIONS.map((sec) => {
          const items = fiche.facts.filter((f) => f.section === sec.id);
          return (
            <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="flex flex-col gap-2">
              <h2 id={`sec-${sec.id}`} className="m-0 pl-4 text-[13px] font-black text-grey">
                {sec.title}
              </h2>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[20px] bg-white p-0 shadow-card">
                {items.map((f, i) => (
                  <li key={f.id} className={cn("flex min-h-[52px] items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-[rgba(17,17,20,0.06)]")}>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => save(fiche.facts.filter((x) => x.id !== f.id))}
                        aria-label={`Retirer « ${f.text} »`}
                        data-popin=""
                        className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center"
                      >
                        <span className="flex size-[22px] items-center justify-center rounded-full bg-[#E5484D]">
                          <Icon name="minus" size={14} color="#FFFFFF" stroke={3} />
                        </span>
                      </button>
                    )}
                    <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-[1.35]">{f.text}</span>
                    <span className="shrink-0 text-right text-[12.5px] font-extrabold text-grey">{f.sourceLabel}</span>
                  </li>
                ))}
                {items.length === 0 && !editing && <li className="px-4 py-3.5 text-[15px] font-extrabold text-muted">—</li>}
                {editing && <AddRow first={items.length === 0} label={sec.title} onAdd={(text) => save([...fiche.facts, { id: `f${Date.now()}`, section: sec.id, text, sourceLabel: "ajouté par toi", sources: ["note"] }])} />}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="m-0 mt-6 pb-2 text-center text-[13px] font-extrabold text-grey">Rien n’est cherché sur Internet</p>

      {/* ⚠ Panneau « une note » absent des maquettes */}
      <Sheet open={note !== null} onClose={() => setNote(null)} labelledBy="note-title">
        <h2 id="note-title" className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
          Une note
        </h2>
        <label htmlFor="note-text" className="text-[13px] font-black text-soft">
          Tes notes
        </label>
        <textarea
          id="note-text"
          rows={3}
          value={note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          className="block w-full resize-none rounded-[18px] border-none bg-white px-4 py-3.5 text-[16px] font-extrabold leading-[1.4] text-ink shadow-thin outline-none focus-visible:shadow-[inset_0_0_0_2px_#121214] focus-visible:outline-none"
        />
        <Button
          disabled={!note?.trim()}
          onClick={async () => {
            const text = `« ${note!.trim()} »`;
            await save([...fiche.facts, { id: `n${Date.now()}`, section: "notes", text, sourceLabel: "ajouté par toi", sources: ["note"] }]);
            setNote(null);
          }}
        >
          Ajouter à sa fiche
        </Button>
      </Sheet>
    </AppScreen>
  );
}

/** Une action rapide : une tuile, une icône, un mot. */
function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="lift lift-card flex flex-col items-center gap-2 rounded-[20px] bg-white px-2 pb-3 pt-3.5 text-center text-ink shadow-card">
      <span className="lift-pop flex size-10 items-center justify-center rounded-full bg-[rgba(255,79,154,0.1)]">
        <Icon name={icon} size={20} color="#E8358A" stroke={2.2} />
      </span>
      <span className="text-[13px] font-black leading-[1.2]">{label}</span>
    </button>
  );
}

/** En mode modification : la dernière ligne d’une liste sert à ajouter. */
function AddRow({ first, label, onAdd }: { first: boolean; label: string; onAdd: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <li className={cn("flex min-h-[52px] items-center gap-3 px-4 py-1.5", !first && "border-t border-[rgba(17,17,20,0.06)]")}>
      <form
        className="flex min-w-0 flex-1 items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue("");
        }}
      >
        <button type="submit" aria-label={`Ajouter dans « ${label} »`} className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-vrai-ink">
            <Icon name="plus" size={14} color="#FFFFFF" stroke={3} />
          </span>
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Ajouter dans « ${label} »`}
          placeholder="Ajouter"
          className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-extrabold text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </form>
    </li>
  );
}
