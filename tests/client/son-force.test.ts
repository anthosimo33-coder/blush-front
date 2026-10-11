import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prendreSonForce, setRecording } from "@/lib/audio";

/*
 * Le son forcé (src/lib/audio.ts) : la session audio de Safari passe en « playback » (le son s’entend même en
 * silencieux) tant que quelqu’un le tient, « auto » pendant un vocal, « ambient » sinon. Un compteur : le vocal qui
 * s’arrête ne coupe ni celui qui le remplace, ni le bouton son du verdict. La session de Safari est simulée.
 */

let session: { type: string };

beforeEach(() => {
  session = { type: "ambient" };
  Object.defineProperty(navigator, "audioSession", { value: session, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, "audioSession");
});

describe("prendreSonForce", () => {
  it("tenu par deux, il le reste jusqu’à ce que le dernier le lâche", () => {
    const verdict = prendreSonForce();
    expect(session.type).toBe("playback");
    const vocal = prendreSonForce();
    verdict();
    expect(session.type).toBe("playback");
    vocal();
    expect(session.type).toBe("ambient");
  });

  it("lâcher deux fois ne compte qu’une : l’autre le tient toujours", () => {
    const a = prendreSonForce();
    const b = prendreSonForce();
    a();
    a();
    expect(session.type).toBe("playback");
    b();
    expect(session.type).toBe("ambient");
  });

  it("pendant un vocal, Safari a la main (« auto ») ; après, le son forcé reprend", () => {
    const lacher = prendreSonForce();
    setRecording(true);
    expect(session.type).toBe("auto");
    setRecording(false);
    expect(session.type).toBe("playback");
    lacher();
    expect(session.type).toBe("ambient");
  });

  it("un ancien Safari qui refuse de changer de session ne lève pas", () => {
    Object.defineProperty(navigator, "audioSession", {
      value: {
        get type() {
          return "ambient";
        },
        set type(_: string) {
          throw new TypeError("refusé");
        },
      },
      configurable: true,
    });
    const lacher = prendreSonForce();
    expect(() => lacher()).not.toThrow();
  });
});
