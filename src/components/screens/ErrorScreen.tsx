"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useId } from "react";
import { copieDe } from "@/lib/copie-erreur";
import type { ErreurParcours } from "@/lib/messages-erreur";
import { useSoundOnce } from "@/lib/sound";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { MobileTopBar, Screen } from "@/components/shell/Screen";

/** L’écran d’erreur du parcours d’import, posé sur l’écran où elle arrive ; ses textes et ses liens : copieDe (src/lib/copie-erreur.ts). */
export function ErrorScreen({ kind }: { kind: ErreurParcours }) {
  const c = copieDe(kind, usePathname(), useSearchParams());
  const id = useId();
  /* Une erreur se dit doucement : deux touchers sourds, sans buzzer */
  useSoundOnce("non");
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-titre`} aria-describedby={`${id}-texte`} className="fixed inset-0 z-50 overflow-y-auto [background:var(--paper-light)] bg-paper">
      <Screen mobileTop={<MobileTopBar back={c.back} />} desktopBack={{ target: c.back }} mise="colonne" footer={<ButtonLink href={c.href}>{c.action}</ButtonLink>}>
        {/* Centré, calme : une icône, ce qui se passe, ce qu’on fait. Pas d’alarme. */}
        <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center lg:flex-none lg:pb-0 lg:pt-[max(24px,calc(50dvh_-_330px))]">
          <span aria-hidden="true" className="flex size-[76px] items-center justify-center rounded-full bg-plaque">
            <Icon name="alert" size={34} color="#121214" stroke={2.2} />
          </span>
          <h1 id={`${id}-titre`} className="m-0 mt-5 text-[30px] font-black leading-[1.08] tracking-[-0.02em] [text-wrap:balance] lg:text-[34px]">
            {c.title}
          </h1>
          <p id={`${id}-texte`} className="m-0 mt-3 max-w-[400px] text-[16px] font-extrabold leading-[1.45] text-soft">
            {c.text}
          </p>
        </div>
      </Screen>
    </div>
  );
}
