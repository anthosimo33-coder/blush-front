import type { Periode, StatsAdmin } from "@/server/stats";
import { AdminScreen } from "@/app/admin/AdminScreen";

/** Hors de Vercel seulement (src/proxy.ts) : le tableau de bord avec des chiffres d’exemple (`?p=1|7|30`, `&calme=1` : sans échec). */
export default async function Page({ searchParams }: PageProps<"/apercu/admin">) {
  const q = await searchParams;
  const p = Number(q.p);
  const jours: Periode = p === 1 || p === 30 ? p : 7;
  const nb = jours === 30 ? 30 : 14;
  const activite = Array.from({ length: nb }, (_, k) => {
    const d = new Date(Date.UTC(2026, 9, 8 - (nb - 1 - k)));
    const vague = Math.round(4 + 3 * Math.sin(k / 2) + k / 2);
    return { jour: d.toISOString().slice(0, 10), imports: vague + 3, verdicts: vague, rapports: Math.max(0, vague - 3) };
  });
  const s: StatsAdmin = {
    jours,
    le: new Date().toISOString(),
    cles: {
      comptes: { valeur: 23, avant: 14 },
      convs: { valeur: 61, avant: 40 },
      verdicts: { valeur: 48, avant: 33 },
      rapports: { valeur: 19, avant: 21 },
      messages: { valeur: 412, avant: 260 },
      actifs: { valeur: 15, avant: 15 },
    },
    parcours: { importees: 61, compte: 44, verdict: 41, rapport: 19, chat: 14 },
    activite,
    partage: { ouvertures: 27, liens: 18, apercus: 52, visites: 38, essais: 11, imports: 6, actifs: 22 },
    couts: {
      total: 41.37,
      avant: 33.9,
      parRapport: 1.38,
      parVerdict: 0.14,
      postes: [
        { nom: "Rapport", dollars: 26.22, appels: 38 },
        { nom: "Chat", dollars: 6.84, appels: 412 },
        { nom: "Verdict", dollars: 6.72, appels: 48 },
        { nom: "Mémoire", dollars: 1.59, appels: 31 },
      ],
    },
    sante:
      q.calme === "1"
        ? { echecs: [], enCours: 2, bloquees: 0, enAttente: 1 }
        : {
            echecs: [
              { code: "refus", n: 2 },
              { code: "panne", n: 1 },
            ],
            enCours: 2,
            bloquees: 1,
            enAttente: 1,
          },
    beta: { fermee: true, invites: 12, attente: 87, attenteNouveaux: 9, comptes: 31 },
  };
  return <AdminScreen s={s} base="/apercu/admin" />;
}
