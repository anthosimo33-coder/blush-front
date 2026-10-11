/*
 * Avant chaque fichier du projet `client` (vitest.config.mts) : ce qu’un test a rendu est démonté à sa fin. Le
 * nettoyage automatique de @testing-library/react ne se branche que sur un `afterEach` global, que vitest ne donne pas.
 */
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
