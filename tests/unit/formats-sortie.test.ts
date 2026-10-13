import { createHash } from "node:crypto";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Etape05, Maj07, Plan05, Sortie01, Sortie04, Sortie05, Sortie06, Sortie07, Sortie10 } from "@prompts/lib/schemas";

/*
 * Les formats de sortie envoyés au modèle (prompts/lib/schemas.ts) : leur schéma JSON, et le format que le SDK en tire
 * (src/server/ia/claude.ts). Ils font partie de ce que le modèle reçoit à chaque appel, avant la partie mise en cache :
 * un format qui bouge sans qu’on le veuille change ce qu’il écrit, et refait le cache. Les empreintes ont été prises
 * avant que Maj07 ne soit tiré de Sortie07 (prompts b4e222c), et n’ont pas changé ; celle de Sortie04, le 13 octobre, avec les
 * titres des chapitres fermés (`titres`). Jamais le texte du schéma : le dépôt
 * est public. Un format changé exprès (un prompt qui change) : on met son empreinte à jour, dans le même commit.
 */
const empreinte = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

const FORMATS = { Sortie01, Sortie04, Plan05, Etape05, Sortie05, Sortie06, Sortie07, Maj07, Sortie10 };

describe("les formats de sortie du modèle", () => {
  it("ne bougent pas : schéma JSON et format du SDK, chacun à son empreinte", () => {
    const empreintes = Object.fromEntries(Object.entries(FORMATS).map(([nom, s]) => [nom, `${empreinte(z.toJSONSchema(s))} ${empreinte(betaZodOutputFormat(s))}`]));
    expect(empreintes).toEqual({
      Sortie01: "263872d42ebba363 59c02f240690b9af",
      Sortie04: "6ba8a4a06d6bfdf7 f64af5f946671ac5",
      Plan05: "81fd3bfb3c99262b 9c94473613a08dc8",
      Etape05: "1dc325882bab8511 4975ee7059b925ac",
      Sortie05: "8326ad353f380708 8029cb7516323c09",
      Sortie06: "43e1e4810a387ca3 8e5ccdecad19d7b2",
      Sortie07: "baa87f7849f5699d db6539af1af82272",
      Maj07: "7c8474e94c2e59cc 0f3034d663ff7079",
      Sortie10: "ba887395f9c7a21b f3e27c85fd681ed7",
    });
  });
});
