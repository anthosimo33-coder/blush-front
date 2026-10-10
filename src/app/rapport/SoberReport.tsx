"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { setPaused } from "@/services/api";
import { invalidate } from "@/lib/query";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import type { SoberReport as SoberData } from "@/types";
import { pagePrecedente } from "@/lib/navigation";

/*
 * Écrans 18-19 — Mode sobre : quand le verdict est dur, BLUSH sort du jeu.
 * Pas de couleur de sens, pas de 3D, pas de score, pas de logo en volume. Encre et papier seulement.
 */
const QUIT_HREF = "/commencer"; /* « Quitter vite » mène à l’écran 01, comme dans la maquette */

/* ⚠ Ressources d’aide absentes des maquettes : à valider. */
const HELP = [
  { name: "Fil Santé Jeunes", detail: "Anonyme et gratuit, tous les jours de 9 h à 23 h", tel: "0800235236", label: "0 800 235 236" },
  { name: "SOS Amitié", detail: "À l’écoute 24 h sur 24", tel: "0972394050", label: "09 72 39 40 50" },
];

function SoberButton({ children, onClick, href }: { children: string; onClick?: () => void; href?: string }) {
  const cls = "flex h-[58px] w-full items-center justify-center rounded-[29px] bg-ink text-[17px] font-extrabold text-white no-underline";
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
    <button type="button" onClick={onClick} className="flex min-h-11 items-center justify-center text-[15px] font-black text-soft">
      {children}
    </button>
  );
}

/** `vocal` : le vocal doux de BLUSH, au-dessus de la nouvelle (src/app/rapport/Vocal.tsx). */
export function SoberReport({ data, vocal }: { data: SoberData; vocal?: ReactNode }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [help, setHelp] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  /* Ouvert directement (le lien du mail) : pas de page d’avant dans l’appli, le retour mène à l’accueil */
  const back = () => (step === 2 ? setStep(1) : pagePrecedente() ? router.back() : router.push("/app", { scroll: false }));

  return (
    <div className="flex min-h-dvh justify-center bg-paper">
      <div className="flex w-full flex-col md:max-w-[560px] lg:max-w-[620px] lg:py-10">
        {/* Retour à gauche, « Quitter vite » toujours visible à droite */}
        <header className="flex h-[60px] shrink-0 items-center justify-between px-4">
          <button type="button" aria-label="Retour" onClick={back} className="-ml-2.5 flex size-11 items-center justify-center">
            <Icon name="back" size={24} color="#4B4A47" stroke={2.4} />
          </button>
          <Link
            href={QUIT_HREF}
            replace
            className="relative flex h-[38px] items-center rounded-[19px] px-3.5 text-[14px] font-extrabold text-soft no-underline shadow-[inset_0_0_0_1.5px_#D6D2C8] after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
          >
            Quitter vite
          </Link>
        </header>
        <main className="flex flex-1 flex-col">

        {step === 1 ? (
          <>
            <div className="flex flex-1 flex-col gap-3.5 px-[26px] pt-1 lg:flex-none lg:px-0 lg:pt-0">
              <div className="flex-1 lg:flex-none" />
              {vocal && <div className="mb-3">{vocal}</div>}
              <p className="m-0 text-[20px] font-extrabold leading-[1.45] text-soft">{data.intro}</p>
              <h1 ref={titleRef} tabIndex={-1} className="m-0 text-[36px] font-black leading-[1.08] tracking-[-0.02em] outline-none">
                {data.title}
              </h1>
              <p className="m-0 text-[17px] font-bold leading-[1.45] text-soft">{data.facts}</p>
              <p className="m-0 text-[17px] font-extrabold leading-[1.45] text-ink">{data.reassurance}</p>
              <div className="flex-1 lg:flex-none" />
            </div>
            <div className="flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 lg:mt-2.5 lg:w-[400px] lg:px-0 lg:pb-0 lg:pt-0">
              <SoberButton onClick={() => setStep(2)}>Et maintenant ?</SoberButton>
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
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[15px] text-[14px] font-black text-soft shadow-[inset_0_0_0_2px_#D6D2C8]">{i + 1}</span>
                    <span className="text-[16px] font-bold leading-[1.45]">{s}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-[20px] bg-white p-4 shadow-[inset_0_0_0_1.5px_#E1DED7]">
                <span className="text-[13px] font-extrabold text-grey">{data.draftLabel}</span>
                <p className="m-0 mt-1.5 text-[16px] font-bold leading-[1.45]">{data.draft}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 lg:mt-2.5 lg:w-[400px] lg:px-0 lg:pb-0 lg:pt-0">
              <SoberButton href="/commencer">OK, merci</SoberButton>
              <SoberLink
                onClick={async () => {
                  await setPaused(true);
                  invalidate("account");
                  router.push("/compte");
                }}
              >
                Mettre mon abonnement en pause
              </SoberLink>
            </div>
          </>
        )}
        </main>
      </div>

      <Sheet open={help} onClose={() => setHelp(false)} labelledBy="help-title" belowHeader={false}>
        <h2 id="help-title" className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
          {data.helpLabel}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {HELP.map((h) => (
            <li key={h.name}>
              <a href={`tel:${h.tel}`} className="flex flex-col gap-0.5 rounded-[20px] bg-white p-4 text-ink no-underline shadow-[inset_0_0_0_1.5px_#E1DED7]">
                <span className="text-[16px] font-black">
                  {h.name} · {h.label}
                </span>
                <span className="text-[13px] font-extrabold text-grey">{h.detail}</span>
              </a>
            </li>
          ))}
        </ul>
        <SoberButton onClick={() => setHelp(false)}>Fermer</SoberButton>
      </Sheet>
    </div>
  );
}
