import { demarrerLaMesure } from "@/lib/analytique";

/*
 * L’instrumentation du navigateur (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md) :
 * Next la lance avant que la page ne réponde. Elle ne fait que lancer la mesure d’audience (src/lib/analytique.ts), qui
 * attend elle-même que la page soit prête ; sans la clé de PostHog, rien.
 */
demarrerLaMesure();
