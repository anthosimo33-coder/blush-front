import "server-only";
import { Defs, Document, Font, Image, Link, Page, Path, RadialGradient, Rect, renderToBuffer, Stop, Svg, Text, View } from "@react-pdf/renderer";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { LIGNES_D_ECOUTE } from "@/contenu/aide";
import { formatCount, NBSP } from "@/lib/format";
import { nombreDApplis } from "@/lib/morceaux";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { IlOuElle } from "@/lib/pronom";
import type { ReportPayload } from "@/types/api";
import type { Chapter, ChapterBlock, Message, Pronom, ScoreRow, SoberReport, Story } from "@/types";
import { fichiersDeLaMarque } from "./carte-verdict";
import { BLEU, DOUX, ENCRE, GRIS, LUEURS, PAPIER, SITE_AFFICHE, TEINTES } from "./marque";

/*
 * Le rapport en PDF, pour son propriétaire : ce qu’il lit dans l’appli au moment où il le demande, dans l’ordre de
 * l’écran (ReportScreen) — la page de garde (l’en-tête du rapport et le verdict), chaque chapitre ouvert avec tous ses
 * blocs comme à l’écran (src/components/ui/report.tsx), puis la suite fermée (ses titres) ; ou le rapport doux du mode
 * sobre, tel quel. Le vocal ne s’imprime pas : une ligne dit qu’il attend dans l’appli.
 * Dessiné par @react-pdf/renderer : du texte vectoriel en Nunito 800 et 900 embarquée (le sous-ensemble de ses lettres),
 * qui s’enchaîne sur des pages A4 et se coupe proprement (une bulle, une carte courte ou un titre ne restent jamais à
 * cheval sur deux pages, ni un titre seul en bas d’une page), le numéro de chaque page et son pied. Les emojis sont ceux
 * des images de partage (Fluent, dessinés par next/og), en images nettes. Chaque page est blanche, le papier crème posé
 * dessus avec une marge : rien n’est coupé par une imprimante.
 * Rien n’est gardé ni journalisé de ce qu’il contient : le PDF est fait à la demande, et repart tel quel.
 */

/* ———— Les mesures ———— */

/** Les tailles de l’appli (en px) aux trois quarts, en points : la colonne du rapport (720 px) tient sur une page A4. */
const T = { micro: 9, legende: 9.75, note: 10.5, detail: 11.25, corps: 12, accent: 12.75, carte: 13.5, essentiel: 15.75, titre3: 18, titre2: 22.5 };
/** Le papier posé sur la page blanche : sa marge (celle du bas garde la place du pied) et son arrondi. */
const FEUILLE = { marge: 18, bas: 44, arrondi: 22 };
/** Ce qui reste libre sous un titre de chapitre (en points) : moins, il passe à la page suivante avec ce qui le suit. */
const PLACE_SOUS_UN_TITRE = 150;

/* ———— Les emojis ———— */

const GRAPHEMES = new Intl.Segmenter("fr", { granularity: "grapheme" });
/** Un emoji (un pictogramme, un drapeau, une touche) : Nunito n’en a pas, il se dessine en image. */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;
/** Ses points de code en hexadécimal, joints par « - », sans FE0F (comme react-pdf, getCodePoints de @react-pdf/layout). */
const pointsDeCode = (emoji: string) =>
  [...emoji]
    .filter((c) => c !== "\ufe0f")
    .map((c) => c.codePointAt(0)!.toString(16))
    .join("-");
/** Son nom chez Fluent, comme next/og le cherche : sans FE0F, sauf dans une suite liée par ZWJ. */
const nomFluent = (emoji: string) =>
  [...emoji]
    .filter((c) => emoji.includes("\u200d") || c !== "\ufe0f")
    .map((c) => c.codePointAt(0)!.toString(16))
    .join("-");
/*
 * Les emojis Fluent en volume (ceux des images de partage) : le CDN que next/og interroge, puis le dépôt lui-même quand
 * le CDN refuse un fichier qu’il n’a pas encore en cache (il répond 403).
 */
const SOURCES_FLUENT = ["https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/", "https://raw.githubusercontent.com/shuding/fluentui-emoji-unicode/main/assets/"];
/** Les emojis du texte déjà dessinés (72 px, plus de 400 dpi à la taille du texte), par points de code, en data-URL : gardés par l’instance. */
const emojisDuTexte = new Map<string, string>();

/** Le dessin vectoriel d’un emoji (SVG), d’une source à l’autre ; null si aucune ne l’a. */
async function svgFluent(emoji: string): Promise<string | null> {
  for (const source of SOURCES_FLUENT) {
    const r = await fetch(`${source}${nomFluent(emoji)}_color.svg`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
    if (r?.ok) return r.text();
  }
  return null;
}

/** Un PNG carré de `px` pixels : le SVG donné, ou rien (transparent). */
async function enPng(px: number, svg: string | null): Promise<Buffer> {
  const image = new ImageResponse(
    svg ? (
      // eslint-disable-next-line @next/next/no-img-element -- dessin de l’image, pas une page
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={px} height={px} alt="" />
    ) : (
      <div style={{ display: "flex" }} />
    ),
    { width: px, height: px },
  );
  return Buffer.from(await image.arrayBuffer());
}

/** Un emoji en volume (Fluent, comme les images de partage), en PNG carré de `px` pixels sur fond transparent ; null si aucune source ne l’a. */
async function emojiEnImage(emoji: string, px: number): Promise<Buffer | null> {
  const svg = await svgFluent(emoji);
  return svg ? enPng(px, svg) : null;
}

/** Une image transparente : un emoji introuvable laisse sa place vide, plutôt qu’un glyphe cassé. Faite une fois. */
const vide = enPng(4, null).then((png) => `data:image/png;base64,${png.toString("base64")}`);

/** Dessine les emojis que `texte` contient et qui ne le sont pas encore, pour que react-pdf les trouve (registerEmojiSource). */
async function preparerEmojis(texte: string): Promise<void> {
  const nouveaux = new Set<string>();
  for (const { segment } of GRAPHEMES.segment(texte)) if (EMOJI.test(segment) && !emojisDuTexte.has(pointsDeCode(segment))) nouveaux.add(segment);
  const transparent = await vide;
  await Promise.all(
    [...nouveaux].map(async (e) => {
      const png = await emojiEnImage(e, 72).catch(() => null);
      emojisDuTexte.set(pointsDeCode(e), png ? `data:image/png;base64,${png.toString("base64")}` : transparent);
    }),
  );
}

/* ———— Les polices ———— */

/*
 * Nunito 800 et 900 ; pour un signe qu’elle n’a pas (une flèche, une étoile), la police de next/og (Geist), en repli.
 * L’emoji en image, et pas de césure (le français n’a pas les règles de l’anglais) : une fois par instance. Des chemins
 * écrits en entier : le build embarque ces fichiers dans la fonction (comme les images de partage, carte-verdict.tsx).
 */
const preparation = Promise.all([fichiersDeLaMarque(), readFile(join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")), vide]).then(
  ([{ noir, extra, bulle }, repli, transparent]) => {
    const enUrl = (b: Buffer) => `data:font/ttf;base64,${b.toString("base64")}`;
    Font.register({
      family: "Nunito",
      fonts: [
        { src: enUrl(extra), fontWeight: 800 },
        { src: enUrl(noir), fontWeight: 900 },
      ],
    });
    Font.register({ family: "Repli", src: enUrl(repli) });
    Font.registerHyphenationCallback((mot) => [mot]);
    Font.registerEmojiSource({ builder: (code) => emojisDuTexte.get(code) ?? transparent });
    return { bulle };
  },
);
/** La police de tout le PDF : Nunito, puis le repli pour ce qu’elle n’a pas. */
const POLICES = ["Nunito", "Repli"];

/* ———— Les petites pièces ———— */

const BLANC = "white";
/** Le trait fin autour d’une carte blanche (l’ombre de l’appli ne s’imprime pas). */
const BORD = "#E7E4DE";
const carte = { backgroundColor: BLANC, borderRadius: 18, padding: 10.5, borderWidth: 0.75, borderColor: BORD } as const;

/** Un libellé gris en tête d’une carte (« Ce qu’on voit »). */
const Libelle = ({ children, couleur = GRIS }: { children: ReactNode; couleur?: string }) => (
  <Text style={{ fontSize: T.legende, fontWeight: 900, color: couleur }}>{children}</Text>
);

/** Des paragraphes séparés par un saut de ligne, comme Paragraphs. */
function Paragraphes({ texte, taille, couleur = ENCRE, interligne }: { texte: string; taille: number; couleur?: string; interligne: number }) {
  return (
    <View style={{ gap: taille * 0.6 }}>
      {texte
        .split(/\n+/)
        .filter(Boolean)
        .map((p, i) => (
          <Text key={i} style={{ fontSize: taille, lineHeight: interligne, color: couleur }}>
            {p}
          </Text>
        ))}
    </View>
  );
}

/** Une étiquette (Tag) : du texte blanc sur sa teinte foncée. */
const Etiquette = ({ couleur, children }: { couleur: string; children: ReactNode }) => (
  <View style={{ alignSelf: "flex-start", backgroundColor: couleur, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5 }}>
    <Text style={{ fontSize: 8, fontWeight: 900, color: BLANC }}>{children}</Text>
  </View>
);
const ETIQUETTES = {
  sur: { couleur: TEINTES.vraiFonce, texte: "Sûr" },
  probable: { couleur: TEINTES.attenteFonce, texte: "Probable" },
  verifier: { couleur: TEINTES.flouFonce, texte: "À vérifier" },
  meilleur: { couleur: TEINTES.vraiFonce, texte: "Le meilleur" },
} as const;

/** Une pastille ronde (Dot). */
const Point = ({ couleur, taille = 7 }: { couleur: string; taille?: number }) => (
  <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur }} />
);

/** Un message cité, en bulle de conv, avec qui parle et quand dessous : jamais coupé entre deux pages, en entier. */
function Bulle({ m, legende = m.caption }: { m: Message; legende?: string }) {
  const toi = m.from === "toi";
  return (
    <View wrap={false} style={{ alignSelf: toi ? "flex-end" : "flex-start", alignItems: toi ? "flex-end" : "flex-start", maxWidth: "82%", gap: 3 }}>
      <View
        style={{
          backgroundColor: toi ? BLEU : TEINTES.bulleRecue,
          borderTopLeftRadius: 13.5,
          borderTopRightRadius: 13.5,
          borderBottomLeftRadius: toi ? 13.5 : 4.5,
          borderBottomRightRadius: toi ? 4.5 : 13.5,
          paddingVertical: 6.5,
          paddingHorizontal: 9.75,
        }}
      >
        <Text style={{ fontSize: T.detail, lineHeight: 1.35, color: toi ? BLANC : ENCRE }}>{m.text}</Text>
      </View>
      {legende ? <Text style={{ fontSize: T.micro, color: GRIS }}>{legende}</Text> : null}
    </View>
  );
}

/** Une icône au trait du jeu de l’appli (src/components/ui/icons.tsx), en 24 × 24. */
const Icone = ({ d, taille, couleur, plein = false }: { d: string; taille: number; couleur: string; plein?: boolean }) => (
  <Svg width={taille} height={taille} viewBox="0 0 24 24">
    <Path d={d} stroke={couleur} strokeWidth={2.2} fill={plein ? couleur : "none"} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const ICONES = { bolt: "M13 2L4 14h7l-1 8 9-12h-7z", lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" };

/* ———— Les blocs d’un chapitre ———— */

/** Ce que les blocs savent de l’histoire : l’image de la bulle de la marque, et le pronom de l’autre (« Il » ou « Elle »). */
type Contexte = { bulle: Buffer; autre?: Pronom };

function Scores({ rows, autre }: { rows: ScoreRow[]; autre?: Pronom }) {
  const lui = IlOuElle(autre);
  const couleurDe = { toi: TEINTES.toiFonce, elle: TEINTES.elleFonce, pareil: TEINTES.vraiFonce } as const;
  return (
    <View wrap={false} style={{ ...carte, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: T.micro, fontWeight: 900 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Point couleur={TEINTES.toi} taille={6} />
          <Text style={{ color: TEINTES.toiFonce }}>Toi</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Text style={{ color: TEINTES.elleFonce }}>{lui}</Text>
          <Point couleur={TEINTES.elle} taille={6} />
        </View>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={{ paddingVertical: 6, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 9, fontSize: T.detail, fontWeight: 900 }}>
            <Text>{r.label}</Text>
            <Text style={{ color: couleurDe[r.winner] }}>{r.winner === "elle" ? lui.toLowerCase() : r.winner}</Text>
          </View>
          {/* La barre : toi en bleu, sur le rose de l’autre (le rose à 35 % sur le blanc) */}
          <View style={{ height: 10, borderRadius: 5, backgroundColor: "#FFC1DC", flexDirection: "row" }}>
            <View style={{ width: `${Math.max(0, Math.min(100, r.toiPercent))}%`, borderRadius: 5, backgroundColor: TEINTES.toi }} />
          </View>
          {(r.captionLeft || r.captionRight) && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: T.micro, color: GRIS }}>
              <Text>{r.captionLeft}</Text>
              <Text>{r.captionRight}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** Une ligne de constat, sa pastille verte devant (Fact). */
const Constat = ({ children }: { children: string }) => (
  <View style={{ flexDirection: "row", gap: 6 }}>
    <View style={{ marginTop: 3.5 }}>
      <Point couleur={TEINTES.vrai} taille={8} />
    </View>
    <Text style={{ flex: 1, fontSize: T.detail, lineHeight: 1.4 }}>{children}</Text>
  </View>
);

/** Une carte blanche à anneau d’encre (shadow-selected) : le duo, le mot de la fin. */
const carteAnneau = { ...carte, borderWidth: 1.5, borderColor: ENCRE, padding: 12 } as const;

/** Un emoji dans sa pastille ronde teintée (le trophée du duo, la main de « stop »). */
const Pastille = ({ emoji, fond, taille }: { emoji: string; fond: string; taille: number }) => (
  <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: fond, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ fontSize: taille * 0.55 }}>{emoji}</Text>
  </View>
);

function Bloc({ bloc, ctx }: { bloc: ChapterBlock; ctx: Contexte }) {
  switch (bloc.kind) {
    case "essential":
      return <Text style={{ fontSize: T.essentiel, fontWeight: 900, lineHeight: 1.2 }}>{bloc.text}</Text>;
    case "seen":
      return (
        <View style={{ ...carte, gap: 6 }}>
          <Libelle>{bloc.title ?? "Ce qu’on voit"}</Libelle>
          {bloc.facts?.map((f) => (
            <Constat key={f}>{f}</Constat>
          ))}
          {bloc.messages?.map((m, i) => (
            <Bulle key={i} m={m} legende={m.caption ?? ""} />
          ))}
          {bloc.factsAfter?.map((f) => (
            <Constat key={f}>{f}</Constat>
          ))}
        </View>
      );
    case "meaning":
      return (
        <View wrap={false} style={{ gap: 3 }}>
          <Libelle>Ce que ça veut dire</Libelle>
          <Text style={{ fontSize: T.corps, lineHeight: 1.45 }}>{bloc.text}</Text>
        </View>
      );
    case "play":
      return (
        <View wrap={false} style={{ ...carte, backgroundColor: TEINTES.jouer, borderColor: TEINTES.toi, borderWidth: 1.1, flexDirection: "row", gap: 7.5, paddingHorizontal: 12 }}>
          <Icone d={ICONES.bolt} taille={15} couleur={TEINTES.toi} />
          <View style={{ flex: 1, gap: 2 }}>
            <Libelle couleur={TEINTES.toiFonce}>À toi de jouer</Libelle>
            <Text style={{ fontSize: T.detail, fontWeight: 900, lineHeight: 1.4 }}>{bloc.text}</Text>
          </View>
        </View>
      );
    case "confidence":
      return (
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Etiquette couleur={ETIQUETTES[bloc.level].couleur}>{ETIQUETTES[bloc.level].texte}</Etiquette>
          <Text style={{ flex: 1, fontSize: T.legende, color: GRIS }}>{bloc.text}</Text>
        </View>
      );
    case "scores":
      return <Scores rows={bloc.rows} autre={ctx.autre} />;
    case "timeline":
      return (
        <View style={{ gap: 9 }}>
          {bloc.items.map((it, i) => (
            <View key={i} wrap={false} style={{ ...carte, gap: 4.5 }}>
              <Libelle>{it.title}</Libelle>
              <Text style={{ fontSize: T.note, lineHeight: 1.45 }}>{it.text}</Text>
              {it.message && <Bulle m={it.message} legende="" />}
            </View>
          ))}
        </View>
      );
    case "duo":
      return (
        <View style={{ gap: 9 }}>
          <View wrap={false} style={{ ...carteAnneau, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7.5 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- une image du PDF, sans texte alternatif à porter */}
              <Image src={{ data: ctx.bulle, format: "png" }} style={{ width: 33, height: 33 }} />
              <Text style={{ fontSize: 16.5, fontWeight: 900 }}>{bloc.title}</Text>
            </View>
            <Text style={{ fontSize: T.note, lineHeight: 1.45 }}>{bloc.text}</Text>
          </View>
          {bloc.trophies.map((t) => (
            <View key={t.title} wrap={false} style={{ ...carte, flexDirection: "row", alignItems: "center", gap: 9 }}>
              <Pastille emoji="🏆" fond={t.side === "toi" ? "#E2EEFF" : "#FFE4F0"} taille={31.5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: T.detail, fontWeight: 900 }}>{t.title}</Text>
                <Text style={{ fontSize: T.micro, color: GRIS }}>{t.text}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "scenarios":
      return (
        <View style={{ gap: 9 }}>
          {bloc.items.map((s, i) => (
            <View key={i} wrap={false} style={{ ...carte, gap: 4.5 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <Text style={{ flex: 1, fontSize: T.detail, fontWeight: 900 }}>{s.title}</Text>
                <Etiquette couleur={ETIQUETTES[s.tag].couleur}>{ETIQUETTES[s.tag].texte}</Etiquette>
              </View>
              <Text style={{ fontSize: T.note, lineHeight: 1.45, color: DOUX }}>{s.text}</Text>
            </View>
          ))}
        </View>
      );
    case "plan":
      return (
        <View style={{ ...carte, paddingVertical: 3, paddingHorizontal: 12 }}>
          {bloc.items.map((p, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", gap: 9, paddingVertical: 7.5, borderTopWidth: i ? 0.75 : 0, borderColor: BORD }}>
              <Text style={{ width: 58, fontSize: T.legende, fontWeight: 900, color: TEINTES.toiFonce }}>{p.when}</Text>
              <View style={{ flex: 1, gap: 1.5 }}>
                <Text style={{ fontSize: T.detail, fontWeight: 900 }}>{p.title}</Text>
                <Text style={{ fontSize: T.micro, color: GRIS, lineHeight: 1.35 }}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "question":
      /* « LA question », à envoyer telle quelle (l’écran la copie d’un toucher) */
      return (
        <View wrap={false} style={{ ...carte, gap: 4.5 }}>
          <Libelle>{bloc.label}</Libelle>
          <Text style={{ fontSize: T.accent, fontWeight: 900, lineHeight: 1.35 }}>{bloc.text}</Text>
        </View>
      );
    case "lead":
      return <Paragraphes texte={bloc.text} taille={T.carte} interligne={1.5} />;
    case "story":
      return (
        <View style={{ gap: 9 }}>
          <Paragraphes texte={bloc.text} taille={T.corps} interligne={1.6} />
          {bloc.messages && bloc.messages.length > 0 && (
            <View style={{ ...carte, gap: 6 }}>
              {bloc.messages.map((m, i) => (
                <Bulle key={i} m={m} />
              ))}
            </View>
          )}
        </View>
      );
    case "punchline":
      return (
        <View wrap={false} style={{ backgroundColor: ENCRE, borderRadius: 18, paddingVertical: 10.5, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: T.carte, fontWeight: 900, lineHeight: 1.3, color: BLANC }}>{bloc.text}</Text>
        </View>
      );
    case "stop":
      return (
        <View style={{ gap: 9 }}>
          {bloc.items.map((s) => (
            <View key={s.title} style={{ ...carte, gap: 6 }}>
              <View wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 7.5 }}>
                <Pastille emoji="✋" fond="#FFE4F0" taille={25.5} />
                <Text style={{ flex: 1, fontSize: T.detail, fontWeight: 900 }}>{s.title}</Text>
              </View>
              <Text style={{ fontSize: T.note, lineHeight: 1.45, color: DOUX }}>{s.text}</Text>
              {s.messages?.map((m, i) => (
                <Bulle key={i} m={m} />
              ))}
            </View>
          ))}
        </View>
      );
    case "ending":
      return (
        <View style={{ ...carteAnneau, gap: 9 }}>
          <View wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 7.5 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- une image du PDF, sans texte alternatif à porter */}
            <Image src={{ data: ctx.bulle, format: "png" }} style={{ width: 27, height: 27 }} />
            <Libelle>Le mot de la fin</Libelle>
          </View>
          <Paragraphes texte={bloc.text} taille={T.corps} interligne={1.55} />
        </View>
      );
  }
}

/** Le séparateur entre deux chapitres (ChapterRule). */
const Trait = () => <View style={{ height: 1.5, backgroundColor: TEINTES.trait, marginVertical: 6 }} />;

/** L’en-tête d’un chapitre : sa pastille d’encre, son surtitre, son titre ; jamais seul en bas d’une page. */
function EnTeteChapitre({ chapitre }: { chapitre: Chapter }) {
  return (
    <View wrap={false} minPresenceAhead={PLACE_SOUS_UN_TITRE} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View style={{ minWidth: 28.5, height: 28.5, borderRadius: 14.25, backgroundColor: ENCRE, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 }}>
        <Text style={{ fontSize: T.corps, fontWeight: 900, color: BLANC }}>{chapitre.number}</Text>
      </View>
      <View style={{ flex: 1, gap: 1.5 }}>
        {chapitre.kicker && <Libelle>{chapitre.kicker}</Libelle>}
        <Text style={{ fontSize: T.titre3, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.36 }}>{chapitre.title}</Text>
      </View>
    </View>
  );
}

/* ———— Les pages ———— */

/** Ce que le PDF reçoit : le rapport tel que l’écran le lit, l’histoire, qui est toi (sinon celle de l’histoire), le jour, le site. */
export type RapportEnPdf = { payload: ReportPayload; story: Story; moi?: string | null; le: Date; site: string };

/** Le jour, à Paris : « 13 octobre 2026 », « 1er mai 2026 ». */
const jour = (le: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }).format(le).replace(/^1 /, "1er ");

/** Le papier crème posé sur chaque page blanche, avec sa marge (dessiné sous le reste, page après page). */
const Feuille = () => (
  <View
    fixed
    style={{ position: "absolute", top: FEUILLE.marge, left: FEUILLE.marge, right: FEUILLE.marge, bottom: FEUILLE.bas, backgroundColor: PAPIER, borderRadius: FEUILLE.arrondi }}
  />
);

/** Le pied de chaque page, sur le blanc sous le papier : le site (un lien), « ton rapport, rien qu’à toi », le numéro de la page. */
const Pied = ({ site }: { site: string }) => (
  <View
    fixed
    style={{
      position: "absolute",
      left: FEUILLE.marge + 14,
      right: FEUILLE.marge + 14,
      bottom: 17,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: GRIS,
    }}
  >
    <Text>
      <Link src={site} style={{ color: GRIS, textDecoration: "none" }}>
        {SITE_AFFICHE}
      </Link>
      {" · ton rapport, rien qu’à toi"}
    </Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber}\u00a0/\u00a0${totalPages}`} />
  </View>
);

/** La page A4 d’un texte qui s’enchaîne : le papier, la police, les marges du papier, le pied. */
const PageDeTexte = ({ site, children }: { site: string; children: ReactNode }) => (
  <Page
    size="A4"
    style={{
      backgroundColor: BLANC,
      fontFamily: POLICES,
      fontWeight: 800,
      fontSize: T.corps,
      color: ENCRE,
      paddingTop: FEUILLE.marge + 32,
      paddingBottom: FEUILLE.bas + 26,
      paddingHorizontal: FEUILLE.marge + 28,
    }}
  >
    <Feuille />
    <View style={{ gap: 13.5 }}>{children}</View>
    <Pied site={site} />
  </Page>
);

/** Les lueurs du papier de la page de garde (LUEURS, celles des images de partage), en dégradés ronds. */
function Lueurs({ l, h }: { l: number; h: number }) {
  return (
    <Svg width={l} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
      <Defs>
        {LUEURS.map(({ couleur, opacite }, i) => (
          <RadialGradient key={i} id={`lueur${i}`}>
            <Stop offset={0} stopColor={couleur} stopOpacity={opacite} />
            <Stop offset={0.7} stopColor={couleur} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {LUEURS.map(({ centre, rayons }, i) => {
        const [rx, ry] = [(l * rayons[0]) / 100, (h * rayons[1]) / 100];
        const [cx, cy] = [(l * centre[0]) / 100, (h * centre[1]) / 100];
        return <Rect key={i} x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} fill={`url(#lueur${i})`} />;
      })}
    </Svg>
  );
}

/** Un chiffre de la page de garde : sa valeur, son nom dessous (chiffresDuRapport). */
const Chiffre = ({ valeur, nom }: { valeur: string; nom: string }) => (
  <View style={{ flex: 1, gap: 1.5 }}>
    <Text style={{ fontSize: 17, fontWeight: 900 }}>{valeur}</Text>
    <Text style={{ fontSize: T.micro, color: GRIS }}>{nom}</Text>
  </View>
);

/** Une initiale ronde (Avatar) : bleue pour toi, rose pour l’autre, cernée de blanc. */
const Initiale = ({ lettre, couleur, decalage = 0 }: { lettre: string; couleur: string; decalage?: number }) => (
  <View
    style={{
      marginLeft: decalage,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: couleur,
      borderWidth: 2.5,
      borderColor: BLANC,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text style={{ fontSize: 15, fontWeight: 900, color: BLANC }}>{lettre}</Text>
  </View>
);

/**
 * La page de garde, au dessin de la marque : le logo, « Le rapport de votre histoire », vos deux prénoms comme dans
 * l’appli, la période et les chiffres de la conv, le verdict, le vocal qui attend dans l’appli, et le jour du rapport.
 */
function PageDeGarde({ payload, story, moi, le, site, bulle, emoji }: RapportEnPdf & { bulle: Buffer; emoji: Buffer | null }) {
  const { report, debloque } = payload;
  const { moi: toi, autre } = moiEtAutre(story, moi);
  const [l, h] = [595.28 - 2 * FEUILLE.marge, 841.89 - 2 * FEUILLE.marge];
  const chiffres = [
    { valeur: formatCount(story.totalMessages), nom: "messages" },
    { valeur: String(nombreDApplis(story)), nom: nombreDApplis(story) === 1 ? "appli" : "applis" },
    { valeur: String(story.voiceCount), nom: story.voiceCount === 1 ? "vocal" : "vocaux" },
    { valeur: debloque ? report.readingTime.full : report.readingTime.free, nom: "de lecture" },
  ];
  return (
    <Page size="A4" style={{ backgroundColor: BLANC, fontFamily: POLICES, fontWeight: 800, color: ENCRE }}>
      <View style={{ position: "absolute", top: FEUILLE.marge, left: FEUILLE.marge, width: l, height: h, backgroundColor: PAPIER, borderRadius: FEUILLE.arrondi }}>
        <Lueurs l={l} h={h} />
        <View style={{ flex: 1, padding: 38, justifyContent: "space-between" }}>
          {/* Le logo, et ce que ce rapport est : complet, ou l’aperçu gratuit */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Link src={site} style={{ flexDirection: "row", alignItems: "center", gap: 6, textDecoration: "none", color: ENCRE }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- une image du PDF, sans texte alternatif à porter */}
              <Image src={{ data: bulle, format: "png" }} style={{ width: 30, height: 30 }} />
              <Text style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.63 }}>blush</Text>
            </Link>
            <Etiquette couleur={debloque ? ENCRE : TEINTES.toiFonce}>{debloque ? "Complet" : "Aperçu gratuit"}</Etiquette>
          </View>

          {/* L’en-tête du rapport, puis le verdict qui l’ouvre, comme à l’écran : ensemble, au milieu de la page */}
          <View style={{ gap: 34 }}>
            <View style={{ gap: 12 }}>
              <Libelle>Le rapport de votre histoire</Libelle>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flexDirection: "row" }}>
                  <Initiale lettre={toi.initial} couleur={TEINTES.toi} />
                  <Initiale lettre={autre.initial} couleur={TEINTES.elle} decalage={-10} />
                </View>
                <Text style={{ flex: 1, fontSize: 36, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.72 }}>{titreDuo(story)}</Text>
              </View>
              <Text style={{ fontSize: T.note, color: GRIS }}>{story.period}</Text>
              <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 1.5, borderColor: TEINTES.trait, paddingTop: 11, marginTop: 2 }}>
                {chiffres.map((c) => (
                  <Chiffre key={c.nom} {...c} />
                ))}
              </View>
            </View>

            <View style={{ ...carte, padding: 18, borderRadius: 22, gap: 9 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {emoji && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- une image du PDF, sans texte alternatif à porter
                  <Image src={{ data: emoji, format: "png" }} style={{ width: 52, height: 52 }} />
                )}
                <Text style={{ flex: 1, fontSize: 25, fontWeight: 900, lineHeight: 1.08, letterSpacing: -0.5 }}>{report.verdict.title}</Text>
              </View>
              {report.verdict.subtitle ? <Text style={{ fontSize: T.accent, lineHeight: 1.45, color: DOUX }}>{report.verdict.subtitle}</Text> : null}
            </View>
          </View>

          <View style={{ gap: 9 }}>
            {payload.vocal && <LigneVocal />}
            <Text style={{ fontSize: T.legende, color: GRIS }}>
              {`Ton rapport du ${jour(le)} · `}
              <Link src={site} style={{ color: GRIS, textDecoration: "none" }}>
                {SITE_AFFICHE}
              </Link>
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

/** Le vocal ne s’imprime pas : il attend dans l’appli. */
const LigneVocal = () => (
  <View style={{ alignSelf: "flex-start", backgroundColor: ENCRE, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 11 }}>
    <Text style={{ fontSize: T.legende, fontWeight: 900, color: BLANC }}>Ton résumé vocal t’attend dans l’appli</Text>
  </View>
);

/** Les chapitres encore fermés : leurs titres, et où lire la suite (l’aperçu gratuit) ou qu’elle s’écrit (le rapport débloqué). */
function Suite({ fermes, debloque, site }: { fermes: Chapter[]; debloque: boolean; site: string }) {
  return (
    <View style={{ gap: 9 }}>
      <Trait />
      {/* Le libellé, la liste et la ligne qui dit où lire la suite : ensemble, sur la même page */}
      <View wrap={false} style={{ gap: 9 }}>
        <Libelle>{`La suite de ton rapport${debloque ? " s’écrit" : ""} · ${fermes.length} chapitre${fermes.length > 1 ? "s" : ""}`}</Libelle>
        <View style={{ ...carte, paddingVertical: 3, paddingHorizontal: 12 }}>
          {fermes.map((c, i) => (
            <View key={c.number} wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 8, borderTopWidth: i ? 0.75 : 0, borderColor: BORD }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: TEINTES.plaque, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: T.micro, fontWeight: 900, color: GRIS }}>{c.number}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: T.note, fontWeight: 900, color: GRIS }}>{c.tocTitle}</Text>
              <Icone d={ICONES.lock} taille={12} couleur={TEINTES.muet} />
            </View>
          ))}
        </View>
        {debloque ? (
          <Text style={{ fontSize: T.accent, fontWeight: 900 }}>La suite s’écrit encore{NBSP}: retrouve-la dans l’appli.</Text>
        ) : (
          <Text style={{ fontSize: T.accent, fontWeight: 900 }}>
            {"La suite t’attend sur "}
            <Link src={site} style={{ color: TEINTES.toiFonce }}>
              {SITE_AFFICHE}
            </Link>
          </Text>
        )}
      </View>
    </View>
  );
}

/** Le rapport doux du mode sobre, tel quel : encre et papier, ni couleur de sens, ni score, ni logo en volume. */
function PagesSobres({ sobre, vocal, le, site }: { sobre: SoberReport; vocal: boolean; le: Date; site: string }) {
  return (
    <PageDeTexte site={site}>
      <Text style={{ fontSize: T.legende, fontWeight: 900, color: GRIS }}>{`Ton rapport · ${jour(le)}`}</Text>
      {vocal && <LigneVocal />}
      <Text style={{ fontSize: 15, lineHeight: 1.45, color: DOUX }}>{sobre.intro}</Text>
      <Text style={{ fontSize: 27, fontWeight: 900, lineHeight: 1.08, letterSpacing: -0.54 }}>{sobre.title}</Text>
      <Text style={{ fontSize: T.accent, lineHeight: 1.45, color: DOUX }}>{sobre.facts}</Text>
      <Text style={{ fontSize: T.accent, lineHeight: 1.45 }}>{sobre.reassurance}</Text>
      <Trait />
      <View wrap={false} minPresenceAhead={PLACE_SOUS_UN_TITRE}>
        <Text style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.48 }}>Passe à autre chose, proprement.</Text>
      </View>
      {sobre.steps.map((s, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ width: 22.5, height: 22.5, borderRadius: 11.25, borderWidth: 1.5, borderColor: "#D6D2C8", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: T.note, fontWeight: 900, color: DOUX }}>{i + 1}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: T.corps, lineHeight: 1.45 }}>{s}</Text>
        </View>
      ))}
      <View wrap={false} style={{ ...carte, padding: 12, gap: 4.5 }}>
        <Libelle>{sobre.draftLabel}</Libelle>
        <Text style={{ fontSize: T.corps, lineHeight: 1.45 }}>{sobre.draft}</Text>
      </View>
      <View wrap={false} style={{ gap: 7.5 }}>
        <Text style={{ fontSize: T.carte, fontWeight: 900 }}>{sobre.helpLabel}</Text>
        {LIGNES_D_ECOUTE.map((h) => (
          <View key={h.name} style={{ ...carte, padding: 10.5, gap: 1.5 }}>
            <Text style={{ fontSize: T.corps, fontWeight: 900 }}>{`${h.name} · ${h.label}`}</Text>
            <Text style={{ fontSize: T.legende, color: GRIS }}>{h.detail}</Text>
          </View>
        ))}
      </View>
    </PageDeTexte>
  );
}

/**
 * Le PDF du rapport (ou du rapport doux du mode sobre), en octets : A4, plusieurs pages, titre « Ton rapport BLUSH »,
 * auteur BLUSH, rien de personnel dans ses métadonnées. `payload` : ce que la lecture du rapport rend pour ce compte
 * (rapportDe, src/server/donnees.ts), donc déjà ce qu’il a le droit de lire.
 */
export async function pdfDuRapport(r: RapportEnPdf): Promise<Buffer> {
  const { bulle } = await preparation;
  const { payload, story, site, le } = r;
  const { report, sober } = payload;
  await preparerEmojis(JSON.stringify([report.verdict, report.chapters, sober, story.participants]) + "🏆✋");
  const emoji = sober ? null : await emojiEnImage(report.verdict.emoji, 360).catch(() => null);
  const { autre } = moiEtAutre(story, r.moi);
  const ouverts = report.chapters.filter((c) => !c.locked);
  const fermes = report.chapters.filter((c) => c.locked);
  const ctx: Contexte = { bulle, autre: autre.pronoun };
  const meta = { title: "Ton rapport BLUSH", author: "BLUSH", creator: "BLUSH", producer: "BLUSH", language: "fr-FR" };
  return renderToBuffer(
    <Document {...meta}>
      {sober ? (
        <PagesSobres sobre={sober} vocal={!!payload.vocal} le={le} site={site} />
      ) : (
        <>
          <PageDeGarde {...r} bulle={bulle} emoji={emoji} />
          <PageDeTexte site={site}>
            {ouverts.map((c, i) => (
              <View key={c.number} style={{ gap: 13.5 }}>
                {i > 0 && <Trait />}
                <EnTeteChapitre chapitre={c} />
                {c.blocks.map((b, k) => (
                  <Bloc key={k} bloc={b} ctx={ctx} />
                ))}
              </View>
            ))}
            {fermes.length > 0 && <Suite fermes={fermes} debloque={payload.debloque} site={site} />}
          </PageDeTexte>
        </>
      )}
    </Document>,
  );
}
