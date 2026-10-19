import { RepereTournage } from "@/components/shell/RepereTournage";

/*
 * Les écrans de l’import (les captures, l’export, la conv ajoutée, l’histoire réunie), statiques ou non : le repère du
 * mode tournage, pour l’équipe seulement, posé une fois pour tous (une seule lecture d’un écran de l’import à l’autre).
 */
export default function Layout({ children }: LayoutProps<"/importer">) {
  return (
    <>
      {children}
      <RepereTournage />
    </>
  );
}
