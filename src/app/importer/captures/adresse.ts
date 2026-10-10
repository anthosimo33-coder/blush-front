import type { AppKind } from "@/types";

const APPS: AppKind[] = ["instagram", "hinge", "autre", "whatsapp", "imessage"];

/** L’appli et le mode de l’adresse (?app=, ?mode=) : une appli connue seulement, et l’ajout à une conv déjà là. */
export const adresseDesCaptures = (app: unknown, mode: unknown) => ({ appli: APPS.includes(app as AppKind) ? (app as AppKind) : null, ajout: mode === "ajout" });
