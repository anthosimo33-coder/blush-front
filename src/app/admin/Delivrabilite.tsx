import { NOMS_DES_MAILS } from "@/contenu/mails";
import { estUneRelance, SEUILS_DELIVRABILITE, VOLUME_MIN_DES_REBONDS } from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { ChiffresDesMails, Delivrabilite as Chiffres } from "@/server/delivrabilite";
import { nombre, pourcent, rapport } from "./calculs";
import { Bloc } from "./morceaux";

/*
 * Ce que Resend dit des mails (src/server/delivrabilite.ts, par son webhook), sur 7 jours quelle que soit la période :
 * partis, remis, les rebonds et les plaintes face aux seuils de Resend, les retards et les mails bloqués par sa liste de
 * suppression. Le domaine principal (les codes, les rapports, la liste d’attente, les alertes) d’un côté, les relances
 * (la relance ②, les séquences) de l’autre : leur sous-domaine protège le premier.
 */

/** Le nom d’une sorte (SorteSuivie, src/server/email.ts) pour l’équipe. */
const NOMS_DES_SORTES: Record<string, string> = {
  code: "Codes de connexion",
  rapport: "Ton rapport est prêt",
  attente: "Liste d’attente",
  alerte: "Alertes de l’équipe",
  relance: "Relance ② · ton rapport t’attend",
  inconnue: "Sans sorte (avant le suivi, ou un essai)",
};

function nomDeLaSorte(sorte: string): string {
  const cle = sorte.replace(/^sequence-/, "");
  if (sorte !== cle && cle in NOMS_DES_MAILS) return NOMS_DES_MAILS[cle as keyof typeof NOMS_DES_MAILS];
  return NOMS_DES_SORTES[sorte] ?? sorte;
}

/**
 * Un nombre d’événements et sa part (`n` sur `sur`), rouge au seuil, orange à sa moitié. `juge` faux : trop peu de mails
 * pour juger la part (les rebonds sous VOLUME_MIN_DES_REBONDS), elle s’écrit sans couleur.
 */
function Part({ n, sur, seuil, juge = true, decimales }: { n: number; sur: number; seuil: number; juge?: boolean; decimales: number }) {
  const t = rapport(n, sur);
  if (!n) return <span className="tabular-nums text-soft">0</span>;
  const ton = !juge || t === null ? "text-ink" : t >= seuil ? "text-danger" : t >= seuil / 2 ? "text-attente-ink" : "text-vrai-ink";
  return (
    <span className={cn("font-black tabular-nums", ton)}>
      {nombre(n)}
      {t !== null && <span className="font-extrabold"> · {pourcent(t * 100, decimales)}</span>}
    </span>
  );
}

/** Une ligne du tableau : une sorte, ou le total d’un domaine (`total`, en gras sur fond). */
function Ligne({ nom, c, total = false }: { nom: string; c: ChiffresDesMails; total?: boolean }) {
  return (
    <tr className={cn("border-t border-sep text-detail", total ? "bg-paper font-black" : "font-extrabold")}>
      <th scope="row" className={cn("py-2.5 pr-3 text-left", total ? "pl-2 font-black" : "pl-4 font-extrabold")}>
        {nom}
      </th>
      <td className="py-2.5 pr-3 text-right tabular-nums">{nombre(c.partis)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{nombre(c.delivres)}</td>
      <td className="py-2.5 pr-3 text-right">
        <Part n={c.rebonds} sur={c.partis} seuil={SEUILS_DELIVRABILITE.rebonds} juge={c.partis >= VOLUME_MIN_DES_REBONDS} decimales={1} />
      </td>
      <td className="py-2.5 pr-3 text-right">
        <Part n={c.plaintes} sur={Math.max(c.delivres, c.plaintes)} seuil={SEUILS_DELIVRABILITE.plaintes} decimales={2} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{c.retards ? <span className="text-attente-ink">{nombre(c.retards)}</span> : <span className="text-soft">0</span>}</td>
      <td className="py-2.5 pr-2 text-right tabular-nums">{c.bloques ? nombre(c.bloques) : <span className="text-soft">0</span>}</td>
    </tr>
  );
}

const PARIS = "Europe/Paris";

/** Le bloc « Délivrabilité » du pilotage. */
export function Delivrabilite({ d }: { d: Chiffres }) {
  const groupes = [
    { nom: `Domaine principal · ${d.domaines.principal}`, total: d.principal, sortes: d.sortes.filter((s) => !estUneRelance(s.sorte)) },
    { nom: `Relances · ${d.domaines.relances}`, total: d.relances, sortes: d.sortes.filter((s) => estUneRelance(s.sorte)) },
  ];
  return (
    <Bloc id="delivrabilite" titre="Délivrabilité" sous={`Ce que Resend dit des mails, sur les ${d.jours}\u00a0derniers jours (quelle que soit la période)`}>
      {!d.branche ? (
        <p className="m-0 mt-4 text-detail font-bold text-attente-ink">Le webhook de Resend n’est pas branché (RESEND_WEBHOOK_SECRET manque){NBSP}: rien n’arrive ici.</p>
      ) : !d.sortes.length ? (
        <p className="m-0 mt-4 text-detail font-bold text-grey">
          {d.dernier ? `Aucun événement sur les ${d.jours}\u00a0derniers jours.` : "Branché, mais aucun événement reçu encore\u00a0: le webhook est-il créé chez Resend\u00a0?"}
        </p>
      ) : (
        <div role="region" aria-label="La délivrabilité des mails, à faire défiler" tabIndex={0} className="-mx-2 mt-4 overflow-x-auto px-2">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Les mails partis, remis, leurs rebonds, leurs plaintes, leurs retards et ceux bloqués, par sorte</caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 pl-2 font-black">
                  Mails
                </th>
                {["Partis", "Remis", "Rebonds", "Plaintes", "Retards", "Bloqués"].map((t) => (
                  <th key={t} scope="col" className="pb-2.5 pr-3 text-right font-black last:pr-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            {groupes.map((g) => (
              <tbody key={g.nom}>
                <Ligne nom={g.nom} c={g.total} total />
                {g.sortes.map((s) => (
                  <Ligne key={s.sorte} nom={nomDeLaSorte(s.sorte)} c={s} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="m-0 mt-4 text-note font-bold text-soft">
        <span className="font-black text-ink">Seuils.</span> Resend{NBSP}: rebonds sous {pourcent(SEUILS_DELIVRABILITE.rebonds * 100, 0)} des mails partis (jugés à partir de{" "}
        {VOLUME_MIN_DES_REBONDS} mails), plaintes sous {pourcent(SEUILS_DELIVRABILITE.plaintes * 100, 2)} des mails remis. Gmail{NBSP}: spam sous{" "}
        {pourcent(SEUILS_DELIVRABILITE.spamGmail * 100)}, jamais {pourcent(SEUILS_DELIVRABILITE.spamGmailJamais * 100)}. Les plaintes de Gmail n’arrivent pas jusqu’à Resend
        {NBSP}: elles se lisent dans Google Postmaster Tools. Un seuil franchi prévient l’équipe, une fois par jour au plus.
      </p>
      {d.dernier && (
        <p className="m-0 mt-1.5 text-micro font-extrabold text-grey">
          Dernier événement reçu{NBSP}: {new Date(d.dernier).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: PARIS })}
        </p>
      )}
    </Bloc>
  );
}
