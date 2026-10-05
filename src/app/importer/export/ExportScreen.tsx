"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useDevice, useFilePicker } from "@/lib/hooks";
import { uploadExport } from "@/services/api";
import { EXPORT_STEPS } from "@/mocks/story";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/controls";
import { FileInput, TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/surfaces";
import { MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { setJourney } from "@/state/journey";

type ExportApp = "whatsapp" | "imessage";
type Menu = { contact: string; items: readonly string[]; highlight: number };

/* Écran 02 — Exporter : l’appli, l’écran à reconnaître (téléphone ou Mac), les étapes en frise, puis le fichier. */
export function ExportScreen({ initialApp }: { initialApp: ExportApp }) {
  const router = useRouter();
  const device = useDevice();
  const picker = useFilePicker();
  const [app, setApp] = useState<ExportApp>(initialApp);
  const [video, setVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const data = EXPORT_STEPS[app];
  const steps = device === "ios" ? data.steps.ios : device === "android" ? data.steps.android : data.steps.all;

  const onFiles = async ([file]: File[]) => {
    setBusy(true);
    const source = await uploadExport(file, app);
    setJourney({ exportApp: app, app, exportFileName: source.fileName ?? file.name, capturesAdded: false });
    router.push("/importer/ok");
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back="/commencer" progress={1} />}
      desktopBack={{ target: "/commencer" }}
      aside={<FlowSteps step={1} />}
      contentGap={24}
      head={<ScreenTitle>Exporte votre conv.</ScreenTitle>}
      footer={
        <>
          <Button onClick={picker.open} disabled={busy} aria-busy={busy}>
            {busy ? <TypingDots color="#FFFFFF" label="Lecture du fichier" /> : "Choisir le fichier enregistré"}
          </Button>
          <FileInput inputRef={picker.ref} accept=".zip,.txt,application/zip,text/plain" onFiles={onFiles} label="Fichier de la conversation exportée" />
        </>
      }
    >
      <Segmented
        label="Ton appli"
        value={app}
        onChange={(v) => {
          setApp(v);
          setJourney({ app: v, exportApp: v });
          router.replace(`/importer/export?app=${v}`, { scroll: false });
        }}
        options={[
          { value: "whatsapp", label: "WhatsApp" },
          { value: "imessage", label: "iMessage" },
        ]}
      />

      {/* L’écran à reconnaître à gauche (au-dessus sur mobile), les étapes à côté */}
      <div className="isolate flex flex-col items-center gap-7 lg:flex-row lg:items-start lg:gap-9">
        <div className="relative flex w-full shrink-0 justify-center pb-[22px] lg:w-[260px]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[45%] -z-10 size-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#FFFFFF,rgba(255,255,255,0))]"
          />
          {app === "whatsapp" ? <PhoneScreen menu={data.menu} /> : <MacScreen menu={data.menu} />}
          <button
            type="button"
            onClick={() => setVideo(true)}
            className="lift lift-sm absolute bottom-0 left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-white pl-1.5 pr-4 text-[14px] font-black text-ink shadow-soft"
          >
            <span className="lift-pop flex size-8 items-center justify-center rounded-full bg-ink">
              <Icon name="play" size={14} color="#FFFFFF" fill="#FFFFFF" stroke={0} />
            </span>
            Voir la vidéo
            <span className="font-extrabold text-grey">30 s</span>
          </button>
        </div>
        <StepTimeline steps={[...steps]} className="w-full lg:flex-1 lg:pt-2" />
      </div>

      <Sheet open={video} onClose={() => setVideo(false)} labelledBy="video-title">
        <h2 id="video-title" className="m-0 text-[22px] font-black leading-[1.1] tracking-[-0.02em]">
          Voir la vidéo (30 s)
        </h2>
        {/* ⚠ La vidéo de démonstration n’est pas fournie : emplacement prêt à recevoir le fichier. */}
        <div className="mx-auto flex aspect-[9/16] w-full max-w-[260px] items-center justify-center overflow-hidden rounded-[28px] bg-ink pt-10">
          {app === "whatsapp" ? <PhoneScreen menu={data.menu} /> : <MacScreen menu={data.menu} />}
        </div>
        <Button variant="secondary" onClick={() => setVideo(false)}>
          Fermer
        </Button>
      </Sheet>
    </Screen>
  );
}

/** Le haut d’un téléphone sur la fiche du contact : la bonne option surlignée, qui pulse. Le bas se fond dans la page. */
function PhoneScreen({ menu }: { menu: Menu }) {
  return (
    <div
      aria-hidden="true"
      className="h-[264px] w-[236px] rounded-t-[40px] bg-[#111114] p-[7px] pb-0 shadow-[0_30px_60px_-30px_rgba(17,17,20,0.5)] [mask-image:linear-gradient(180deg,#000_calc(100%_-_48px),transparent)] lg:h-[296px]"
    >
      <div className="flex h-full flex-col items-center overflow-hidden rounded-t-[33px] bg-[#F2F1EE]">
        <span className="mt-2 h-[22px] w-[76px] shrink-0 rounded-full bg-[#111114]" />
        <Avatar tone="elle" size={52} fontSize={21} className="mt-2.5">
          {menu.contact.charAt(0)}
        </Avatar>
        <span className="mt-2 text-[16px] font-black">{menu.contact}</span>
        <div className="mt-3.5 w-[calc(100%_-_24px)] overflow-hidden rounded-[14px] bg-white">
          {menu.items.map((it, i) => (
            <MenuRow key={it} first={i === 0} on={i === menu.highlight} className={cn("h-[42px] px-3.5 text-[13.5px]", i === menu.items.length - 1 ? "text-[#D93036]" : "text-[#0F7A3C]")}>
              {it}
            </MenuRow>
          ))}
        </div>
      </div>
    </div>
  );
}

/** iMessage s’exporte depuis le Mac : la fenêtre Messages, votre conv sélectionnée, le menu ouvert. */
function MacScreen({ menu }: { menu: Menu }) {
  return (
    <div aria-hidden="true" className="relative h-[236px] w-[300px] lg:w-[260px]">
      <div className="mt-4 overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_30px_60px_-30px_rgba(17,17,20,0.5)]">
        <div className="flex h-7 items-center gap-1.5 border-b border-[rgba(17,17,20,0.06)] bg-[#F3F1EE] px-3">
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} className="size-[9px] rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="flex h-[176px]">
          <div className="flex w-[92px] flex-col gap-1 border-r border-[rgba(17,17,20,0.06)] p-1.5">
            <div className="flex items-center gap-1.5 rounded-[7px] bg-[rgba(17,17,20,0.06)] px-1.5 py-1.5">
              <Avatar tone="elle" size={18} fontSize={9}>
                {menu.contact.charAt(0)}
              </Avatar>
              <span className="text-[11px] font-black">{menu.contact}</span>
            </div>
            {[54, 40, 48].map((w) => (
              <div key={w} className="flex items-center gap-1.5 px-1.5 py-1.5">
                <span className="size-[18px] shrink-0 rounded-full bg-skeleton" />
                <span className="h-[6px] rounded-full bg-skeleton" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-end gap-1.5 p-2.5">
            {[["l", 70], ["r", 52], ["l", 58], ["r", 44]].map(([side, w], i) => (
              <span key={i} className={cn("h-[14px] rounded-full", side === "l" ? "self-start bg-bubble-her" : "self-end bg-toi")} style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
      {/* Le menu contextuel, posé sur la conv */}
      <div className="absolute left-[54px] top-[86px] w-[204px] whitespace-nowrap rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(17,17,20,0.07),0_16px_34px_-12px_rgba(17,17,20,0.45)]">
        {menu.items.map((it, i) => (
          <MenuRow key={it} on={i === menu.highlight} className={cn("h-8 rounded-[6px] px-2.5 text-[12.5px]", i === menu.items.length - 1 ? "text-[#D93036]" : "text-ink")} tint="rgba(17,17,20,0.06)">
            {it}
          </MenuRow>
        ))}
      </div>
    </div>
  );
}

function MenuRow({ children, on, first = true, className, tint = "rgba(18,192,138,0.1)" }: { children: ReactNode; on: boolean; first?: boolean; className?: string; tint?: string }) {
  return (
    <div className={cn("flex items-center justify-between font-extrabold", !first && "border-t border-[rgba(17,17,20,0.06)]", className)} style={on ? { background: tint } : undefined}>
      {children}
      {on && <span data-pulse="" className="size-3 shrink-0 rounded-full bg-ink shadow-[0_0_0_5px_rgba(17,17,20,0.12)]" />}
    </div>
  );
}

/** Les étapes en frise : un fil relie les numéros, rien d’encadré. */
function StepTimeline({ steps, className }: { steps: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("m-0 flex list-none flex-col p-0", className)}>
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3.5 pb-[18px] last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[14px] top-[34px] w-0.5 rounded-full bg-[rgba(17,17,20,0.08)]" />}
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-black text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_4px_10px_-4px_rgba(17,17,20,0.25)]">
            {i + 1}
          </span>
          <span className="pt-[4px] text-[16px] font-extrabold leading-[1.4] lg:text-[15px]">{s}</span>
        </li>
      ))}
    </ol>
  );
}
