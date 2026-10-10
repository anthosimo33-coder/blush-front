import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CHAPITRES_PAYANTS, estOffert, titreDAttente } from "@/contenu/chapitres";
import type { EcritureRapport, EtatChapitre, ReportPayload } from "@/services/api";
import { ReportScreen } from "../../rapport/ReportScreen";
import { AUTRE, REPORT as report, STORY as story } from "./exemple";

export const metadata: Metadata = { title: "Aperçu de l’écriture du rapport" };
export const dynamic = "force-dynamic";

/** En local seulement : le rapport pendant son écriture, à trois moments (?etat=plan | chapitres | presque | lecture). */
export default async function Page({ searchParams }: PageProps<"/apercu/ecriture">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { etat = "chapitres" } = await searchParams;
  /* Le chapitre offert se lit déjà ; les payants s’écrivent, sous leurs titres d’attente tant que le plan n’est pas fait */
  const suite = report.chapters.filter((c) => CHAPITRES_PAYANTS.includes(c.number));
  const etats: Record<string, { etape: EcritureRapport["etape"]; progres: number; restant: string | null; e: EtatChapitre[] }> = {
    plan: { etape: "plan", progres: 0.14, restant: "2 min", e: ["attente", "attente", "attente", "attente", "attente", "attente", "attente"] },
    chapitres: { etape: "chapitres", progres: 0.58, restant: "1 min", e: ["ecrit", "en_cours", "attente", "ecrit", "en_cours", "attente", "attente"] },
    presque: { etape: "chapitres", progres: 0.93, restant: "10 s", e: ["ecrit", "ecrit", "ecrit", "ecrit", "ecrit", "ecrit", "en_cours"] },
    /* Les chapitres 2 et 3 déjà finis se lisent ; le 5, prêt en avance, attend que le 4 le soit */
    lecture: { etape: "chapitres", progres: 0.64, restant: "50 s", e: ["ecrit", "ecrit", "en_cours", "ecrit", "en_cours", "attente", "attente"] },
  };
  const lisibles = etat === "lecture" ? [2, 3] : [];
  const s = etats[typeof etat === "string" && etat in etats ? etat : "chapitres"];
  const ecriture: EcritureRapport = {
    etape: s.etape,
    progres: s.progres,
    restant: s.restant,
    chapitres: suite.map((c, k) => ({ number: c.number, title: s.etape === "plan" ? titreDAttente(c.number, AUTRE) : c.tocTitle, etat: s.e[k] ?? "attente" })),
  };
  const payload: ReportPayload = {
    report: {
      ...report,
      chapters: [
        ...report.chapters.filter((c) => estOffert(c.number)).map((c) => ({ ...c, locked: false })),
        ...suite.map((c, k) => (lisibles.includes(c.number) ? { ...c, locked: false } : { ...c, tocTitle: ecriture.chapitres[k].title, locked: true, blocks: [] })),
      ],
    },
    sober: null,
    access: "blushplus",
    generating: true,
    ecriture,
  };
  return <ReportScreen initial={payload} story={story} openPaywall={false} fixed />;
}
