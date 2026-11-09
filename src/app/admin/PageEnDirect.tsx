import { NBSP } from "@/lib/format";
import type { Direct } from "@/types/api";
import { EcranDuDirect } from "./EcranDuDirect";
import type { BaseDeLAdmin } from "./EnTete";
import { Cadre } from "./Rangement";
import { MisAJour, SondeDuDirect } from "./SondeDuDirect";

/*
 * La page /admin/direct (et son aperçu) : le cadre d’/admin (ses rubriques), l’heure de la dernière lecture, puis l’écran du direct, qui
 * se relit toutes les 5 s (SondeDuDirect).
 */

/** `d` : le direct lu par la page ; `sonder` faux : l’aperçu, figé. */
export function PageEnDirect({ d, base = "/admin", sonder = true }: { d: Direct; base?: BaseDeLAdmin; sonder?: boolean }) {
  return (
    <SondeDuDirect initial={d} sonder={sonder}>
      <Cadre base={base} ici="direct">
        <div className="flex flex-col gap-4 pt-4 md:gap-5 lg:pt-6">
          <MisAJour className="m-0 text-note font-extrabold text-grey lg:text-right" />
          <EcranDuDirect />
          <p className="m-0 text-center text-note font-extrabold text-grey">
            L’adresse IP n’est jamais gardée{NBSP}: seule la ville sort de la connexion, et un onglet fermé disparaît en une minute et demie au plus.
          </p>
        </div>
      </Cadre>
    </SondeDuDirect>
  );
}
