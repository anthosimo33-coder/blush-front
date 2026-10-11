import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { ErreurAjout } from "@/server/ajouts";
import { ErreurCaptures, LectureRefusee } from "@/server/captures";
import { ErreurPublique, ErreurTache } from "@/server/erreurs";
import { ErreurImport } from "@/server/import";
import { codeDErreur, memeOrigine, reponseAudio, reponseErreur } from "@/server/http";
import { groupeIp, ipDe } from "@/server/limites";
import { ErreurPartage } from "@/server/partages";

/*
 * Les briques pures des routes /api : l’origine d’une mutation (memeOrigine), l’audio par plages (reponseAudio, que
 * Safari demande en deux fois), l’adresse IP des limites (ipDe, une IPv6 par son /64), et la traduction des erreurs en
 * réponses (reponseErreur). Sans base, sans requête réelle.
 */

const requete = (entetes: Record<string, string>) => new Request("http://localhost/api/x", { method: "POST", headers: entetes });

describe("memeOrigine", () => {
  it.each<[string, Record<string, string>, boolean]>([
    ["l’appli elle-même", { origin: "http://localhost:3000", host: "localhost:3000" }, true],
    ["derrière le proxy de Vercel, son hôte transmis", { origin: "https://www.askblush.com", host: "interne.vercel", "x-forwarded-host": "www.askblush.com" }, true],
    ["un autre site", { origin: "https://site-pirate.test", host: "www.askblush.com" }, false],
    ["un autre port du même hôte", { origin: "http://localhost:3001", host: "localhost:3000" }, false],
    ["un sous-domaine", { origin: "https://pirate.askblush.com", host: "www.askblush.com" }, false],
    ["l’origine « null » (un iframe isolé, un fichier local)", { origin: "null", host: "www.askblush.com" }, false],
    ["sans origine", { host: "www.askblush.com" }, false],
    ["une origine qui n’est pas une adresse", { origin: "pas une adresse", host: "www.askblush.com" }, false],
  ])("%s", (_, entetes, attendu) => {
    expect(memeOrigine(requete(entetes))).toBe(attendu);
  });

  it("sans hôte, rien ne se compare : refusé", () => {
    /* Un Request de Node n’a pas d’en-tête host à lui : seul celui qu’on donne compte */
    expect(memeOrigine(requete({ origin: "http://localhost" }))).toBe(false);
  });
});

describe("reponseAudio", () => {
  const audio = Buffer.from(Array.from({ length: 1000 }, (_, k) => k % 256));
  const lire = (plage?: string) => reponseAudio(new Request("http://localhost/api/vocal/audio", { headers: plage ? { range: plage } : {} }), audio);
  const octets = async (r: Response) => Buffer.from(await r.arrayBuffer());

  it("sans plage : tout l’audio, en 200, que le navigateur ne garde pas", async () => {
    const r = lire();
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.headers)).toMatchObject({ "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, no-store", "content-length": "1000" });
    expect(await octets(r)).toEqual(audio);
  });

  it.each<[string, number, number]>([
    /* Safari demande d’abord deux octets, puis le reste */
    ["bytes=0-1", 0, 1],
    ["bytes=2-", 2, 999],
    ["bytes=100-199", 100, 199],
    /* Une fin au-delà de l’audio s’arrête à son dernier octet */
    ["bytes=900-5000", 900, 999],
    /* Les 300 derniers octets */
    ["bytes=-300", 700, 999],
    /* Plus que l’audio entier : tout */
    ["bytes=-5000", 0, 999],
  ])("la plage %s : 206, les octets %i à %i", async (plage, debut, fin) => {
    const r = lire(plage);
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes ${debut}-${fin}/1000`);
    expect(r.headers.get("content-length")).toBe(String(fin - debut + 1));
    expect(await octets(r)).toEqual(audio.subarray(debut, fin + 1));
  });

  it.each(["bytes=1000-", "bytes=5000-6000", "bytes=500-100"])("une plage hors de l’audio (%s) : 416, avec sa taille", (plage) => {
    const r = lire(plage);
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */1000");
  });

  it.each(["bytes=-", "octets=0-1", "bytes=0-1,5-9", "bytes=a-b"])("une plage illisible (%s) : tout l’audio, en 200", async (plage) => {
    const r = lire(plage);
    expect(r.status).toBe(200);
    expect((await octets(r)).length).toBe(1000);
  });
});

describe("ipDe", () => {
  const ip = (entetes: Record<string, string>) => ipDe(new Request("http://localhost/", { headers: entetes }));

  it("la première adresse de x-forwarded-for (celle que Vercel a vue), sinon x-real-ip, sinon « inconnue »", () => {
    expect(ip({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })).toBe("203.0.113.7");
    expect(ip({ "x-real-ip": "198.51.100.2" })).toBe("198.51.100.2");
    expect(ip({ "x-forwarded-for": "", "x-real-ip": " 198.51.100.2 " })).toBe("198.51.100.2");
    expect(ip({})).toBe("inconnue");
  });

  it("une IPv6 compte pour son /64 : toutes les adresses d’une même box n’en font qu’une", () => {
    const box = ["2001:db8:1:2::1", "2001:0db8:0001:0002:ffff:eeee:dddd:cccc", "2001:DB8:1:2:a:b:c:d", "[2001:db8:1:2::9]", "2001:db8:1:2::9%eth0"];
    for (const a of box) expect(ip({ "x-forwarded-for": a }), a).toBe("2001:db8:1:2::/64");
    expect(ip({ "x-forwarded-for": "2001:db8:1:3::1" })).toBe("2001:db8:1:3::/64");
  });

  it.each<[string, string]>([
    ["::1", "0:0:0:0::/64"],
    ["fe80::", "fe80:0:0:0::/64"],
    ["2001:db8::", "2001:db8:0:0::/64"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["0:0:0:0:0:ffff:203.0.113.7", "203.0.113.7"],
    ["64:ff9b::203.0.113.7", "64:ff9b:0:0::/64"],
    /* Pas une adresse lisible : telle quelle, comptée à part */
    ["2001:db8::1::2", "2001:db8::1::2"],
    ["2001:db8:1:2:3:4:5", "2001:db8:1:2:3:4:5"],
    ["2001:db8:1:2:3:4:5:6:7", "2001:db8:1:2:3:4:5:6:7"],
    ["2001:xyz::1", "2001:xyz::1"],
    ["Pas-Une-IP", "pas-une-ip"],
  ])("groupeIp(%s) : %s", (brute, attendu) => {
    expect(groupeIp(brute)).toBe(attendu);
  });
});

describe("reponseErreur", () => {
  const reponse = async (e: unknown) => {
    const r = reponseErreur(e);
    return [r.status, await r.json()];
  };

  it("une erreur publique répond son code, avec son statut", async () => {
    expect(await reponse(new ErreurImport("groupe"))).toEqual([422, { erreur: "groupe" }]);
    expect(await reponse(new ErreurAjout("rien_de_neuf"))).toEqual([422, { erreur: "rien_de_neuf" }]);
    expect(await reponse(new ErreurCaptures())).toEqual([422, { erreur: "capture" }]);
    expect(await reponse(new LectureRefusee("connexion"))).toEqual([401, { erreur: "connexion" }]);
    expect(await reponse(new ErreurPartage("sobre"))).toEqual([409, { erreur: "sobre" }]);
    for (const e of [new ErreurImport("fichier"), new ErreurCaptures(), new LectureRefusee("trop"), new ErreurAjout("autre_conv"), new ErreurPartage("pas_pret")]) expect(e).toBeInstanceOf(ErreurPublique);
  });

  it("une erreur d’étape ne dit que son code public : le refus, le vocal, ou la panne", async () => {
    expect(await reponse(new ErreurTache("refus:cyber"))).toEqual([502, { erreur: "refus" }]);
    expect(await reponse(new ErreurTache("transcription"))).toEqual([502, { erreur: "transcription" }]);
    expect(await reponse(new ErreurTache("sortie_illisible"))).toEqual([502, { erreur: "panne" }]);
  });

  it("le reste (un bug, la base) : « panne », sans rien en dire au navigateur ; seul son nom va aux logs, jamais son message", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    /* Une erreur SQL cite ses paramètres (un email), un JSON illisible un morceau du contenu */
    const bug = Object.assign(new Error("insert into users values ($1) : noe@exemple.fr"), { name: "DrizzleQueryError", params: ["noe@exemple.fr"] });
    try {
      const [statut, corps] = await reponse(bug);
      expect([statut, corps]).toEqual([502, { erreur: "panne" }]);
      expect(JSON.stringify(corps)).not.toContain("exemple");
      expect(logs).toHaveBeenCalledTimes(1);
      /* Ni l’erreur elle-même (la console l’écrirait en entier, ses paramètres compris), ni son message */
      expect(logs.mock.calls.flat().some((a) => a instanceof Error)).toBe(false);
      const journal = logs.mock.calls.flat().join(" ");
      expect(journal).toContain("DrizzleQueryError");
      expect(journal).not.toContain("exemple");
    } finally {
      logs.mockRestore();
    }
  });

  it("une erreur d’étape va aux logs par son code interne (un délai n’est pas une panne muette) ; une erreur publique, attendue, n’y va pas", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await reponse(new ErreurTache("delai"))).toEqual([502, { erreur: "panne" }]);
      expect(logs.mock.calls.flat().join(" ")).toContain("delai");
      logs.mockClear();
      await reponse(new ErreurImport("groupe"));
      expect(logs).not.toHaveBeenCalled();
    } finally {
      logs.mockRestore();
    }
  });

  it("codeDErreur : le même code pour la réponse d’un bloc et le dernier événement d’un flux", () => {
    expect(codeDErreur(new ErreurImport("groupe"))).toBe("groupe");
    expect(codeDErreur(new ErreurTache("refus:cyber"))).toBe("refus");
    expect(codeDErreur(new Error("x"))).toBe("panne");
    expect(codeDErreur("pas une erreur")).toBe("panne");
  });

  it("une erreur publique porte le nom de sa classe (les logs ne gardent que lui)", () => {
    expect([new ErreurImport("groupe").name, new ErreurPartage("sobre").name, new ErreurCaptures().name]).toEqual(["ErreurImport", "ErreurPartage", "ErreurCaptures"]);
  });

  it("une erreur de Next lui-même (redirect) repart telle quelle", () => {
    let interne: unknown;
    try {
      redirect("/connexion");
    } catch (e) {
      interne = e;
    }
    expect(() => reponseErreur(interne)).toThrow(interne as Error);
  });
});
