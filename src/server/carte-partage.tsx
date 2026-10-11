import "server-only";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { Bulle, cadreStory, dessiner, imageBulle } from "./carte-verdict";
import { BLEU, DOUX, ENCRE } from "./marque";

/*
 * « Partager en image » : un moment de BLUSH en story (1080 × 1920), dans l’habit de la carte du verdict.
 * - une réponse de BLUSH dans le chat : ta question en bleu, ses bulles en blanc ;
 * - un moment du rapport (la chute d’un chapitre) : la phrase en grand, et d’où elle vient.
 * Le prénom de l’autre est masqué avant d’arriver ici (le tien reste). Textes relus le 8 octobre (voix de BLUSH).
 */

/** Un texte trop long, coupé proprement (au mot), pour tenir dans la story. */
const couper = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, "")}…`);

/* Une story dans le cadre d’un texte (src/server/carte-verdict.tsx, cadreStory) : jamais en cache, c’est un moment à soi */
const story = async (contenu: ReactNode): Promise<ImageResponse> => dessiner(await cadreStory("texte", contenu), "story", "private, no-store");

/** Une réponse de BLUSH dans le chat : ta question (bulle bleue, à droite), puis ses bulles (blanches, à gauche). */
export async function carteReponse({ question, bulles }: { question: string | null; bulles: string[] }): Promise<ImageResponse> {
  const bulle = await imageBulle();
  /* Les premières bulles, tant qu’elles tiennent (environ 420 caractères) */
  const gardees: string[] = [];
  let place = 420;
  for (const b of bulles) {
    if (place <= 40) break;
    gardees.push(couper(b, place));
    place -= b.length;
  }
  return story(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 34 }}>
      {question && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", maxWidth: 760, padding: "22px 32px 26px", borderRadius: "44px 44px 12px 44px", background: BLEU, color: "#FFFFFF", fontSize: 40, fontWeight: 800, lineHeight: 1.3 }}>
            {couper(question, 140)}
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- dessin de l’image, pas une page */}
        <img src={bulle} width={78} height={78} alt="" style={{ marginBottom: 6 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
          {gardees.map((b, k) => (
            <div
              key={k}
              style={{
                display: "flex",
                padding: "24px 32px 28px",
                borderRadius: k === gardees.length - 1 ? "44px 44px 44px 12px" : "44px",
                background: "#FFFFFF",
                boxShadow: "0 0 0 2px rgba(17,17,20,0.06), 0 22px 40px -26px rgba(17,17,20,0.4)",
                color: ENCRE,
                fontSize: 42,
                fontWeight: 800,
                lineHeight: 1.32,
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    </div>,
  );
}

/** Un moment du rapport (la chute d’un chapitre) : d’où il vient, puis la phrase en grand. */
export async function carteMoment({ surtitre, texte }: { surtitre: string; texte: string }): Promise<ImageResponse> {
  const t = couper(texte, 220);
  return story(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 52 }}>
      <Bulle taille={44} angle={-1.5}>
        extrait de mon rapport 👀
      </Bulle>
      <span style={{ fontSize: t.length > 140 ? 64 : t.length > 80 ? 76 : 92, fontWeight: 900, lineHeight: 1.12, letterSpacing: "-0.03em", color: ENCRE, maxWidth: 920, textWrap: "balance" }}>
        {`«\u00a0${t}\u00a0»`}
      </span>
      <span style={{ fontSize: 38, fontWeight: 800, color: DOUX }}>{surtitre}</span>
    </div>,
  );
}
