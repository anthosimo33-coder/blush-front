import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les gardes des pages qui ont un écran de chargement (loading.tsx) sont dans leur layout : une page sous un squelette
 * part en flux, et sa redirection n’est plus une 307. On vérifie que chaque layout redirige là où la page redirigeait,
 * et que les gardes légères (verdictEcrit, nombreDeConvs) disent la même chose que getReport et getConvs.
 * Les cookies sont simulés ; redirect lève l’adresse visée.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string) => etat.cookies.delete(n),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw { redirection: url };
  },
}));

import { executerChaine } from "@/server/pipeline";
import type { Utilisateur } from "@/server/auth";
import { ouvrirSession } from "@/server/auth";
import { definirQui } from "@/server/histoires";
import { planifier } from "@/server/taches";
import { getConvs, getReport, nombreDeConvs, verdictEcrit } from "@/services/serveur";
import Compte from "@/app/compte/layout";
import Lecture from "@/app/lecture/layout";
import Qui from "@/app/qui/layout";
import Rapport from "@/app/rapport/(rapport)/layout";
import Question from "@/app/rapport/question/layout";
import Ok from "@/app/importer/ok/layout";
import Histoire from "@/app/importer/histoire/layout";
import Convs from "@/app/app/convs/layout";
import { compteDeTest, convRattachee, histoireLue } from "./aide/fixtures";

type Layout = (props: { children: ReactNode; params: Promise<object> }) => Promise<ReactNode>;

/** Où le layout renvoie, ou null s’il laisse passer la page. */
async function garde(layout: unknown): Promise<string | null> {
  try {
    expect(await (layout as Layout)({ children: "la page", params: Promise.resolve({}) })).toBe("la page");
    return null;
  } catch (e) {
    if (e && typeof e === "object" && "redirection" in e) return (e as { redirection: string }).redirection;
    throw e;
  }
}

const toutes = async () => ({
  compte: await garde(Compte),
  lecture: await garde(Lecture),
  qui: await garde(Qui),
  rapport: await garde(Rapport),
  question: await garde(Question),
  ok: await garde(Ok),
  histoire: await garde(Histoire),
  convs: await garde(Convs),
});

/* Chaque test part d’un navigateur sans cookie, et ouvre la session du compte qu’il crée : aucun ne compte sur un autre */
beforeEach(() => etat.cookies.clear());
/** Un compte neuf, connecté dans le navigateur du test. */
async function connecte(): Promise<Utilisateur> {
  const u = await compteDeTest("gardes");
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  return u;
}

/** Les gardes légères des layouts disent la même chose que les lectures complètes des pages. */
async function memesReponses() {
  expect(await verdictEcrit()).toBe(!!(await getReport()));
  expect(await nombreDeConvs()).toBe((await getConvs()).length);
}

describe("les gardes des pages à squelette, dans leur layout", () => {
  it("sans session ni brouillon : la connexion (qui ramène à la page), ou le début du parcours", async () => {
    expect(await toutes()).toEqual({
      compte: "/connexion?suite=%2Fcompte",
      lecture: "/connexion?suite=%2Flecture",
      qui: "/commencer",
      rapport: "/connexion?suite=%2Frapport",
      question: "/connexion?suite=%2Frapport%2Fquestion",
      ok: "/commencer",
      histoire: "/commencer",
      convs: "/app",
    });
    await memesReponses();
  });

  it("suit la conv : « Qui es-tu ? » d’abord, puis la lecture, puis le rapport", async () => {
    const histoire = (await convRattachee(await connecte(), "01-a-deux-doigts.txt")).id;

    /* Importée, « Qui es-tu ? » pas rempli : pas de lecture sans */
    const avantQui = await toutes();
    expect(avantQui).toMatchObject({ compte: null, lecture: "/qui", qui: null, ok: null, histoire: null, rapport: "/lecture", convs: "/app" });
    await memesReponses();

    /* Rempli, lecture pas finie : le rapport renvoie encore à la lecture */
    await definirQui(histoire, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
    expect(await toutes()).toMatchObject({ lecture: null, rapport: "/lecture", question: null });
    expect(await verdictEcrit()).toBe(false);
    await memesReponses();

    /* Lue : le rapport s’ouvre ; une seule conv, pas de liste */
    await planifier(histoire, "verdict");
    await executerChaine(histoire);
    expect(await toutes()).toMatchObject({ compte: null, lecture: null, rapport: null, question: null, convs: "/app" });
    expect(await verdictEcrit()).toBe(true);
    await memesReponses();
  });

  it("deux convs lues : la liste s’ouvre", async () => {
    const u = await connecte();
    await histoireLue(u, "01-a-deux-doigts.txt");
    expect(await nombreDeConvs()).toBe(1);
    expect(await garde(Convs)).toBe("/app");
    await histoireLue(u, "02-reciproque.txt");
    expect(await nombreDeConvs()).toBe(2);
    expect(await garde(Convs)).toBeNull();
    await memesReponses();
  });
});
