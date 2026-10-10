import { APPLIS, type AppKind } from "@/types";

/* Une clé d’APPLIS (pas une propriété héritée comme « toString ») */
const estAppli = (app: unknown): app is AppKind => typeof app === "string" && Object.keys(APPLIS).includes(app);

/** L’appli et le mode de l’adresse (?app=, ?mode=) : une appli connue seulement, et l’ajout à une conv déjà là. */
export const adresseDesCaptures = (app: unknown, mode: unknown) => ({ appli: estAppli(app) ? app : null, ajout: mode === "ajout" });
