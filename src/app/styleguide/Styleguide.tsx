"use client";

import { useState, type ReactNode } from "react";
import { BubbleLogo, Bell3D, CheckBurst, Lock3D, Marbles } from "@/components/brand/objects3d";
import { Logo } from "@/components/brand/Logo";
import { AppBadge, Avatar, AvatarPair } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardLabel, PlayCard, StepList } from "@/components/ui/cards";
import { AppTile, Chip, ChoiceCard, ChoiceTile, Segmented, Switch } from "@/components/ui/controls";
import { EmailField, EMAIL_RE } from "@/components/ui/EmailField";
import { Bubble, PariTag, ProofCard, Tag } from "@/components/ui/messages";
import { LevelPath, LockRow, ProgressDots, ScoreCard } from "@/components/ui/progress";
import { ChapterHeader, Essential, Meaning, Seen } from "@/components/ui/report";
import { Sheet, Toast } from "@/components/ui/surfaces";

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[26px] font-black tracking-[-0.01em]">{title}</h2>
        {sub && <p className="m-0 text-[15px] font-extrabold text-grey">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Spec({ label, note, width, children }: { label: string; note?: string; width?: number; children: ReactNode }) {
  return (
    <div className="flex max-w-full flex-col gap-2.5" style={{ width }}>
      <div className="text-[12px] font-black tracking-[0.06em] text-soft">{label}</div>
      {children}
      {note && <div className="text-[12px] font-extrabold leading-[1.4] text-grey">{note}</div>}
    </div>
  );
}

function Row({ children, gap = 32 }: { children: ReactNode; gap?: number }) {
  return (
    <div className="flex flex-wrap items-start" style={{ gap }}>
      {children}
    </div>
  );
}

const SWATCHES = [
  { hex: "#F4F2ED", name: "Papier", text: "Le fond de tous les écrans, avec une lumière blanche en haut.", dark: false },
  { hex: "#FFFFFF", name: "Blanc", text: "Les cartes, les options, les bulles de saisie.", dark: false },
  { hex: "#F1EFEA", name: "Plaque", text: "Les zones secondaires : astuces, ajouts.", dark: false },
  { hex: "#E6E3DC", name: "Ligne", text: "Les bords et les séparateurs.", dark: false },
  { hex: "#121214", name: "Encre", text: "Le texte et le bouton principal.", dark: true },
  { hex: "#4B4A47", name: "Doux", text: "Le texte secondaire.", dark: true },
  { hex: "#8A8780", name: "Gris", text: "Les légendes, en 13 px gras minimum.", dark: true },
];

const SENSE = [
  { hex: "#3D8BFF", name: "Toi", text: "Tes messages, tes scores, tes défis." },
  { hex: "#FF4F9A", name: "Elle", text: "Ses messages, ses scores, ton pari raté." },
  { hex: "#12C08A", name: "La vérité", text: "Ce que dit votre conv, ce qui est sûr, ce qui est réussi." },
  { hex: "#9B7BFF", name: "Le flou", text: "Ce qui reste à vérifier." },
  { hex: "#FFAA2C", name: "L’attente", text: "Ce qui est probable, ce qui se joue encore." },
];

const TYPE_SCALE = [
  { name: "Affiche", spec: "56 px · 900", use: "Titres de pages, couverture", sample: "Vous êtes à deux doigts.", size: 56, weight: 900 },
  { name: "Titre 1", spec: "36 px · 900", use: "Question, verdict", sample: "Qui tient le plus à l’autre ?", size: 36, weight: 900 },
  { name: "Titre 2", spec: "30 px · 900", use: "Titre d’écran", sample: "Ajoute votre conv, comme tu veux.", size: 30, weight: 900 },
  { name: "Titre 3", spec: "24 px · 900", use: "Chapitres du rapport", sample: "Le moment où tout a basculé", size: 24, weight: 900 },
  { name: "Titre de carte", spec: "18 px · 900", use: "Options, cartes", sample: "Des captures", size: 18, weight: 900 },
  { name: "Corps", spec: "16 px · 800", use: "Texte courant", sample: "Devine ce qu’elle ressent. Votre conv te dit si tu as raison.", size: 16, weight: 800 },
  { name: "Légende", spec: "13 px · 900", use: "Repères, étiquettes", sample: "Question 3 sur 7 · ton pari", size: 13, weight: 900 },
  { name: "Chiffre", spec: "52 px · 900", use: "Scores, compteurs", sample: "1 202 · 4 / 7", size: 52, weight: 900 },
];

export function Styleguide() {
  const [seg, setSeg] = useState<"whatsapp" | "imessage">("whatsapp");
  const [sw, setSw] = useState(true);
  const [chip, setChip] = useState("flou");
  const [tile, setTile] = useState<string>("flou");
  const [card, setCard] = useState<"export" | "captures">("captures");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-14 px-4 py-10 md:px-[72px] md:py-16">
      {/* En-tête */}
      <header className="flex flex-wrap items-start justify-between gap-8">
        <div className="max-w-[760px]">
          <div className="flex items-center gap-2.5 text-[14px] font-black tracking-[0.06em] text-grey">
            <BubbleLogo size={22} />
            BLUSH · DESIGN SYSTEM
          </div>
          <h1 className="m-0 mt-3.5 text-[44px] font-black leading-[1.02] tracking-[-0.03em] md:text-[56px]">Le jeu</h1>
          <p className="m-0 mt-2.5 text-[19px] font-bold leading-[1.5] text-soft">
            L’interface de BLUSH : un papier chaud, une typo ronde, des boutons qu’on a envie d’appuyer, et trois couleurs qui disent qui parle et ce qui est vrai.
          </p>
          <p className="m-0 mt-5 text-[21px] font-black">De « on se parle » à « on est ensemble ».</p>
        </div>
        <div data-float="" style={{ ["--r" as string]: "-6deg" }}>
          <BubbleLogo size={200} />
        </div>
      </header>

      {/* 01 Couleurs */}
      <Section title="Couleurs" sub="Le fond reste neutre. La couleur n’est jamais décorative : elle dit qui parle (toi, elle) ou ce qui est vrai.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <div key={s.hex} className="flex flex-col gap-2.5">
              <div className="flex h-24 items-end rounded-[20px] p-3 text-[13px] font-black" style={{ background: s.hex, color: s.dark ? "#FFFFFF" : "#121214", boxShadow: "inset 0 0 0 1px rgba(17,17,20,0.08)" }}>
                {s.hex}
              </div>
              <div>
                <div className="text-[17px] font-black">{s.name}</div>
                <div className="text-[13px] font-bold leading-[1.4] text-soft">{s.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SENSE.map((s) => (
            <div key={s.hex} className="flex flex-col gap-2.5">
              <div className="flex h-[120px] items-end rounded-[20px] p-3 text-[13px] font-black text-white" style={{ background: `var(--gloss), ${s.hex}` }}>
                {s.hex}
              </div>
              <div>
                <div className="text-[17px] font-black">{s.name}</div>
                <div className="text-[13px] font-bold leading-[1.4] text-soft">{s.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "Opale", bg: "linear-gradient(90deg, #8FC8FF 0%, #CFFFF0 25%, #8FC8FF 55%, #E6A8FF 85%, #FFD3A1 100%)", text: "Le troisième point du logo et les billes. Jamais sur du texte." },
            { name: "Rose BLUSH", bg: "var(--rose-blush)", text: "La couleur du logo : la bulle rose en volume." },
            { name: "Nacre", bg: "linear-gradient(90deg, #FFFFFF 0%, #F3F1F7 45%, #CEC8DB 100%)", text: "Les billes neutres qui accompagnent l’opale." },
          ].map((m) => (
            <div key={m.name} className="flex flex-col gap-2.5">
              <div className="h-[120px] rounded-[20px]" style={{ background: m.bg }} />
              <div>
                <div className="text-[17px] font-black">{m.name}</div>
                <div className="text-[13px] font-bold leading-[1.4] text-soft">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 02 Typographie */}
      <Section title="Typographie" sub="Nunito partout dans l’interface. Figtree seulement pour les vrais messages.">
        <div className="flex flex-col">
          {TYPE_SCALE.map((t) => (
            <div key={t.name} className="flex flex-col gap-2 border-b border-line py-5 md:flex-row md:items-center md:gap-0">
              <div className="w-[252px] shrink-0">
                <div className="text-[15px] font-black">{t.name}</div>
                <div className="text-[13px] font-extrabold text-grey">{t.spec}</div>
                <div className="text-[13px] font-bold text-soft">{t.use}</div>
              </div>
              <div className="min-w-0 break-words" style={{ fontSize: `min(${t.size}px, 11vw)`, fontWeight: t.weight, lineHeight: 1.1, letterSpacing: t.size > 30 ? "-0.02em" : undefined }}>
                {t.sample}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 border-b border-line py-5 md:flex-row md:items-center">
            <div className="w-[252px] shrink-0">
              <div className="text-[15px] font-black">Message</div>
              <div className="text-[13px] font-extrabold text-grey">15 px · 700</div>
              <div className="text-[13px] font-bold text-soft">Bulles de messages (Figtree)</div>
            </div>
            <div className="font-message text-[15px] font-bold">au fait on est quoi toi et moi mdr</div>
          </div>
        </div>
        <Row gap={12}>
          <Chip>Nunito partout dans l’interface</Chip>
          <Chip>Figtree seulement pour les vrais messages</Chip>
          <Chip>Titres en 900, texte en 800</Chip>
          <Chip>Espaces insécables avant ? ! : »</Chip>
        </Row>
      </Section>

      {/* 03 Boutons et contrôles */}
      <Section title="Le bouton principal" sub="Un seul par écran.">
        <Row>
          <Spec label="PRINCIPAL" width={320}>
            <Button arrow>Lancer la partie</Button>
          </Spec>
          <Spec label="APPUYÉ" width={320} note="Il s’enfonce d’1 px et son ombre se resserre.">
            <Button arrow className="translate-y-px [box-shadow:var(--shadow-ink-pressed)]">
              Lancer la partie
            </Button>
          </Spec>
          <Spec label="DÉSACTIVÉ" width={320}>
            <Button disabled>Continuer</Button>
          </Spec>
        </Row>
      </Section>

      <Section title="Les autres actions">
        <Row>
          <Spec label="SECONDAIRE" width={320}>
            <Button variant="secondary">Ajouter des captures</Button>
          </Spec>
          <Spec label="LIEN" width={320}>
            <Button variant="link">Écrire la mienne</Button>
          </Spec>
          <Spec label="ICÔNES 44 × 44">
            <div className="flex gap-3">
              <IconButton icon="back" label="Retour" />
              <IconButton icon="close" label="Fermer" iconSize={20} />
              <IconButton icon="user" label="Mon compte" iconSize={20} />
            </div>
          </Spec>
        </Row>
      </Section>

      <Section title="Choisir">
        <Row gap={40}>
          <Spec label="CHOIX" note="Noir = choisi.">
            <div className="flex flex-wrap gap-2">
              {[
                ["parle", "On se parle"],
                ["vus", "On s’est vus"],
                ["flou", "C’est flou"],
              ].map(([v, l]) => (
                <Chip key={v} selected={chip === v} onClick={() => setChip(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </Spec>
          <Spec label="DEUX OPTIONS" width={360}>
            <Segmented
              label="Appli"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "imessage", label: "iMessage" },
              ]}
            />
          </Spec>
          <Spec label="INTERRUPTEUR" note="52 × 32, glissement 300 ms sans rebond.">
            <div className="flex gap-4">
              <Switch checked={!sw} onChange={(v) => setSw(!v)} label="Exemple désactivé" />
              <Switch checked={sw} onChange={setSw} label="Exemple activé" />
            </div>
          </Spec>
        </Row>
      </Section>

      <Section title="Les tuiles">
        <Row gap={24}>
          <Spec label="TUILE D’APPLI" width={560}>
            <div className="grid grid-cols-2 gap-3">
              <AppTile app="whatsapp" title="WhatsApp" subtitle="Export en 1 minute" href="#" />
              <AppTile app="hinge" title="Hinge" subtitle="Captures d’écran" href="#" />
              <AppTile app="autre" title="Autre appli" subtitle="Messenger, Tinder, Bumble… par captures d’écran" href="#" wide />
            </div>
          </Spec>
          <Spec label="TUILE DE CHOIX" width={360}>
            <div role="radiogroup" aria-label="Exemple" className="flex gap-2.5">
              <ChoiceTile icon="imessage" color="#3D8BFF" label="On se parle" selected={tile === "parle"} onClick={() => setTile("parle")} />
              <ChoiceTile icon="people" color="#12C08A" label="On s’est vus" selected={tile === "vus"} onClick={() => setTile("vus")} />
              <ChoiceTile icon="cloud" color="#9B7BFF" label="C’est flou" selected={tile === "flou"} onClick={() => setTile("flou")} />
            </div>
          </Spec>
        </Row>
        <Row>
          <Spec label="CARTE DE CHOIX" width={380}>
            <ChoiceCard app="whatsapp" title="L’export complet" badge="Le plus précis" subtitle="WhatsApp ou iMessage" selected={card === "export"} onClick={() => setCard("export")} />
          </Spec>
          <Spec label="CARTE CHOISIE" width={380}>
            {/* « Snap » retiré de la planche : pas de Snapchat */}
            <ChoiceCard app="instagram" title="Des captures" badge="Le plus rapide" badgeTone="toi" subtitle="Insta, Hinge…" selected={card === "captures"} onClick={() => setCard("captures")} />
          </Spec>
        </Row>
      </Section>

      {/* 04 Composants */}
      <Section title="Cartes">
        <Row gap={24}>
          <Spec label="CARTE" width={300}>
            <Card className="flex flex-col gap-1.5 px-4 py-3.5">
              <CardLabel>Sa façon d’écrire</CardLabel>
              <div className="text-[15px] font-extrabold leading-[1.45]">Répond le soir · peu d’emojis</div>
            </Card>
          </Spec>
          <Spec label="PLAQUE" width={300}>
            <Card variant="plaque" className="flex flex-col gap-2 px-4 py-3.5">
              <CardLabel>Ajoute ce que tu vois</CardLabel>
              <div className="flex flex-wrap gap-2">
                <Chip>+ capture de sa bio</Chip>
              </div>
            </Card>
          </Spec>
          <Spec label="CARTE FORTE" width={300}>
            <Card variant="strong" className="flex flex-col gap-1.5 p-4">
              <CardLabel>Votre duo</CardLabel>
              <div className="text-[18px] font-black leading-[1.45]">Le Stratège & la Relanceuse</div>
            </Card>
          </Spec>
          <Spec label="À TOI DE JOUER" width={300}>
            <PlayCard>Quand tu proposes, donne une date et une heure.</PlayCard>
          </Spec>
        </Row>
      </Section>

      <Section title="Messages et preuves" sub="Chaque affirmation de BLUSH s’appuie sur un vrai message, daté.">
        <Row gap={24}>
          <Spec label="SES MESSAGES" width={340} note="Gris, à gauche, avec la date.">
            <div className="flex flex-col">
              <Bubble from="elle" caption="Sophie · 2 mars, 23:41">
                au fait on est quoi toi et moi mdr
              </Bubble>
            </div>
          </Spec>
          <Spec label="TES MESSAGES" width={340} note="Bleu, à droite.">
            <div className="flex flex-col">
              <Bubble from="toi" caption="Toi · 23:42">
                mdr
              </Bubble>
            </div>
          </Spec>
          <Spec label="LA PREUVE" width={380}>
            <ProofCard conclusion="Vous relancez autant l’un que l’autre.">
              <Bubble from="elle" caption="Elle relance · 4 min après toi">
                tu fais quoi samedi ?
              </Bubble>
              <Bubble from="toi" caption="">
                je suis libre 🙃
              </Bubble>
            </ProofCard>
          </Spec>
        </Row>
      </Section>

      <Section title="Étiquettes" sub="Le niveau de confiance est toujours affiché.">
        <div className="flex flex-wrap items-center gap-2.5">
          <Tag tone="sur" />
          <Tag tone="probable" />
          <Tag tone="verifier" />
          <Tag tone="risque" />
          <Tag tone="meilleur" />
          <Tag tone="conseille" />
          <Tag tone="recommandee" />
          <Tag tone="partager" />
          <Tag tone="verite" />
          <PariTag />
        </div>
      </Section>

      <Section title="Données et progression">
        <Row gap={24}>
          <Spec label="BARRE DE SCORE" width={360}>
            <ScoreCard rows={[{ label: "Qui propose des plans", winner: "elle", toiPercent: 20, captionLeft: "toi : 1", captionRight: "elle : 4" }]} />
          </Spec>
          <Spec label="NIVEAUX" width={380} note="Le niveau en cours pulse doucement.">
            <Card className="px-3 py-[18px]">
              <LevelPath current="dit" />
            </Card>
          </Spec>
          <Spec label="TEMPÉRATURE (EN COUPLE)" width={380} note="Pas d’étape à franchir : juste où vous êtes, du plus froid au plus chaud.">
            <Card className="px-3 py-[18px]">
              <LevelPath current="coince" />
            </Card>
          </Spec>
          <Spec label="PROGRESSION DU PARCOURS">
            <Card className="flex h-16 items-center gap-6 px-5">
              <ProgressDots current={1} />
              <ProgressDots current={2} />
              <ProgressDots current={3} />
            </Card>
          </Spec>
        </Row>
      </Section>

      <Section title="Repères">
        <Row gap={36}>
          <Spec label="AVATARS">
            <div className="flex items-center gap-2.5">
              <Avatar tone="toi" size={44}>
                toi
              </Avatar>
              <Avatar tone="elle" size={44}>
                S
              </Avatar>
              <Avatar tone="vrai" size={44}>
                =
              </Avatar>
              <AvatarPair me="H" other="S" />
            </div>
          </Spec>
          <Spec label="PASTILLES D’APPLIS" note="Icônes neutres, pas les logos officiels.">
            <div className="flex gap-2.5">
              <AppBadge app="whatsapp" size={44} />
              <AppBadge app="imessage" size={44} />
              <AppBadge app="instagram" size={44} />
              <AppBadge app="hinge" size={44} />
              <AppBadge app="autre" size={44} />
            </div>
          </Spec>
          <Spec label="CHAPITRE VERROUILLÉ" width={360}>
            <Card className="px-4">
              <LockRow number={7} title="Votre duo" last />
            </Card>
          </Spec>
        </Row>
      </Section>

      <Section title="Le rapport">
        <Spec label="UN CHAPITRE DU RAPPORT" width={420} note="Toujours le même gabarit : l’essentiel, ce qu’on voit, ce que ça veut dire, à toi de jouer.">
          <div className="flex flex-col gap-3">
            <ChapterHeader number={5} kicker="son portrait : la Relanceuse" title="Elle" />
            <Essential>Elle montre son intérêt en agissant : elle propose, elle relance, elle se livre.</Essential>
            <Seen kind="seen" facts={["Relance après 22 h, 7 fois sur 10."]} messages={[{ from: "elle", text: "dimanche y’a un marché de noël à côté du libanais 👀", caption: "8 févr." }]} />
            <Meaning>Elle t’attend sur les plans précis.</Meaning>
            <PlayCard>Donne une date et une heure.</PlayCard>
          </div>
        </Spec>
      </Section>

      <Section title="Saisie et surfaces">
        <Row gap={24}>
          <Spec label="EMAIL" width={360}>
            <EmailField value={email} onChange={setEmail} onBlur={() => setTouched(true)} invalid={touched && !!email && !EMAIL_RE.test(email)} errorText="Vérifie ton email : il manque quelque chose." />
          </Spec>
          <Spec label="PANNEAU" width={320} note="Panneau du bas sur mobile, fenêtre centrée sur desktop.">
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Ouvrir le panneau
            </Button>
          </Spec>
          <Spec label="TOAST" width={380}>
            <Button variant="secondary" onClick={() => setToast((t) => !t)}>
              {toast ? "Masquer le toast" : "Afficher le toast"}
            </Button>
            {toast && (
              <Toast action="Oui" onAction={() => setToast(false)}>
                Copié. Je te relance samedi pour savoir ?
              </Toast>
            )}
          </Spec>
          <Spec label="ÉTAPES" width={380}>
            <StepList steps={["Ouvre votre conv", "Exporter la discussion, sans médias"]} />
          </Spec>
        </Row>
      </Section>

      {/* 05 Logo */}
      <Section title="Le logo" sub="La bulle rose, avec « blush » en encre sur fond clair, en blanc sur fond encre.">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="flex h-60 items-center justify-center">
            <Logo size={92} fontSize={64} />
          </Card>
          <div className="flex h-60 items-center justify-center rounded-card bg-ink">
            <Logo size={92} fontSize={64} onInk />
          </div>
        </div>
        <Row gap={20}>
          {[64, 40, 24, 16].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <span className="flex items-center justify-center rounded-[22%] bg-ink" style={{ width: s + 24, height: s + 24 }}>
                <BubbleLogo size={s} />
              </span>
              <span className="text-[13px] font-extrabold text-grey">{s} px</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <Logo size={64} fontSize={40} animated />
            <span className="text-[13px] font-extrabold text-grey">En mouvement · boucle de 1,3 s</span>
          </div>
        </Row>
      </Section>

      {/* 06 Objets 3D */}
      <Section title="Objets 3D et logo" sub="Le logo est la bulle rose. En plus du logo, un seul objet en volume par écran, pour marquer un moment. Jamais en mode sobre.">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
          {[
            { name: "La bulle", text: "Le logo de BLUSH, en volume. Le troisième point est en opale.", node: <div data-float="" style={{ ["--r" as string]: "-6deg" }}><BubbleLogo size={140} /></div> },
            { name: "Les billes", text: "Les trois points du logo, en volume. Nacre et opale.", node: <Marbles /> },
            { name: "Le cadenas", text: "La suite payante du rapport.", node: <div data-float=""><Lock3D size={110} /></div> },
            { name: "La cloche", text: "La relance du samedi.", node: <div data-float=""><Bell3D size={110} /></div> },
            { name: "La gerbe", text: "Une réussite : partie prête, niveau réussi, message envoyé.", node: <div className="scale-75 md:scale-100"><CheckBurst /></div> },
          ].map((o) => (
            <div key={o.name} className="flex flex-col items-center gap-3.5 text-center">
              <div className="flex h-[170px] items-center justify-center">{o.node}</div>
              <div className="text-[18px] font-black">{o.name}</div>
              <div className="text-[13px] font-bold leading-[1.4] text-soft">{o.text}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[22px] font-black">Les emojis autorisés</h3>
          <p className="m-0 text-[15px] font-extrabold text-grey">Seulement ceux-là, toujours avec le même sens.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            ["🤏", "Le verdict « à deux doigts »"],
            ["🔥", "Elle est partante"],
            ["🤔", "Elle hésite"],
            ["🧊", "Elle s’éloigne"],
            ["🏆", "Les trophées"],
          ].map(([e, l]) => (
            <div key={l} className="flex items-center gap-2.5 rounded-[20px] bg-white px-4 py-3 shadow-card">
              <span className="text-[32px] leading-none" aria-hidden="true">
                {e}
              </span>
              <span className="text-[14px] font-extrabold">{l}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 07 Mode sobre */}
      <Section title="Mode sobre" sub="Quand le verdict est dur, BLUSH sort du jeu. Même structure, mais tout ce qui est ludique disparaît.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Pas de couleur de sens", "Ni bleu, ni rose, ni vert. Encre et papier seulement."],
            ["Pas d’objet 3D", "Ni billes, ni emoji, et pas de logo en volume."],
            ["Pas de jeu", "Pas de score, pas de niveau, pas de partage."],
            ["Une sortie visible", "Le bouton « Quitter vite » reste en haut à droite."],
            ["Une aide proposée", "« Besoin d’en parler à quelqu’un ? » mène vers des ressources."],
            ["Des mots doux et vrais", "« Ça ne dit rien de ce que tu vaux. »"],
          ].map(([t, d]) => (
            <Card key={t} className="flex flex-col gap-1.5 px-[18px] py-4">
              <CardLabel>{t}</CardLabel>
              <div className="text-[15px] font-extrabold leading-[1.45]">{d}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* 08 Règles */}
      <Section title="Les règles d’or">
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {[
            ["Un seul bouton noir par écran", "C’est l’action principale. Le reste est blanc et s’efface."],
            ["Bleu toi, rose elle, vert la vérité", "Toujours le même sens, partout."],
            ["On devine, puis on sait", "Chaque révélation commence par une question. Tu réponds, la conv tranche."],
            ["Chaque affirmation a sa preuve", "Un vrai message, daté, dans une bulle."],
            ["La confiance est affichée", "Sûr, probable, à vérifier. BLUSH dit ce qu’il ne peut pas savoir."],
            ["Toujours un prochain pas", "Chaque écran finit sur une action concrète."],
            ["Un objet 3D au maximum, en plus du logo", "Pour marquer un moment, jamais pour décorer."],
            ["Le mode sobre quand c’est dur", "Pas de jeu sur une mauvaise nouvelle."],
          ].map(([t, d], i) => (
            <li key={t} className="flex items-start gap-4 rounded-card bg-white px-5 py-5 shadow-card">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[19px] bg-ink text-[15px] font-black text-white shadow-ink">{i + 1}</span>
              <div>
                <div className="text-[18px] font-black">{t}</div>
                <div className="text-[14px] font-bold leading-[1.45] text-soft">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Sheet open={sheet} onClose={() => setSheet(false)} labelledBy="sg-sheet-title">
        <h2 id="sg-sheet-title" className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em]">
          Un panneau, deux formes.
        </h2>
        <p className="m-0 text-[14px] font-bold leading-[1.45] text-soft">En bas de l’écran sur mobile, centré sur desktop. Échap ou un tap à côté pour fermer.</p>
        <Button onClick={() => setSheet(false)}>Fermer</Button>
      </Sheet>
    </main>
  );
}
