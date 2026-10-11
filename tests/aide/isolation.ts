import { afterAll } from "vitest";
import { effacerCeQuiAEteCree } from "./nettoyage";

/*
 * Lancé avant chaque fichier du projet `db` (setupFiles, vitest.config.mts) : à la fin du fichier, ce que ses fixtures
 * ont créé est effacé. Les `afterAll` du fichier passent d’abord (vitest lance les « après » dans l’ordre inverse de
 * leur déclaration, sequence.hooks « stack »), avec les comptes encore là.
 */
afterAll(effacerCeQuiAEteCree);
