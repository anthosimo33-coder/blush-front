import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { PageProbleme } from "@/components/screens/PageProbleme";

export const metadata: Metadata = { title: "Page introuvable" };

/** Une adresse qui ne mène nulle part. */
export default function Introuvable() {
  return (
    <PageProbleme
      titre="Cette page n’existe pas."
      texte="Le lien est peut-être incomplet. Ta conv, elle, t’attend sur l’accueil."
      action={<ButtonLink href="/">Revenir à l’accueil</ButtonLink>}
    />
  );
}
