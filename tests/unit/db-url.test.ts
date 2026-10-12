import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { urlVerifiee } from "../../scripts/base.mjs";

/*
 * L’URL que le pool de l’appli (src/server/db/index.ts) donne à pg (S-36) : la règle de scripts/base.mjs, celle des
 * migrations. Hors de la machine, `sslmode=verify-full` écrit en clair : pg vérifie le certificat comme avant (il
 * traitait déjà `require` ainsi), mais ne l’écrit plus dans les logs (« SECURITY WARNING: The SSL modes… »).
 * Un client pg qu’on ne connecte pas suffit : son constructeur lit l’URL (pg-connection-string) et en tire le TLS.
 */
const NEON = "postgres://moi:secret@ep-exemple-123.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
/** Un mot de passe avec @, / et : encodés en % : la réécriture ne doit ni les décoder ni les encoder deux fois. */
const ENCODE = "postgres://moi:p%40ss%2Fw%3Ard@ep-exemple-123-pooler.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require";
const LOCALES = ["postgres://localhost:5432/blush_dev", "postgres://127.0.0.1/blush_test", "postgres://base.localhost/blush"];

/** Ce que pg comprend d’une URL, et les avertissements qu’il émet en la lisant. */
function lireParPg(url: string) {
  const avertissements: string[] = [];
  const espion = vi.spyOn(process, "emitWarning").mockImplementation((w: string | Error) => {
    avertissements.push(String(w));
  });
  try {
    const client = new Client({ connectionString: url });
    return { client, avertissements };
  } finally {
    espion.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("l’URL de la base donnée au pool (S-36)", () => {
  it("hors de la machine, dit verify-full et garde le reste de l’URL", () => {
    const u = new URL(urlVerifiee(NEON));
    expect(u.searchParams.get("sslmode")).toBe("verify-full");
    expect(u.searchParams.get("channel_binding")).toBe("require");
    expect(u.hostname).toBe("ep-exemple-123.eu-central-1.aws.neon.tech");
    expect(u.pathname).toBe("/neondb");
  });

  it("garde un mot de passe encodé tel quel : pg le relit en clair", () => {
    const url = urlVerifiee(ENCODE);
    expect(url).toContain("moi:p%40ss%2Fw%3Ard@");
    const { client } = lireParPg(url);
    expect(client.password).toBe("p@ss/w:rd");
    expect(client.port).toBe(5432);
  });

  it("laisse le Postgres de la machine sans TLS", () => {
    for (const url of LOCALES) {
      expect(urlVerifiee(url), url).toBe(url);
      expect(lireParPg(urlVerifiee(url)).client.ssl, url).toBe(false);
    }
  });

  it("pg vérifie le certificat sans écrire d’avertissement, là où l’URL de Neon en écrivait un", () => {
    for (const url of [NEON, ENCODE]) {
      const { client, avertissements } = lireParPg(urlVerifiee(url));
      expect(avertissements, url).toEqual([]);
      /* Un réglage TLS vide : celui de node, qui vérifie le certificat et le nom d’hôte (jamais rejectUnauthorized: false) */
      expect(client.ssl, url).toEqual({});
    }
    /* La preuve que l’espion regarde au bon endroit : l’URL brute, elle, fait écrire l’avertissement (pg ne l’écrit qu’une fois par processus : en dernier) */
    const brute = lireParPg(NEON);
    expect(brute.avertissements.join("\n")).toContain("SECURITY WARNING");
    expect(brute.client.ssl).toEqual({});
  });
});
