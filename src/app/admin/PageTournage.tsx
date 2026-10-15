"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { copyText } from "@/lib/hooks";
import { NOM_TOURNAGE_MAX } from "@/lib/limites";
import { gesteDeLEquipe } from "@/services/api";
import type { ConvCandidate, Manque, TournageAffiche } from "@/server/tournage";
import { EnTete } from "./EnTete";
import { CHAMP, Champ, Geste, issueDe, refus, type Issue } from "./GestesDeLEquipe";
import { Bloc } from "./morceaux";
import { SondeDuDirect } from "./SondeDuDirect";

/*
 * /admin/tournage : le mode tournage (src/server/tournage.ts). Une conv de l’équipe, lue une fois en entier, devient une
 * conv de tournage : un lien à envoyer aux créatrices de sa campagne, qui rejoue sa lecture chez chacune, sans IA et sans
 * paiement. Ici, la créer depuis une conv de son compte, copier son lien, voir ses prises, l’arrêter. Les dates arrivent
 * déjà écrites par la page (l’heure de Paris).
 */

const pluriel = (n: number, mot: string) => `${n.toLocaleString("fr-FR")} ${mot}${n > 1 ? "s" : ""}`;

/** Ce qui manque à une conv pour devenir une conv de tournage, dit dans la liste. */
const MANQUES: Record<Manque, string> = {
  pas_lue: "pas encore lue",
  en_cours: "rapport en cours d’écriture",
  sans_rapport: "rapport pas écrit",
  sans_memoire: "mémoire pas faite",
};

/** `tournages` et `convs` : lus par la page (leurs dates déjà écrites). */
export function PageTournage({ tournages, convs }: { tournages: TournageAffiche[]; convs: ConvCandidate[] }) {
  const pretes = convs.filter((c) => !c.manque);
  const [conv, setConv] = useState(pretes[0]?.id ?? "");
  const [nom, setNom] = useState("");
  return (
    <SondeDuDirect initial={null}>
      <main className="min-h-dvh pb-32 md:pb-16">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pt-4 md:gap-6 md:px-8 md:pt-6">
          <EnTete base="/admin" ici="tournage" />

          <div className="flex flex-col gap-1.5 md:mt-2">
            <h1 className="m-0 text-[34px] font-black leading-[1.05] tracking-[-0.035em] md:text-[44px]">Tournage</h1>
            <p className="m-0 max-w-[720px] text-detail font-extrabold text-grey">
              Une conv lue une fois par BLUSH, rejouée chez chaque créatrice{NBSP}: la même lecture, le même verdict, le même rapport, sans appel à l’IA ni paiement. Seul le chat
              reste le vrai.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-6">
            <Bloc id="nouvelle" titre="Nouvelle conv de tournage" sous="Depuis une conv de ton compte, lue en entier">
              <ol className="m-0 mt-4 flex list-decimal flex-col gap-1.5 pl-5 text-note font-bold text-grey">
                <li>Importe la conv de la campagne dans BLUSH, avec ce compte, comme une créatrice le ferait.</li>
                <li>Ouvre son rapport en entier une fois, et attends sa fiche.</li>
                <li>Choisis-la ici, nomme-la, puis envoie son lien aux créatrices.</li>
              </ol>
              <div className="mt-4">
                <Geste
                  titre="Créer son lien"
                  aide="Noté au journal de l’équipe."
                  bouton="Créer le lien"
                  envoyer={async () => {
                    const r = await gesteDeLEquipe({ action: "tournage", conv, nom });
                    if (r.action === "tournage" && !r.refus) setNom("");
                    return r;
                  }}
                >
                  <Champ label="La conv">
                    {(id) => (
                      <select id={id} required value={conv} onChange={(e) => setConv(e.target.value)} className={CHAMP}>
                        {!convs.length && <option value="">Aucune conv lue dans ce compte</option>}
                        {convs.map((c) => (
                          <option key={c.id} value={c.id} disabled={!!c.manque}>
                            {`${c.emoji} ${c.autre} · ${c.titre || "sans verdict"} · ${c.le}${c.manque ? ` (${MANQUES[c.manque]})` : ""}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </Champ>
                  <Champ label="Son nom (la campagne)">
                    {(id) => (
                      <input
                        id={id}
                        required
                        maxLength={NOM_TOURNAGE_MAX}
                        autoComplete="off"
                        placeholder="A · Il répond plus pareil"
                        value={nom}
                        onChange={(e) => setNom(e.target.value)}
                        className={CHAMP}
                      />
                    )}
                  </Champ>
                </Geste>
              </div>
            </Bloc>

            <Bloc id="liens" titre="Les liens" sous={`Un par campagne\u00a0: à ouvrir sur le téléphone qui filme`}>
              {tournages.length ? (
                <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
                  {tournages.map((t) => (
                    <LigneDuTournage key={t.id} t={t} />
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-4 text-note font-extrabold text-grey">Aucune conv de tournage pour l’instant.</p>
              )}
            </Bloc>
          </div>

          <p className="m-0 text-center text-note font-extrabold text-grey">
            Ne supprime pas de ton compte une conv de tournage{NBSP}: son lien s’arrêterait. Chaque nouvelle prise d’une créatrice remplace la précédente.
          </p>
        </div>
      </main>
    </SondeDuDirect>
  );
}

/** Une conv de tournage : son nom, sa conv, son lien à copier, ses prises, et l’arrêter. */
function LigneDuTournage({ t }: { t: TournageAffiche }) {
  const router = useRouter();
  const [copie, setCopie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const copier = async () => {
    if (await copyText(`${window.location.origin}${t.lien}`)) {
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    }
  };
  const arreter = async () => {
    if (envoi || !window.confirm(`Arrêter «\u00a0${t.nom}\u00a0»\u00a0? Son lien ne marchera plus (les prises déjà faites restent).`)) return;
    setEnvoi(true);
    try {
      setIssue(issueDe(await gesteDeLEquipe({ action: "tournage_arret", id: t.id })));
      router.refresh();
    } catch (e) {
      setIssue(refus(e));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <li className={cn("flex flex-col gap-3 rounded-[18px] border-2 border-sep p-4", t.arrete && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-note font-black">{t.nom}</h3>
          <p className="m-0 mt-0.5 text-micro font-extrabold text-grey">
            {t.emoji} {t.titre || "Sans verdict"} · avec {t.autre} · créée le {t.creeLe}
          </p>
        </div>
        {t.arrete && <span className="shrink-0 rounded-full bg-sep px-2.5 py-1 text-legende font-black text-soft">Arrêtée</span>}
      </div>
      {!t.arrete && (
        <code className="block min-w-0 overflow-x-auto whitespace-nowrap rounded-[12px] bg-[#F8F7F4] px-3 py-2.5 text-micro font-bold text-ink" translate="no">
          {t.lien}
        </code>
      )}
      <p className="m-0 text-micro font-extrabold text-soft">
        {t.comptes ? `${pluriel(t.comptes, "créatrice")} avec une prise · la dernière le ${t.derniere ?? "—"}` : "Aucune prise pour l’instant"}
      </p>
      {!t.arrete && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="md" onClick={() => void copier()}>
            {copie ? "Copié" : "Copier le lien"}
          </Button>
          <Button variant="secondary" size="md" loading={envoi} onClick={() => void arreter()}>
            Arrêter
          </Button>
        </div>
      )}
      {issue && (
        <p role="status" className={cn("m-0 text-micro font-black", issue.ok ? "text-vrai-ink" : "text-danger")}>
          {issue.texte}
        </p>
      )}
    </li>
  );
}
