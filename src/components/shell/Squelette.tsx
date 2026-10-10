import { TypingDots } from "@/components/ui/FileInput";
import { DesktopHeader, MobileTopBar } from "./Screen";

/**
 * Ce qu’on voit dès le toucher, le temps que le serveur rende la page (les loading.tsx des pages feuilles) : le fond
 * papier et la barre du haut de l’écran qui s’ouvre, à sa place, puis les trois points de BLUSH, seulement si ça dure
 * plus de 100 ms (une page rapide ne clignote pas). Sobre : pas de faux contenu qui sauterait à l’arrivée du vrai.
 */
export function Squelette({ titre }: { titre?: string }) {
  return (
    <div aria-busy="true" className="mx-auto flex min-h-dvh w-full flex-col md:max-w-[560px] lg:max-w-none">
      <MobileTopBar title={titre} />
      <DesktopHeader />
      <div className="flex flex-1 items-center justify-center pb-[18vh]" style={{ animation: "fadeIn 0.25s ease-out 0.1s both" }}>
        <TypingDots label="Ça arrive" />
      </div>
    </div>
  );
}
