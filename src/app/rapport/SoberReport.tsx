"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LIGNES_D_ECOUTE } from "@/contenu/aide";
import { LIBELLES_RAPPORT } from "@/contenu/rapport";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import type { SoberReport as SoberData } from "@/types";
import { useRetourSinon } from "@/lib/navigation";
import { LienPdfSobre } from "./PdfDuRapport";

/*
 * Écrans 18-19 — Mode sobre : quand la conv lève une alerte de danger (détresse, mineur), BLUSH laisse la taquinerie de côté.
 * Pas de couleur de sens, pas de 3D, pas de score, pas de logo en volume. Encre et papier seulement.
 */
/* « Quitter vite » et « OK, merci » mènent à l’écran 01, comme dans la maquette */
const QUIT_HREF: Route = "/commencer";

/* Les lignes d’écoute, absentes des maquettes (validées) : src/contenu/aide.ts, la même source que le chat sans bulles */
const HELP = LIGNES_D_ECOUTE;

function SoberButton({ children, onClick, href }: { children: string; onClick?: () => void; href?: Route }) {
  const cls = "flex h-[58px] w-full items-center justify-center rounded-[29px] bg-ink text-accent font-extrabold text-white no-underline";
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SoberLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 items-center justify-center text-detail font-black text-soft">
      {children}
    </button>
  );
}

/** En haut : « Retour » à gauche, « Quitter vite » toujours visible à droite. */
function EnTeteSobre({ back }: { back: () => void }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between px-4">
      <button type="button" aria-label="Retour" onClick={back} className="-ml-2.5 flex size-11 items-center justify-center">
        <Icon name="back" size={24} stroke={2.4} className="text-soft" />
      </button>
      <Link
        href={QUIT_HREF}
        replace
        className="relative flex h-[38px] items-center rounded-[19px] px-3.5 text-note font-extrabold text-soft no-underline shadow-[inset_0_0_0_1.5px_#D6D2C8] after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
      >
        Quitter vite
      </Link>
    </header>
  );
}

/** « Besoin d’en parler à quelqu’un ? » : les lignes d’écoute, à appeler d’un toucher. */
function FeuilleAide({ open, onClose, titre }: { open: boolean; onClose: () => void; titre: string }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="help-title" belowHeader={false}>
      <h2 id="help-title" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
        {titre}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {HELP.map((h) => (
          <li key={h.name}>
            <a href={`tel:${h.tel}`} className="flex flex-col gap-0.5 rounded-[20px] bg-white p-4 text-ink no-underline shadow-[inset_0_0_0_1.5px_var(--color-track)]">
              <span className="text-corps font-black">
                {h.name} · {h.label}
              </span>
              <span className="text-legende font-extrabold text-grey">{h.detail}</span>
            </a>
          </li>
        ))}
      </ul>
      <SoberButton onClick={onClose}>Fermer</SoberButton>
    </Sheet>
  );
}

/**
 * L’attente du rapport doux : le verdict a levé une alerte (`ReportPayload.alerte`), le rapport sobre s’écrit encore.
 * Ni scène, ni score, ni partage, ni pastille de l’écriture : quelques mots, l’aide déjà à un toucher, et le rapport
 * doux dès qu’il est là (le rapport continue d’être relu, ReportScreen). `echec` : l’écriture a échoué (EchecEcriture,
 * qui se relance), à la place de l’attente.
 * TODO(produit): les deux phrases de l’attente sobre et son titre en cas d’échec (« Ton rapport »), absents des maquettes, à
 * valider.
 */
export function AttenteSobre({ echec }: { echec?: ReactNode }) {
  const back = useRetourSinon("/app", { scroll: false });
  const [help, setHelp] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <div className="flex min-h-dvh justify-center bg-paper">
      <div className="flex w-full flex-col md:max-w-[560px] lg:max-w-[620px] lg:py-10">
        <EnTeteSobre back={back} />
        <main className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-3.5 px-[26px] pt-1 lg:flex-none lg:px-0 lg:pt-0">
            <div className="flex-1 lg:flex-none" />
            <h1 ref={titleRef} tabIndex={-1} className="m-0 text-titre-1 font-black leading-[1.08] tracking-[-0.02em] outline-none">
              {echec ? "Ton rapport" : "Ton rapport arrive."}
            </h1>
            {echec ?? (
              <p role="status" className="m-0 text-accent font-bold leading-[1.45] text-soft">
                BLUSH l’écrit au calme. Il est court, et il t’aide à y voir clair.
              </p>
            )}
            <div className="flex-1 lg:flex-none" />
          </div>
          <div className="flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 lg:mt-2.5 lg:w-[400px] lg:px-0 lg:pb-0 lg:pt-0">
            <SoberLink onClick={() => setHelp(true)}>{LIBELLES_RAPPORT.aide}</SoberLink>
          </div>
        </main>
      </div>
      <FeuilleAide open={help} onClose={() => setHelp(false)} titre={LIBELLES_RAPPORT.aide} />
    </div>
  );
}

/** `vocal` : le vocal doux de BLUSH, au-dessus de la nouvelle (src/app/rapport/Vocal.tsx). */
export function SoberReport({ data, vocal }: { data: SoberData; vocal?: ReactNode }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [help, setHelp] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  /* L’étape 2 revient à la 1 ; sinon la page d’avant, ou l’accueil quand on arrive d’ailleurs (le lien du mail) */
  const retourSinon = useRetourSinon("/app", { scroll: false });
  const back = () => (step === 2 ? setStep(1) : retourSinon());

  return (
    <div className="flex min-h-dvh justify-center bg-paper">
      <div className="flex w-full flex-col md:max-w-[560px] lg:max-w-[620px] lg:py-10">
        <EnTeteSobre back={back} />
        <main className="flex flex-1 flex-col">
          {step === 1 ? (
            <>
              <div className="flex flex-1 flex-col gap-3.5 px-[26px] pt-1 lg:flex-none lg:px-0 lg:pt-0">
                <div className="flex-1 lg:flex-none" />
                {vocal && <div className="mb-3">{vocal}</div>}
                <p className="m-0 text-[20px] font-extrabold leading-[1.45] text-soft">{data.intro}</p>
                <h1 ref={titleRef} tabIndex={-1} className="m-0 text-titre-1 font-black leading-[1.08] tracking-[-0.02em] outline-none">
                  {data.title}
                </h1>
                <p className="m-0 text-accent font-bold leading-[1.45] text-soft">{data.facts}</p>
                <p className="m-0 text-accent font-extrabold leading-[1.45] text-ink">{data.reassurance}</p>
                <div className="flex-1 lg:flex-none" />
              </div>
              <div className="flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 lg:mt-2.5 lg:w-[400px] lg:px-0 lg:pb-0 lg:pt-0">
                <SoberButton onClick={() => setStep(2)}>{"Et maintenant\u00a0?"}</SoberButton>
                <SoberLink onClick={() => setHelp(true)}>{data.helpLabel}</SoberLink>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-1 flex-col gap-[18px] px-[26px] pt-1 lg:flex-none lg:px-0 lg:pt-0">
                <h1 ref={titleRef} tabIndex={-1} className="m-0 text-[32px] font-black leading-[1.1] tracking-[-0.02em] outline-none">
                  Passe à autre chose, proprement.
                </h1>
                <ol className="m-0 flex list-none flex-col gap-[18px] p-0">
                  {data.steps.map((s, i) => (
                    <li key={s} className="flex items-start gap-3.5">
                      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[15px] text-note font-black text-soft shadow-[inset_0_0_0_2px_#D6D2C8]">
                        {i + 1}
                      </span>
                      <span className="text-corps font-bold leading-[1.45]">{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="rounded-[20px] bg-white p-4 shadow-[inset_0_0_0_1.5px_var(--color-track)]">
                  <span className="text-legende font-extrabold text-grey">{data.draftLabel}</span>
                  <p className="m-0 mt-1.5 text-corps font-bold leading-[1.45]">{data.draft}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 lg:mt-2.5 lg:w-[400px] lg:px-0 lg:pb-0 lg:pt-0">
                <SoberButton href={QUIT_HREF}>OK, merci</SoberButton>
                {/* Le rapport doux à garder, tel quel, en PDF (GET /api/rapport/pdf) */}
                <LienPdfSobre />
              </div>
            </>
          )}
        </main>
      </div>

      <FeuilleAide open={help} onClose={() => setHelp(false)} titre={data.helpLabel} />
    </div>
  );
}
