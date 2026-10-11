import { FlowSteps } from "@/components/ui/progress";
import { MobileTopBar, Screen, type ScreenProps } from "./Screen";
import type { BackTarget } from "./BoutonRetour";

/** L’étape du parcours : ta conv, qui est qui, ton email (FlowSteps). */
export type EtapeParcours = 1 | 2 | 3;

/**
 * Un écran du parcours (l’appli, l’import, qui est qui, l’email, le code) : la barre du haut mobile avec son retour et
 * les points de l’étape, le « Retour » desktop vers la même cible, et les trois étapes en colonne d’appoint. Sans `step`
 * (la connexion, qui n’est pas une étape du parcours) : le retour seul. `retourDesktop={false}` quand le logo de
 * l’en-tête suffit (le choix de l’appli, première étape).
 */
export function ParcoursScreen({
  step,
  back,
  retourDesktop = true,
  ...props
}: { step?: EtapeParcours; back: BackTarget; retourDesktop?: boolean } & Omit<ScreenProps, "mobileTop" | "desktopBack" | "aside">) {
  return (
    <Screen
      mobileTop={<MobileTopBar back={back} progress={step} />}
      desktopBack={retourDesktop ? { target: back } : undefined}
      aside={step ? <FlowSteps step={step} /> : undefined}
      {...props}
    />
  );
}
