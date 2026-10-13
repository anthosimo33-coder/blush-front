import { NBSP } from "@/lib/format";
import type { Direct } from "@/types/api";
import { EcranDuDirect } from "./EcranDuDirect";
import { EnTete, type BaseDeLAdmin } from "./EnTete";
import { MisAJour, SondeDuDirect } from "./SondeDuDirect";

/*
 * La page /admin/direct (et son aperçu) : l’en-tête d’/admin, l’heure de la dernière lecture, puis l’écran du direct, qui
 * se relit toutes les 5 s (SondeDuDirect).
 */

/** `d` : le direct lu par la page ; `sonder` faux : l’aperçu, figé. */
export function PageEnDirect({ d, base = "/admin", sonder = true }: { d: Direct; base?: BaseDeLAdmin; sonder?: boolean }) {
  return (
    <SondeDuDirect initial={d} sonder={sonder}>
      <main className="min-h-dvh pb-32 md:pb-16">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pt-4 md:gap-6 md:px-8 md:pt-6">
          <EnTete base={base} ici="direct" droite={<MisAJour className="m-0 text-note font-extrabold text-grey" />} />
          <EcranDuDirect />
          <p className="m-0 text-center text-note font-extrabold text-grey">
            L’adresse IP n’est jamais gardée{NBSP}: seule la ville sort de la connexion, et un onglet fermé disparaît en une minute et demie au plus.
          </p>
        </div>
      </main>
    </SondeDuDirect>
  );
}
