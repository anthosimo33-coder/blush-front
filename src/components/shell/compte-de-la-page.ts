import { createContext, useContext } from "react";
import type { Account } from "@/types/api";

/** Le compte lu par la page serveur (null : pas connecté), et l’heure de ce rendu (voir `rendu` dans useQuery). */
export type CompteDeLaPage = { compte: Account | null; rendu: number };

/** Donné par la page d’une conv (PoseConv, rendu par PageDeConv) ; à part : qui le lit ne pose pas la conv. */
export const CompteRendu = createContext<CompteDeLaPage | null>(null);

/**
 * Le compte que la page d’une conv a rendu (PageDeConv), pour la coque des écrans (AppScreen, useAccess) : son plan est là
 * dès l’affichage, sans relire /api/compte au montage. null hors d’une page de conv (« Tes convs ») : la coque le lit.
 */
export const useCompteDeLaPage = () => useContext(CompteRendu);
