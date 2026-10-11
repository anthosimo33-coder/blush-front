import { afterEach, describe, expect, it, vi } from "vitest";
import { champsDErreur, ligneDuJournal, tracer } from "@/lib/tracer";
import { ErreurTache } from "@/server/erreurs";
import { auMieux, journal, journalErreur } from "@/server/journal";

/* Le journal du serveur (src/server/journal.ts) et la trace du navigateur (src/lib/tracer.ts) : des lignes JSON, jamais de contenu */

afterEach(() => vi.restoreAllMocks());

/** Une erreur comme celles de Drizzle : son message cite la requête et ses paramètres (un email), sa cause est celle de Postgres. */
function erreurSql(): Error {
  const pg = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), { name: "DatabaseError", code: "23505" });
  const e = new Error("Failed query: insert into users (email) values ($1)\nparams: ines@exemple.test", { cause: pg });
  e.name = "DrizzleQueryError";
  return e;
}

describe("ce qu’on garde d’une erreur", () => {
  it("son nom, son code et sa cause : jamais son message", () => {
    const champs = champsDErreur(erreurSql());
    expect(champs).toEqual({ erreur: "DrizzleQueryError", code: undefined, digest: undefined, cause: "DatabaseError", codeCause: "23505" });
    expect(JSON.stringify(champs)).not.toContain("exemple.test");
  });

  it("le code d’une erreur d’étape, l’empreinte d’une erreur de Next ; un code qui n’en a pas la forme est tu", () => {
    expect(champsDErreur(new ErreurTache("refus:cyber"))).toMatchObject({ erreur: "Error", code: "refus:cyber" });
    expect(champsDErreur(Object.assign(new Error("Ines a écrit…"), { digest: "2401781541" }))).toMatchObject({ digest: "2401781541" });
    /* Une erreur de Next qui a son code (__NEXT_ERROR_CODE) : son empreinte le porte après un « @ » */
    expect(champsDErreur(Object.assign(new Error("x"), { digest: "123@E394" })).digest).toBe("123@E394");
    expect(champsDErreur(Object.assign(new Error("x"), { code: "ines@exemple.test" })).code).toBeUndefined();
    expect(champsDErreur(Object.assign(new Error("x"), { code: "un texte avec des espaces" })).code).toBeUndefined();
    expect(champsDErreur("une chaîne")).toEqual({ erreur: "string", code: undefined, digest: undefined });
    expect(champsDErreur(null).erreur).toBe("null");
  });

  it("une ligne JSON : l’événement, puis des champs bornés, sans les vides", () => {
    const ligne = JSON.parse(ligneDuJournal("tâche en échec", { genre: "verdict", essais: 2, rien: undefined, long: "x".repeat(500) })) as Record<string, unknown>;
    expect(ligne).toEqual({ evenement: "tâche en échec", genre: "verdict", essais: 2, long: "x".repeat(120) });
  });
});

describe("le journal du serveur", () => {
  it("écrit une ligne par événement, à son niveau", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    journal("lecture lancée", { tache: "t1" });
    journalErreur("route /api en panne", erreurSql(), { route: "/api/fiche" });
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({ evenement: "lecture lancée", niveau: "info", tache: "t1" });
    const ligne = erreur.mock.calls[0][0] as string;
    expect(JSON.parse(ligne)).toMatchObject({ evenement: "route /api en panne", niveau: "erreur", route: "/api/fiche", erreur: "DrizzleQueryError", codeCause: "23505" });
    expect(ligne).not.toContain("exemple.test");
  });

  it("auMieux : un travail qui échoue laisse une ligne, et ne fait jamais échouer qui l’appelle", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(auMieux(Promise.reject(erreurSql()), "battement de cœur perdu", { tache: "t1" })).resolves.toBeUndefined();
    await expect(
      auMieux(() => {
        throw new TypeError("au démarrage");
      }, "alerte non envoyée"),
    ).resolves.toBeUndefined();
    await expect(auMieux(async () => "fait", "rien à dire")).resolves.toBeUndefined();
    expect(erreur.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)).toEqual([
      expect.objectContaining({ evenement: "battement de cœur perdu", tache: "t1", erreur: "DrizzleQueryError" }),
      expect.objectContaining({ evenement: "alerte non envoyée", erreur: "TypeError" }),
    ]);
  });
});

describe("la trace du navigateur", () => {
  it("écrit dans la console seulement : le nom de l’erreur, jamais son message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const envoi = vi.spyOn(globalThis, "fetch");
    tracer("son non joué", Object.assign(new Error("play() refusé pour ines@exemple.test"), { name: "NotAllowedError" }), { son: "envoi" });
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({ evenement: "son non joué", son: "envoi", erreur: "NotAllowedError" });
    expect(warn.mock.calls[0][0]).not.toContain("exemple.test");
    expect(envoi).not.toHaveBeenCalled();
  });
});
