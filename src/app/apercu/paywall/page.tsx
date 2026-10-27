import type { Metadata } from "next";
import { GENRES_DU_HAUT, type GenreDuHaut } from "@/contenu/haut-du-paywall";
import { Paywall } from "../../lecture/Paywall";
import { EXEMPLES, exempleDuVolume, STORY_COURTE, STORY_D_EXEMPLE, SUR_LA_CONV_COURTE, VARIANTES_DU_VOLUME, type VarianteDuVolume } from "./exemples";

export const metadata: Metadata = { title: "Aperçu du paywall" };
export const dynamic = "force-dynamic";

/** `?question=` : la suite ouverte d’avance (FeuilleQuiCoince), ou l’offre ① (`offre`). */
const QUESTIONS = { coince: "question", cher: "cher", confiance: "confiance", plus_tard: "plusTard", bug: "bug", offre: "offre" } as const;

/**
 * Hors de Vercel seulement (src/proxy.ts) : le paywall d’une conv inventée, avec le titre choisi (`?titre=contraste`,
 * `toi`, `elle`, `egalite`, `tendance`, `aucun` ; contraste par défaut). Les cinq titres du haut, côte à côte dans la
 * galerie de l’équipe, sans passer par un import ni payer. `?titre=volume` (une proposition du 27 octobre 2026) : le titre
 * des convs sans heures, sur une conv courte lue sur des captures, comme `aucun`, le titre d’avant qu’il remplace ; ses
 * variantes par `?variante=toi`, `elle`, `autant` (Inès écrit plus et Lucas plus long, par défaut). `?question=coince` : « Qu’est-ce qui coince ? » ouverte
 * d’avance (la proposition du 26 octobre, FeuilleQuiCoince), ou directement la suite d’une réponse (`cher`, `confiance`,
 * `plus_tard`, `bug`), ou l’offre ① qui suit « C’est trop cher » (`offre`).
 */
export default async function Page({ searchParams }: PageProps<"/apercu/paywall">) {
  const { titre, question, variante } = await searchParams;
  const genre: GenreDuHaut = GENRES_DU_HAUT.find((g) => g === titre) ?? "contraste";
  const ouverte = typeof question === "string" && question in QUESTIONS ? QUESTIONS[question as keyof typeof QUESTIONS] : undefined;
  const v = typeof variante === "string" && variante in VARIANTES_DU_VOLUME ? (variante as VarianteDuVolume) : undefined;
  const apercu = genre === "volume" ? exempleDuVolume(v) : EXEMPLES[genre];
  const story = SUR_LA_CONV_COURTE.includes(genre) ? STORY_COURTE : STORY_D_EXEMPLE;
  return <Paywall key={`${genre}-${v ?? ""}`} story={story} apercu={apercu} {...(ouverte ? { question: ouverte } : {})} />;
}
