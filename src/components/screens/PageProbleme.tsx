import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { Screen } from "@/components/shell/Screen";

/**
 * Une page qui ne peut pas s’afficher (une erreur, une adresse inconnue), dans le style des écrans d’erreur de BLUSH
 * (src/components/screens/ErrorScreen.tsx) : une icône, ce qui se passe, ce qu’on fait. Pas d’alarme.
 */
export function PageProbleme({ titre, texte, action }: { titre: string; texte: string; action: ReactNode }) {
  return (
    <Screen mise="colonne" footer={action}>
      <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center lg:flex-none lg:pb-0 lg:pt-[max(24px,calc(50dvh_-_330px))]">
        <span aria-hidden="true" className="flex size-[76px] items-center justify-center rounded-full bg-plaque">
          <Icon name="alert" size={34} color="#121214" stroke={2.2} />
        </span>
        <h1 className="m-0 mt-5 text-[30px] font-black leading-[1.08] tracking-[-0.02em] [text-wrap:balance] lg:text-[34px]">{titre}</h1>
        <p className="m-0 mt-3 max-w-[400px] text-[16px] font-extrabold leading-[1.45] text-soft">{texte}</p>
      </div>
    </Screen>
  );
}
