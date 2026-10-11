import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { BLEU, DOUX, ENCRE, GRIS, PAPIER, ROSE_CLAIR, ROSE_FONCE, SITE_AFFICHE } from "./marque";
import type { VerdictPartage } from "./partages";

/*
 * L’image d’un verdict partagé, dessinée côté serveur : la carte de l’aperçu du lien (WhatsApp, iMessage),
 * et la version story (1080 × 1920, pour Instagram). L’habit de la landing : le papier crème et sa lueur,
 * l’encre en Nunito 900, BLUSH qui parle dans des bulles roses, et la réponse de celui qui regarde, en bleu.
 * Rien d’autre que le verdict : ni prénom, ni message. Textes relus le 8 octobre (voix de BLUSH).
 * Le cadre des stories (cadreStory), la marque et le dessin (dessiner) servent aussi à « Partager en image »
 * (src/server/carte-partage.tsx) ; les couleurs sont celles de la marque (src/server/marque.ts).
 */

const TAILLES = { carte: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } } as const;
export type Format = keyof typeof TAILLES;

/*
 * Des chemins écrits en entier : le build n’embarque que ces trois fichiers dans la fonction (pas tout le projet).
 * La bulle de la marque, en data-URL, faite une fois par instance (les cartes la dessinent toutes).
 */
const ressources = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Nunito-Black.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Nunito-ExtraBold.ttf")),
  readFile(join(process.cwd(), "public/mail/bulle.png")),
]).then(([noir, extra, png]) => ({ noir, extra, bulle: `data:image/png;base64,${png.toString("base64")}` }));

/** La bulle de la marque, en data-URL : une image la dessine où elle veut (à côté d’une réponse du chat, par exemple). */
export const imageBulle = async () => (await ressources).bulle;

/** Le fond des images : le papier crème, sa lueur blanche en haut, rose et bleue dans les coins du bas. */
const FOND = `radial-gradient(70% 55% at 50% 0%, #FFFFFF 0%, rgba(255,255,255,0) 70%), radial-gradient(45% 40% at 100% 100%, rgba(255,79,154,0.16), rgba(255,79,154,0) 70%), radial-gradient(45% 40% at 0% 100%, rgba(61,139,255,0.12), rgba(61,139,255,0) 70%), ${PAPIER}`;

/**
 * Dessine une image BLUSH : la taille de son format, Nunito 900 et 800, les emojis en volume (Fluent, plus proches de
 * ceux de l’iPhone que les emojis plats), et l’en-tête de cache donné.
 */
export async function dessiner(contenu: ReactElement, format: Format, cache: string): Promise<ImageResponse> {
  const { noir, extra } = await ressources;
  return new ImageResponse(contenu, {
    ...TAILLES[format],
    fonts: [
      { name: "Nunito", data: noir, weight: 900, style: "normal" },
      { name: "Nunito", data: extra, weight: 800, style: "normal" },
    ],
    emoji: "fluent",
    headers: { "cache-control": cache },
  });
}

/** La marque : la bulle en volume et l’adresse du site (c’est elle qu’on retient), à la taille donnée. */
function Marque({ bulle, taille, police, ecart }: { bulle: string; taille: number; police: number; ecart: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ecart }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- dessin de l’image, pas une page */}
      <img src={bulle} width={taille} height={taille} alt="" />
      <span style={{ fontSize: police, fontWeight: 900, color: ENCRE, letterSpacing: "-0.035em" }}>{SITE_AFFICHE}</span>
    </div>
  );
}

/*
 * Les cotes des deux cadres de story. Celui du verdict a sa marque en grand (une fois et demie celle de la carte) ; celui
 * d’un texte (une réponse du chat, un moment du rapport) la garde plus petite, et ses marges plus courtes : la place va
 * aux mots. Rien d’important dans les 250 px du haut et du bas, où Instagram pose ses boutons.
 */
const CADRES = {
  verdict: { marges: "280px 80px 290px", marque: { taille: 117, police: 66, ecart: 21 }, pied: { bulle: 46, police: 34, ecart: 34 } },
  texte: { marges: "270px 72px 280px", marque: { taille: 100, police: 60, ecart: 18 }, pied: { bulle: 42, police: 32, ecart: 30 } },
} as const;

/**
 * Le cadre d’une story BLUSH (1080 × 1920) : la marque en haut, `contenu` au milieu, et en bas la réponse de celui qui
 * regarde (« et la mienne, elle dit quoi ? ») sur la phrase de la landing.
 */
export async function cadreStory(cadre: keyof typeof CADRES, contenu: ReactNode): Promise<ReactElement> {
  const { marges, marque, pied } = CADRES[cadre];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: "100%", height: "100%", padding: marges, background: FOND, fontFamily: "Nunito" }}>
      <Marque bulle={await imageBulle()} {...marque} />
      {contenu}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: pied.ecart }}>
        <Bulle moi taille={pied.bulle} angle={1.5}>
          {"et la mienne, elle dit quoi\u00a0?"}
        </Bulle>
        <span style={{ fontSize: pied.police, fontWeight: 800, color: GRIS }}>Ta conv en dit plus que tu crois.</span>
      </div>
    </div>
  );
}

/** Une bulle de conv : reçue (BLUSH, rose, la pointe à gauche) ou envoyée (toi, bleue, la pointe à droite). */
export function Bulle({ moi = false, taille, angle, children }: { moi?: boolean; taille: number; angle: number; children: ReactNode }) {
  const r = taille * 0.92;
  const style: CSSProperties = {
    display: "flex",
    padding: `${taille * 0.3}px ${taille * 0.66}px ${taille * 0.36}px`,
    borderRadius: moi ? `${r}px ${r}px ${taille * 0.24}px ${r}px` : `${r}px ${r}px ${r}px ${taille * 0.24}px`,
    background: moi ? BLEU : `linear-gradient(160deg, ${ROSE_CLAIR}, ${ROSE_FONCE})`,
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
  if (format === "story")
    return dessiner(
      await cadreStory(
        "verdict",
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <Bulle taille={46} angle={-1.5}>
              j’ai lu toute leur conv 👀
            </Bulle>
            <Bulle taille={46} angle={1}>
              {"verdict\u00a0:"}
            </Bulle>
          </div>
          <span style={{ fontSize: 220, lineHeight: 1, marginTop: 70 }}>{v.emoji}</span>
          <span style={{ fontSize: taille(v.title, 104), fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em", color: ENCRE, maxWidth: 920, marginTop: 44, textWrap: "balance" }}>{v.title}</span>
          {v.subtitle && <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.32, color: DOUX, maxWidth: 860, marginTop: 30, textWrap: "balance" }}>{v.subtitle}</span>}
        </div>,
      ),
      format,
      cache,
    );
  /* La carte de l’aperçu du lien : la marque un peu plus petite qu’à l’échelle de la story (0,92 contre 1,5) */
  const k = 0.92;
  return dessiner(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "46px 60px 44px", background: FOND, fontFamily: "Nunito" }}>
      <Marque bulle={await imageBulle()} taille={78 * k} police={44 * k} ecart={14 * k} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <Bulle taille={27} angle={-1}>
              j’ai lu toute leur conv 👀
            </Bulle>
            <Bulle taille={27} angle={1.2}>
              {"verdict\u00a0:"}
            </Bulle>
          </div>
          <span style={{ fontSize: taille(v.title, 66), fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em", color: ENCRE, marginTop: 24, textWrap: "balance" }}>{v.title}</span>
          {v.subtitle && <span style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.32, color: DOUX, marginTop: 14, textWrap: "balance" }}>{v.subtitle}</span>}
        </div>
        <span style={{ fontSize: 190, lineHeight: 1, display: "flex" }}>{v.emoji}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Bulle moi taille={27} angle={1.5}>
          {"et la mienne, elle dit quoi\u00a0?"}
        </Bulle>
      </div>
    </div>,
    format,
    cache,
  );
}
