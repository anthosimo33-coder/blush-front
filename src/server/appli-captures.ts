import "server-only";
import { z } from "zod";

/** Les applis dont on lit des captures ou un enregistrement d’écran (sans export lisible). */
export const AppliCaptures = z.enum(["instagram", "hinge", "imessage", "autre"]);
