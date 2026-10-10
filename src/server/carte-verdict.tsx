import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { ImageResponse } from "next/og";
import type { VerdictPartage } from "./partages";

/*
 * L’image d’un verdict partagé, dessinée côté serveur : la carte de l’aperçu du lien (WhatsApp, iMessage),
 * et la version story (1080 × 1920, pour Instagram). L’habit de la landing : le papier crème et sa lueur,
 * l’encre en Nunito 900, BLUSH qui parle dans des bulles roses, et la réponse de celui qui regarde, en bleu.
 * Rien d’autre que le verdict : ni prénom, ni message. Textes relus le 8 octobre (voix de BLUSH).
 */

export const TAILLES = { carte: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } } as const;
export type Format = keyof typeof TAILLES;

/* Des chemins écrits en entier : le build n’embarque que ces trois fichiers dans la fonction (pas tout le projet) */
export const ressources = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Nunito-Black.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Nunito-ExtraBold.ttf")),
  readFile(join(process.cwd(), "public/mail/bulle.png")),
]);

export const ENCRE = "#121214";
export const DOUX = "#4B4A47";
export const PAPIER =
  "radial-gradient(70% 55% at 50% 0%, #FFFFFF 0%, rgba(255,255,255,0) 70%), radial-gradient(45% 40% at 100% 100%, rgba(255,79,154,0.16), rgba(255,79,154,0) 70%), radial-gradient(45% 40% at 0% 100%, rgba(61,139,255,0.12), rgba(61,139,255,0) 70%), #F4F2ED";

/** Une bulle de conv : reçue (BLUSH, rose, la pointe à gauche) ou envoyée (toi, bleue, la pointe à droite). */
export function Bulle({ moi = false, taille, angle, children }: { moi?: boolean; taille: number; angle: number; children: ReactNode }) {
  const r = taille * 0.92;
  const style: CSSProperties = {
    display: "flex",
    padding: `${taille * 0.3}px ${taille * 0.66}px ${taille * 0.36}px`,
    borderRadius: moi ? `${r}px ${r}px ${taille * 0.24}px ${r}px` : `${r}px ${r}px ${r}px ${taille * 0.24}px`,
    background: moi ? "#1A66DB" : "linear-gradient(160deg, #FF9BCB, #E8358A)",
    boxShadow: moi ? "0 18px 32px -16px rgba(26,102,219,0.7)" : "0 18px 32px -16px rgba(232,53,138,0.75)",
    color: "#FFFFFF",
    fontSize: taille,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: "-0.01em",
    transform: `rotate(${angle}deg)`,
  };
  return <div style={style}>{children}</div>;
}

/** Le titre rapetisse quand il est long, pour tenir sans être coupé. */
const taille = (titre: string, grand: number) => Math.round(titre.length > 64 ? grand * 0.7 : titre.length > 40 ? grand * 0.84 : grand);

/**
 * `cache` : l’en-tête de cache de l’image. Par défaut une minute dans le navigateur, rien sur le CDN (l’aperçu d’un
 * lien doit repasser par le serveur, qui le compte).
 */
export async function carteVerdict(v: VerdictPartage, format: Format, cache = "public, max-age=60"): Promise<ImageResponse> {
  const [noir, extra, png] = await ressources;
  const bulle = `data:image/png;base64,${png.toString("base64")}`;
  const story = format === "story";

  /* La marque : la bulle en volume, en grand, et l’adresse du site (c’est elle qu’on retient) */
  const marque = (k: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14 * k }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- dessin de l’image, pas une page */}
      <img src={bulle} width={78 * k} height={78 * k} alt="" />
      <span style={{ fontSize: 44 * k, fontWeight: 900, color: ENCRE, letterSpacing: "-0.035em" }}>askblush.com</span>
    </div>
  );

  return new ImageResponse(
    story ? (
      /* Story : rien d’important dans les 250 px du haut et du bas, où Instagram pose ses boutons */
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: "100%", height: "100%", padding: "280px 80px 290px", background: PAPIER, fontFamily: "Nunito" }}>
        {marque(1.5)}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <Bulle taille={46} angle={-1.5}>
              j’ai lu toute leur conv 👀
            </Bulle>
            <Bulle taille={46} angle={1}>
              verdict :
            </Bulle>
          </div>
          <span style={{ fontSize: 220, lineHeight: 1, marginTop: 70 }}>{v.emoji}</span>
          <span style={{ fontSize: taille(v.title, 104), fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em", color: ENCRE, maxWidth: 920, marginTop: 44, textWrap: "balance" }}>{v.title}</span>
          {v.subtitle && <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.32, color: DOUX, maxWidth: 860, marginTop: 30, textWrap: "balance" }}>{v.subtitle}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <Bulle moi taille={46} angle={1.5}>
            et la mienne, elle dit quoi ?
          </Bulle>
          <span style={{ fontSize: 34, fontWeight: 800, color: "#6B6862" }}>Ta conv en dit plus que tu crois.</span>
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "46px 60px 44px", background: PAPIER, fontFamily: "Nunito" }}>
        {marque(0.92)}
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <Bulle taille={27} angle={-1}>
                j’ai lu toute leur conv 👀
              </Bulle>
              <Bulle taille={27} angle={1.2}>
                verdict :
              </Bulle>
            </div>
            <span style={{ fontSize: taille(v.title, 66), fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em", color: ENCRE, marginTop: 24, textWrap: "balance" }}>{v.title}</span>
            {v.subtitle && <span style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.32, color: DOUX, marginTop: 14, textWrap: "balance" }}>{v.subtitle}</span>}
          </div>
          <span style={{ fontSize: 190, lineHeight: 1, display: "flex" }}>{v.emoji}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Bulle moi taille={27} angle={1.5}>
            et la mienne, elle dit quoi ?
          </Bulle>
        </div>
      </div>
    ),
    {
      ...TAILLES[format],
      fonts: [
        { name: "Nunito", data: noir, weight: 900, style: "normal" },
        { name: "Nunito", data: extra, weight: 800, style: "normal" },
      ],
      /* Les emojis en volume (Fluent), plus proches de ceux de l’iPhone que les emojis plats */
      emoji: "fluent",
      headers: { "cache-control": cache },
    },
  );
}
