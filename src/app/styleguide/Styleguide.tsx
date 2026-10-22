"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { BubbleLogo, Bell3D, CheckBurst } from "@/components/brand/objects3d";
import { Logo } from "@/components/brand/Logo";
import { MobileTopBar } from "@/components/shell/Screen";
import { LienRetourDesktop } from "@/components/shell/BoutonRetour";
import { AppBadge, Avatar, AvatarPair } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, PlayCard } from "@/components/ui/cards";
import { ContactRing } from "@/components/ui/contact";
import { AppTile, Chip, ChoiceTile, RadioGroup, Segmented, Switch } from "@/components/ui/controls";
import { EmailField } from "@/components/ui/EmailField";
import { Alert, DoneCheck, NoteIcone, TypingDots } from "@/components/ui/feedback";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { BlushTyping, Bubble, Tag } from "@/components/ui/messages";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { FlowSteps, LevelPath, LockRow, ProgressDots, ScoreCard } from "@/components/ui/progress";
import { Block, ChapterHeader } from "@/components/ui/report";
import { Sheet, Toast } from "@/components/ui/surfaces";
import { cn } from "@/lib/cn";
import { emailValide } from "@/lib/email";
import { figtree } from "@/lib/fonts";
import { NBSP } from "@/lib/format";
import { ARCHIVAGE, CardLabel, ChoiceCard, Lock3D, Marbles, PariTag, ProofCard, StepList } from "./archive";

/*
 * La planche de l’équipe (/styleguide, jamais en ligne : src/proxy.ts). Ce qu’elle montre vient de l’appli elle-même :
 * les nuanciers et l’échelle du texte lisent les tokens de globals.css (leur valeur s’affiche telle que le navigateur la
 * calcule), et chaque section pose les vraies briques de src/components. Les briques qu’aucun écran n’utilise plus
 * sont dans ./archive.tsx, montrées à part (« Archives »), avec leur date de revue. knip ne compte pas cette page comme
 * un usage (knip.jsonc) : une brique que seule la planche montre est signalée comme du code mort.
 */

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[26px] font-black tracking-[-0.01em]">{title}</h2>
        {sub && <p className="m-0 text-detail font-extrabold text-grey">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Spec({ label, note, width, children }: { label: string; note?: string; width?: number; children: ReactNode }) {
  return (
    <div className="flex max-w-full flex-col gap-2.5" style={{ width }}>
      <div className="text-micro font-black tracking-[0.06em] text-soft">{label}</div>
      {children}
      {note && <div className="text-micro font-extrabold leading-[1.4] text-grey">{note}</div>}
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

/** La petite légende grise d’une carte de la planche. */
function Legende({ children }: { children: ReactNode }) {
  return <div className="text-legende font-black text-grey">{children}</div>;
}

/* ———— Les tokens, lus dans la page ———— */

const sansAbonnement = () => () => {};
/**
 * La valeur d’une variable CSS (`--color-paper`, `--text-legende`), telle que le navigateur la calcule sur la racine : la
 * planche affiche ce que les écrans reçoivent, jamais une copie. Vide au rendu du serveur.
 */
function useJeton(jeton: string): string {
  return useSyncExternalStore(
    sansAbonnement,
    () => getComputedStyle(document.documentElement).getPropertyValue(jeton).trim(),
    () => "",
  );
}

/**
 * Un nuancier : `classe` peint la pastille (la classe du token, écrite en entier pour que Tailwind la génère), `jeton`
 * dit sa valeur. `sombre` : un texte blanc sur la pastille. `sens` : une couleur qui dit qui parle ou ce qui est vrai,
 * avec son reflet.
 */
type Nuance = { nom: string; jeton: string; classe: string; texte: string; sombre?: boolean };

function Nuancier({ nom, jeton, classe, texte, sombre = false, sens = false }: Nuance & { sens?: boolean }) {
  const valeur = useJeton(jeton);
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn("flex items-end rounded-[20px] p-3 text-legende font-black", sens ? "h-[120px]" : "h-24", classe, sombre || sens ? "text-white" : "text-ink")}
        style={{ backgroundImage: sens ? "var(--gloss)" : undefined, boxShadow: sens ? undefined : "inset 0 0 0 1px rgba(17,17,20,0.08)" }}
      >
        {valeur.toUpperCase() || "…"}
      </div>
      <div>
        <div className="text-accent font-black">{nom}</div>
        <div className="text-legende font-bold leading-[1.4] text-soft">{texte}</div>
        <code className="text-micro font-extrabold text-grey">{jeton}</code>
      </div>
    </div>
  );
}

const PAPIER_ET_ENCRE: Nuance[] = [
  { nom: "Papier", jeton: "--color-paper", classe: "bg-paper", texte: "Le fond de tous les écrans, avec une lumière blanche en haut." },
  { nom: "Blanc", jeton: "--color-white", classe: "bg-white", texte: "Les cartes, les options, les bulles de saisie." },
  { nom: "Plaque", jeton: "--color-plaque", classe: "bg-plaque", texte: "Les zones secondaires\u00a0: astuces, ajouts." },
  { nom: "Ligne", jeton: "--color-line", classe: "bg-line", texte: "Les bords et les séparateurs." },
  { nom: "Encre", jeton: "--color-ink", classe: "bg-ink", texte: "Le texte et le bouton principal.", sombre: true },
  { nom: "Doux", jeton: "--color-soft", classe: "bg-soft", texte: "Le texte secondaire.", sombre: true },
  { nom: "Gris", jeton: "--color-grey", classe: "bg-grey", texte: "Les légendes, en 13 px gras minimum (4,96:1 sur le papier).", sombre: true },
  { nom: "Gris doux", jeton: "--color-muted", classe: "bg-muted", texte: "Des icônes, des points, des chevrons. Jamais un texte.", sombre: true },
  { nom: "Gris pâle", jeton: "--color-pale", classe: "bg-pale", texte: "Un glyphe en retrait\u00a0: un chevron, un cadenas à venir." },
];

const SENS: Nuance[] = [
  { nom: "Toi", jeton: "--color-toi", classe: "bg-toi", texte: "Tes messages, tes scores." },
  { nom: "Elle", jeton: "--color-elle", classe: "bg-elle", texte: "Ses messages, ses scores." },
  { nom: "La vérité", jeton: "--color-vrai", classe: "bg-vrai", texte: "Ce que dit votre conv, ce qui est sûr, ce qui est fait." },
  { nom: "Le flou", jeton: "--color-flou", classe: "bg-flou", texte: "Ce qui reste à vérifier." },
  { nom: "L’attente", jeton: "--color-attente", classe: "bg-attente", texte: "Ce qui est probable, ce qui se joue encore." },
];

const ENCRES: Nuance[] = [
  { nom: "Toi, en texte", jeton: "--color-toi-ink", classe: "bg-toi-ink", texte: "Un mot en bleu, ta bulle.", sombre: true },
  { nom: "Elle, en texte", jeton: "--color-elle-ink", classe: "bg-elle-ink", texte: "Un mot en rose, «\u00a0Risqué\u00a0».", sombre: true },
  { nom: "La vérité, en texte", jeton: "--color-vrai-ink", classe: "bg-vrai-ink", texte: "«\u00a0Sûr\u00a0», un niveau franchi.", sombre: true },
  { nom: "L’attente, en texte", jeton: "--color-attente-ink", classe: "bg-attente-ink", texte: "«\u00a0Probable\u00a0».", sombre: true },
  { nom: "Le flou, en texte", jeton: "--color-flou-ink", classe: "bg-flou-ink", texte: "«\u00a0À vérifier\u00a0».", sombre: true },
];

const ETATS: Nuance[] = [
  { nom: "Souci", jeton: "--color-danger", classe: "bg-danger", texte: "Le seul rouge des soucis\u00a0: un message d’erreur, un champ refusé, effacer.", sombre: true },
  { nom: "C’est fait", jeton: "--color-ok", classe: "bg-ok", texte: "La pastille verte d’une étape faite.", sombre: true },
  { nom: "Désactivé", jeton: "--color-disabled", classe: "bg-disabled", texte: "Le bouton principal grisé." },
  { nom: "Piste", jeton: "--color-track", classe: "bg-track", texte: "Les points de progression à venir." },
  { nom: "Filet", jeton: "--color-sep", classe: "bg-sep", texte: "Un séparateur doux." },
  { nom: "Squelette", jeton: "--color-skeleton", classe: "bg-skeleton", texte: "Les lignes floutées d’un chapitre verrouillé." },
  { nom: "Segment", jeton: "--color-segment", classe: "bg-segment", texte: "Le fond du choix à deux options." },
  { nom: "Sa bulle", jeton: "--color-bubble-her", classe: "bg-bubble-her", texte: "Ses messages, dans une conv." },
  { nom: "Ta bulle", jeton: "--color-bubble-me", classe: "bg-bubble-me", texte: "Tes messages, dans une conv.", sombre: true },
];

/** Les dégradés de :root, peints par leur variable. */
const DEGRADES = [
  { nom: "Rose BLUSH", jeton: "--rose-blush", texte: "La couleur du logo\u00a0: la bulle rose en volume." },
  { nom: "Lecture", jeton: "--degrade-lecture", texte: "La barre de l’écriture et de la lecture." },
  { nom: "Perle", jeton: "--degrade-perle", texte: "La troisième perle des points de BLUSH." },
  { nom: "Papier éclairé", jeton: "--paper-light", texte: "Le fond des pages, la lumière en haut." },
  { nom: "Bouton encre", jeton: "--btn-ink-bg", texte: "Le relief du bouton principal." },
];

/**
 * L’échelle du texte (--text-*, globals.css), de la plus grande à la plus petite. Un nom dit une taille, pas un rôle : l’usage
 * est celui qu’on voit le plus, et un titre de 52 px prend text-chiffre comme un score.
 */
const ECHELLE = [
  { nom: "Affiche", jeton: "--text-affiche", classe: "text-affiche", poids: 900, usage: "Titres de pages, couverture", exemple: "Vous êtes à deux doigts." },
  { nom: "Chiffre", jeton: "--text-chiffre", classe: "text-chiffre", poids: 900, usage: "Scores, compteurs, titres de l’accueil sur grand écran", exemple: "1 202 · 4 / 7" },
  { nom: "Titre 1", jeton: "--text-titre-1", classe: "text-titre-1", poids: 900, usage: "Question, verdict", exemple: "Qui tient le plus à l’autre\u00a0?" },
  { nom: "Titre 2", jeton: "--text-titre-2", classe: "text-titre-2", poids: 900, usage: "Titre d’écran", exemple: "Ajoute votre conv, comme tu veux." },
  { nom: "Titre 3", jeton: "--text-titre-3", classe: "text-titre-3", poids: 900, usage: "Chapitres du rapport", exemple: "Le moment où tout a basculé" },
  { nom: "Carte", jeton: "--text-carte", classe: "text-carte", poids: 900, usage: "Options, cartes, grand bouton", exemple: "Des captures" },
  { nom: "Accent", jeton: "--text-accent", classe: "text-accent", poids: 800, usage: "Un champ, un sous-titre", exemple: "Ton email" },
  { nom: "Corps", jeton: "--text-corps", classe: "text-corps", poids: 800, usage: "Texte courant", exemple: "Ce qu’elle ressent, et ce que ta réponse peut changer." },
  { nom: "Détail", jeton: "--text-detail", classe: "text-detail", poids: 800, usage: "Une carte, une bulle de message", exemple: "Répond le soir · peu d’emojis" },
  { nom: "Note", jeton: "--text-note", classe: "text-note", poids: 800, usage: "Un souci, une note", exemple: "Vérifie ta connexion et réessaie." },
  { nom: "Légende", jeton: "--text-legende", classe: "text-legende", poids: 900, usage: "Repères, étiquettes", exemple: "Chapitre 3 · sa façon d’écrire" },
  { nom: "Micro", jeton: "--text-micro", classe: "text-micro", poids: 900, usage: "Pastilles, petites étiquettes", exemple: "Aperçu gratuit" },
];

function Degrade({ nom, jeton, texte }: { nom: string; jeton: string; texte: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="h-[120px] rounded-[20px]" style={{ background: `var(${jeton})` }} />
      <div>
        <div className="text-accent font-black">{nom}</div>
        <div className="text-legende font-bold leading-[1.4] text-soft">{texte}</div>
        <code className="text-micro font-extrabold text-grey">{jeton}</code>
      </div>
    </div>
  );
}

function Taille({ nom, jeton, classe, poids, usage, exemple }: (typeof ECHELLE)[number]) {
  const valeur = useJeton(jeton);
  return (
    <div className="flex flex-col gap-2 border-b border-line py-5 md:flex-row md:items-center md:gap-0">
      <div className="w-[252px] shrink-0">
        <div className="text-detail font-black">{nom}</div>
        <div className="text-legende font-extrabold text-grey">
          {valeur || "…"} · {poids} · <code>{classe}</code>
        </div>
        <div className="text-legende font-bold text-soft">{usage}</div>
      </div>
      <div className={cn("min-w-0 break-words leading-[1.1]", classe)} style={{ fontWeight: poids, letterSpacing: poids === 900 ? "-0.02em" : undefined }}>
        {exemple}
      </div>
    </div>
  );
}

/** Une brique archivée : son nom, ce qu’elle était, la date de sa revue. */
function Archivee({ nom, texte, children }: { nom: string; texte: string; children: ReactNode }) {
  return (
    <div className="flex w-[380px] max-w-full flex-col gap-2.5">
      <div className="flex min-h-[120px] items-center justify-center rounded-card bg-plaque p-4 shadow-thin">{children}</div>
      <div className="text-accent font-black">{nom}</div>
      <div className="text-legende font-bold leading-[1.4] text-soft">{texte}</div>
      <div className="text-micro font-extrabold text-grey">
        Archivée le {ARCHIVAGE.le} · revue le {ARCHIVAGE.revue}
      </div>
    </div>
  );
}

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
  const [envoi, setEnvoi] = useState(false);

  return (
    <main className={`mx-auto flex max-w-[1280px] flex-col gap-14 px-4 py-10 md:px-[72px] md:py-16 ${figtree.variable}`}>
      {/* En-tête */}
      <header className="flex flex-wrap items-start justify-between gap-8">
        <div className="max-w-[760px]">
          <div className="flex items-center gap-2.5 text-note font-black tracking-[0.06em] text-grey">
            <BubbleLogo size={22} />
            BLUSH · DESIGN SYSTEM
          </div>
          <h1 className="m-0 mt-3.5 text-[44px] font-black leading-[1.02] tracking-[-0.03em] md:text-affiche">Les briques de BLUSH</h1>
          <p className="m-0 mt-2.5 text-[19px] font-bold leading-[1.5] text-soft">
            L’interface de BLUSH{NBSP}: un papier chaud, une typo ronde, des boutons qu’on a envie d’appuyer, et trois couleurs qui disent qui parle et ce qui est vrai. Tout ce que
            montre cette planche vient de l’appli{NBSP}: ses tokens et ses composants.
          </p>
        </div>
        <div data-float="" style={{ "--r": "-6deg" }}>
          <BubbleLogo size={200} />
        </div>
      </header>

      {/* 01 Couleurs */}
      <Section
        title="Couleurs"
        sub={
          "Le fond reste neutre. La couleur n’est jamais décorative\u00a0: elle dit qui parle (toi, elle) ou ce qui est vrai. Chaque pastille est peinte par son token, et sa valeur est celle que le navigateur calcule."
        }
      >
        <h3 className="m-0 text-carte font-black">Le papier et l’encre</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {PAPIER_ET_ENCRE.map((n) => (
            <Nuancier key={n.jeton} {...n} />
          ))}
        </div>
        <h3 className="m-0 text-carte font-black">Les couleurs de sens</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SENS.map((n) => (
            <Nuancier key={n.jeton} {...n} sens />
          ))}
        </div>
        <h3 className="m-0 text-carte font-black">Leurs encres</h3>
        <p className="m-0 -mt-3 text-legende font-extrabold text-grey">Les mêmes teintes, assez foncées pour un texte (au moins 4,5:1) ou sous un texte blanc.</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {ENCRES.map((n) => (
            <Nuancier key={n.jeton} {...n} />
          ))}
        </div>
        <h3 className="m-0 text-carte font-black">Les états et les surfaces</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {ETATS.map((n) => (
            <Nuancier key={n.jeton} {...n} />
          ))}
        </div>
        <h3 className="m-0 text-carte font-black">Les dégradés</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {DEGRADES.map((d) => (
            <Degrade key={d.jeton} {...d} />
          ))}
        </div>
      </Section>

      {/* 02 Typographie */}
      <Section
        title="Typographie"
        sub="Nunito partout dans l’interface. Figtree seulement pour les vrais messages. Chaque taille est un token (text-legende, text-corps…), pas un nombre écrit à la main."
      >
        <div className="flex flex-col">
          {ECHELLE.map((t) => (
            <Taille key={t.jeton} {...t} />
          ))}
          <div className="flex flex-col gap-2 border-b border-line py-5 md:flex-row md:items-center">
            <div className="w-[252px] shrink-0">
              <div className="text-detail font-black">Message</div>
              <div className="text-legende font-extrabold text-grey">15 px · 700 · Figtree</div>
              <div className="text-legende font-bold text-soft">Bulles de messages</div>
            </div>
            <div className="font-message text-detail font-bold">au fait on est quoi toi et moi mdr</div>
          </div>
        </div>
        <Row gap={12}>
          <Chip>Nunito partout dans l’interface</Chip>
          <Chip>Figtree seulement pour les vrais messages</Chip>
          <Chip>Titres en 900, texte en 800</Chip>
          <Chip>
            Espaces insécables avant{NBSP}?{NBSP}!{NBSP}:{NBSP}»
          </Chip>
        </Row>
      </Section>

      {/* 03 Boutons et contrôles */}
      <Section title="Le bouton principal" sub="Un seul par écran.">
        <Row>
          <Spec label="PRINCIPAL" width={320}>
            <Button arrow>Lancer la lecture</Button>
          </Spec>
          <Spec label="APPUYÉ" width={320} note="Il s’enfonce d’1 px et son ombre se resserre.">
            <Button arrow className="translate-y-px [box-shadow:var(--shadow-ink-pressed)]">
              Lancer la lecture
            </Button>
          </Spec>
          <Spec label="DÉSACTIVÉ" width={320}>
            <Button disabled>Continuer</Button>
          </Spec>
          <Spec label="EN ROUTE" width={320} note={"Touche-le\u00a0: l’action part, les trois points prennent la place du texte, un nouveau toucher ne fait rien."}>
            <Button arrow loading={envoi} loadingLabel="Envoi du code" onClick={() => setEnvoi(true)}>
              Recevoir mon code
            </Button>
          </Spec>
        </Row>
      </Section>

      <Section title="Les autres actions">
        <Row>
          <Spec label="SECONDAIRE" width={320}>
            <Button variant="secondary">Ajouter des captures</Button>
          </Spec>
          <Spec label="PLUS BAS" width={320} note={"size md\u00a0: 52 px, dans une carte ou une rangée de deux."}>
            <Button variant="secondary" size="md">
              Plus tard
            </Button>
          </Spec>
          <Spec label="LIEN" width={320}>
            <Button variant="link">Écrire la mienne</Button>
          </Spec>
          <Spec label="ICÔNES 44 × 44">
            <div className="flex gap-3">
              <IconButton icon="back" label="Retour" />
              <IconButton icon="close" label="Fermer" iconSize={20} variant="doux" />
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
                { v: "parle", l: "On se parle" },
                { v: "vus", l: "On s’est vus" },
                { v: "flou", l: "C’est flou" },
              ].map(({ v, l }) => (
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
              <AppTile app="autre" title="Captures ou vidéo" subtitle="Hinge, Tinder… toutes les applis" href="#" />
            </div>
          </Spec>
          <Spec label="TUILE DE CHOIX" width={360}>
            <RadioGroup label="Exemple" className="flex gap-2.5">
              <ChoiceTile icon="imessage" tone="toi" label="On se parle" selected={tile === "parle"} onClick={() => setTile("parle")} />
              <ChoiceTile icon="people" tone="vrai" label="On s’est vus" selected={tile === "vus"} onClick={() => setTile("vus")} />
              <ChoiceTile icon="cloud" tone="flou" label="C’est flou" selected={tile === "flou"} onClick={() => setTile("flou")} />
            </RadioGroup>
          </Spec>
        </Row>
      </Section>

      {/* 04 Composants */}
      <Section title="Cartes">
        <Row gap={24}>
          <Spec label="CARTE" width={300}>
            <Card className="flex flex-col gap-1.5 px-4 py-3.5">
              <Legende>Sa façon d’écrire</Legende>
              <div className="text-detail font-extrabold leading-[1.45]">Répond le soir · peu d’emojis</div>
            </Card>
          </Spec>
          <Spec label="PLAQUE" width={300}>
            <Card variant="plaque" className="flex flex-col gap-2 px-4 py-3.5">
              <Legende>Ajoute ce que tu vois</Legende>
              <div className="flex flex-wrap gap-2">
                <Chip>+ capture de sa bio</Chip>
              </div>
            </Card>
          </Spec>
          <Spec label="CARTE FORTE" width={300}>
            <Card variant="strong" className="flex flex-col gap-1.5 p-4">
              <Legende>Votre duo</Legende>
              <div className="text-carte font-black leading-[1.45]">Le Stratège & la Relanceuse</div>
            </Card>
          </Spec>
          <Spec label="À TOI DE JOUER" width={300}>
            <PlayCard>Quand tu proposes, donne une date et une heure.</PlayCard>
          </Spec>
        </Row>
      </Section>

      <Section
        title="La liste"
        sub={
          "Comme les Réglages de l’iPhone\u00a0: un titre discret, une carte blanche, des lignes séparées par un filet. «\u00a0Mon compte\u00a0», le contact de l’accueil, tes convs."
        }
      >
        <Row gap={24}>
          <Spec label="LIGNES" width={380} note="Une pastille teintée en tête, un chevron pour un lien, le rouge pour une action qui efface.">
            <InsetGroup title="Ton histoire" footer="Effacer ne se rattrape pas.">
              <InsetRow leading={<RowIcon icon="list" tone="toi" />} title="Le rapport" sub="7 chapitres" href="#" chevron />
              <InsetRow leading={<RowIcon icon="heart" tone="elle" />} title="Sa fiche" sub="Ce que BLUSH sait d’elle" href="#" chevron />
              <InsetRow leading={<RowIcon icon="check" tone="vrai" />} title="Premium" sub="Actif" />
              <InsetRow leading={<RowIcon icon="mail" tone="grey" />} title="Ton email" sub="lea@exemple.fr" />
              <InsetRow
                leading={<RowIcon icon="trash" tone="danger" />}
                title="Supprimer l’histoire"
                sub="Le rapport, la fiche et les captures"
                onClick={() => setSheet(true)}
                danger
              />
            </InsetGroup>
          </Spec>
          <Spec label="LIGNES COMPACTES" width={380} note={"Dans une feuille\u00a0: le titre à 15 px, le sous-titre sur une ligne."}>
            <InsetGroup>
              <InsetRow variant="compact" leading={<RowIcon icon="user" tone="ink" />} title="Sophie" sub="On se parle · depuis mars" href="#" chevron />
              <InsetRow variant="compact" leading={<RowIcon icon="photo" tone="grey" />} title="Ajouter des captures" sub="" href="#" chevron />
            </InsetGroup>
          </Spec>
        </Row>
      </Section>

      <Section
        title="La coque"
        sub={"Ce qui entoure chaque écran\u00a0: la barre du haut sur mobile, le retour et les étapes du parcours sur ordinateur, le contact en tête de l’accueil."}
      >
        <Row gap={24}>
          <Spec label="BARRE DU HAUT (MOBILE)" width={380} note="Retour, titre, progression du parcours.">
            <Card className="overflow-hidden">
              <MobileTopBar back="/styleguide" title="Qui est qui" progress={2} className="!flex" />
            </Card>
          </Spec>
          <Spec label="RETOUR (ORDINATEUR)" width={200}>
            <LienRetourDesktop target="/styleguide" />
          </Spec>
          <Spec label="ÉTAPES DU PARCOURS" width={340} note="La colonne d’appoint du parcours, sur ordinateur.">
            <FlowSteps step={2} />
          </Spec>
          <Spec label="LE CONTACT" note={"L’anneau du niveau et le verdict en badge\u00a0; vide tant que BLUSH lit la conv."}>
            <div className="flex items-center gap-4">
              <ContactRing initial="S" level="dit" emoji="🔥" />
              <ContactRing initial="M" level={null} emoji={null} />
            </div>
          </Spec>
        </Row>
      </Section>

      <Section title="L’attente et les retours" sub={"Ce que l’écran répond à un geste\u00a0: BLUSH qui travaille, un souci, une étape faite."}>
        <Row gap={24}>
          <Spec label="LES TROIS POINTS" note="Gris doux par défaut, la couleur du texte autour sinon.">
            <div className="flex items-center gap-6">
              <TypingDots label="Exemple" />
              <span className="text-toi-ink">
                <TypingDots color="currentColor" size={8} />
              </span>
            </div>
          </Spec>
          <Spec label="BLUSH ÉCRIT" width={260}>
            <div className="flex flex-col gap-3">
              <BlushTyping label="BLUSH écrit" />
              <BlushTyping label="BLUSH enregistre un vocal" vocal />
            </div>
          </Spec>
          <Spec label="UN SOUCI" width={380} note="Annoncé tout de suite aux lecteurs d’écran. Trois habillages, un seul rouge.">
            <div className="flex flex-col gap-3">
              <Alert>Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.</Alert>
              <Alert variant="carte">BLUSH n’a pas pu lire ces captures.</Alert>
              <Alert variant="voile">L’image n’a pas pu être préparée. Réessaie dans un instant.</Alert>
            </div>
          </Spec>
          <Spec label="C’EST FAIT">
            <div className="flex items-center gap-3">
              <DoneCheck size={26} />
              <DoneCheck size={40} />
              <DoneCheck size={48} label="prêt" />
            </div>
          </Spec>
          <Spec label="NOTES" width={340}>
            <div className="flex flex-col gap-2.5">
              <NoteIcone icone="shield" className="text-legende">
                Son prénom devient une initiale, le tien reste.
              </NoteIcone>
              <NotePrivee>Ta conv reste privée. Tu peux tout effacer.</NotePrivee>
            </div>
          </Spec>
          <Spec label="TOAST" width={380}>
            <Button variant="secondary" onClick={() => setToast((t) => !t)}>
              {toast ? "Masquer le toast" : "Afficher le toast"}
            </Button>
            {toast && <Toast>Lien copié.</Toast>}
          </Spec>
        </Row>
      </Section>

      <Section title="Messages" sub="Chaque affirmation de BLUSH s’appuie sur un vrai message, daté.">
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
          <Spec label="CE QU’ON VOIT" width={380} note="Les faits, puis les messages qui les prouvent (un bloc du rapport).">
            <Block
              block={{
                kind: "seen",
                facts: ["Vous relancez autant l’un que l’autre."],
                messages: [{ from: "elle", text: "tu fais quoi samedi\u00a0?", caption: "4 min après toi" }],
              }}
            />
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
          <Tag tone="apercu" />
          <Tag tone="actif" />
          <Tag tone="ink">Premium</Tag>
        </div>
      </Section>

      <Section title="Données et progression">
        <Row gap={24}>
          <Spec label="BARRE DE SCORE" width={360}>
            <ScoreCard rows={[{ label: "Qui propose des plans", winner: "elle", toiPercent: 20, captionLeft: "toi\u00a0: 1", captionRight: "elle\u00a0: 4" }]} />
          </Spec>
          <Spec label="NIVEAUX" width={380} note="Le niveau en cours pulse doucement.">
            <Card className="px-3 py-[18px]">
              <LevelPath current="dit" />
            </Card>
          </Spec>
          <Spec label="NIVEAUX, COMPACTS" width={380} note="Dans une feuille (le contact de l’accueil).">
            <Card className="px-3 py-[18px]">
              <LevelPath current="dit" variant="compact" />
            </Card>
          </Spec>
          <Spec label="TEMPÉRATURE (EN COUPLE)" width={380} note={"Pas d’étape à franchir\u00a0: juste où vous êtes, du plus froid au plus chaud."}>
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
        <Spec
          label="UN CHAPITRE DU RAPPORT"
          width={420}
          note={"Toujours le même gabarit\u00a0: l’essentiel, ce qu’on voit, ce que ça veut dire, à toi de jouer. Les blocs sont ceux du rapport (Block)."}
        >
          <div className="flex flex-col gap-3">
            <ChapterHeader number={5} kicker={"son portrait\u00a0: la Relanceuse"} title="Elle" />
            <Block block={{ kind: "essential", text: "Elle montre son intérêt en agissant\u00a0: elle propose, elle relance, elle se livre." }} />
            <Block
              block={{
                kind: "seen",
                facts: ["Relance après 22 h, 7 fois sur 10."],
                messages: [{ from: "elle", text: "dimanche y’a un marché de noël à côté du libanais 👀", caption: "8 févr." }],
              }}
            />
            <Block block={{ kind: "meaning", text: "Elle t’attend sur les plans précis." }} />
            <Block block={{ kind: "play", text: "Donne une date et une heure." }} />
          </div>
        </Spec>
      </Section>

      <Section title="Saisie et surfaces">
        <Row gap={24}>
          <Spec label="EMAIL" width={360}>
            <EmailField
              value={email}
              onChange={setEmail}
              onBlur={() => setTouched(true)}
              invalid={touched && !!email && !emailValide(email)}
              errorText={"Vérifie ton email\u00a0: il manque quelque chose."}
            />
          </Spec>
          <Spec label="PANNEAU" width={320} note="Panneau du bas sur mobile, fenêtre centrée sur desktop.">
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Ouvrir le panneau
            </Button>
          </Spec>
        </Row>
      </Section>

      {/* 05 Logo */}
      <Section title="Le logo" sub={"La bulle rose, avec «\u00a0blush\u00a0» en encre sur fond clair, en blanc sur fond encre."}>
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
              <span className="text-legende font-extrabold text-grey">{s} px</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <Logo size={64} fontSize={40} animated />
            <span className="text-legende font-extrabold text-grey">En mouvement · boucle de 1,3 s</span>
          </div>
        </Row>
      </Section>

      {/* 06 Objets 3D */}
      <Section title="Objets 3D et logo" sub="Le logo est la bulle rose. En plus du logo, un seul objet en volume par écran, pour marquer un moment. Jamais en mode sobre.">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {[
            {
              name: "La bulle",
              text: "Le logo de BLUSH, en volume. Le troisième point est en opale.",
              node: (
                <div data-float="" style={{ "--r": "-6deg" }}>
                  <BubbleLogo size={140} />
                </div>
              ),
            },
            {
              name: "La cloche",
              text: "Une notification, sur la landing.",
              node: (
                <div data-float="">
                  <Bell3D size={110} />
                </div>
              ),
            },
            {
              name: "La gerbe",
              text: "Une réussite\u00a0: la lecture finie, l’accès débloqué.",
              node: (
                <div className="scale-75 md:scale-100">
                  <CheckBurst />
                </div>
              ),
            },
          ].map((o) => (
            <div key={o.name} className="flex flex-col items-center gap-3.5 text-center">
              <div className="flex h-[170px] items-center justify-center">{o.node}</div>
              <div className="text-carte font-black">{o.name}</div>
              <div className="text-legende font-bold leading-[1.4] text-soft">{o.text}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[22px] font-black">Les emojis autorisés</h3>
          <p className="m-0 text-detail font-extrabold text-grey">Seulement ceux-là, toujours avec le même sens.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { e: "🤏", l: "Le verdict «\u00a0à deux doigts\u00a0»" },
            { e: "🔥", l: "Elle est partante" },
            { e: "🤔", l: "Elle hésite" },
            { e: "🧊", l: "Elle s’éloigne" },
            { e: "🏆", l: "Les trophées" },
          ].map(({ e, l }) => (
            <div key={l} className="flex items-center gap-2.5 rounded-[20px] bg-white px-4 py-3 shadow-card">
              <span className="text-[32px] leading-none" aria-hidden="true">
                {e}
              </span>
              <span className="text-note font-extrabold">{l}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 07 Mode sobre */}
      <Section
        title="Mode sobre"
        sub="Seulement quand il y a une alerte (danger, détresse, mineur). Même structure, mais tout ce qui amuse disparaît. Un «\u00a0non\u00a0», un ghosting, une rupture ne sont pas des alertes\u00a0: ils ont le rapport complet."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "Pas de couleur de sens", d: "Ni bleu, ni rose, ni vert. Encre et papier seulement." },
            { t: "Pas d’objet 3D", d: "Pas d’objet en volume, ni emoji, ni logo en volume." },
            { t: "Rien de ludique", d: "Pas de score, pas de niveau, pas de partage." },
            { t: "Une sortie visible", d: "Le bouton «\u00a0Quitter vite\u00a0» reste en haut à droite." },
            { t: "Une aide proposée", d: "«\u00a0Besoin d’en parler à quelqu’un\u00a0?\u00a0» mène vers des ressources." },
            { t: "Des mots doux et vrais", d: "«\u00a0Ça ne dit rien de ce que tu vaux.\u00a0»" },
          ].map(({ t, d }) => (
            <Card key={t} className="flex flex-col gap-1.5 px-[18px] py-4">
              <Legende>{t}</Legende>
              <div className="text-detail font-extrabold leading-[1.45]">{d}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* 08 Règles */}
      <Section title="Les règles d’or">
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {[
            { t: "Un seul bouton noir par écran", d: "C’est l’action principale. Le reste est blanc et s’efface." },
            { t: "Bleu toi, rose elle, vert la vérité", d: "Toujours le même sens, partout." },
            { t: "La vérité, puis un sourire", d: "BLUSH dit ce que la conv montre, sans faux espoir, puis une vanne en ta faveur. Jamais contre toi." },
            { t: "Chaque affirmation a sa preuve", d: "Un vrai message, daté, dans une bulle." },
            { t: "La confiance est affichée", d: "Sûr, probable, à vérifier. BLUSH dit ce qu’il ne peut pas savoir." },
            { t: "Toujours un prochain pas", d: "Chaque écran finit sur une action concrète." },
            { t: "Un objet 3D au maximum, en plus du logo", d: "Pour marquer un moment, jamais pour décorer." },
            { t: "Le mode sobre, seulement pour une alerte", d: "Danger, détresse, mineur. Un «\u00a0non\u00a0» reçoit le rapport complet, dit avec tact." },
            { t: "Une couleur, un token", d: "Jamais un code couleur écrit à la main dans un écran\u00a0: il vient de globals.css." },
          ].map(({ t, d }, i) => (
            <li key={t} className="flex items-start gap-4 rounded-card bg-white px-5 py-5 shadow-card">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[19px] bg-ink text-detail font-black text-white shadow-ink">{i + 1}</span>
              <div>
                <div className="text-carte font-black">{t}</div>
                <div className="text-note font-bold leading-[1.45] text-soft">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* 09 Archives */}
      <Section
        title="Archives"
        sub={`Des briques qu’aucun écran n’utilise plus (src/app/styleguide/archive.tsx). Elles restent visibles jusqu’à leur revue, le ${ARCHIVAGE.revue}\u00a0: réutilisées dans un écran, ou supprimées.`}
      >
        <Row gap={24}>
          <Archivee nom="Le cadenas" texte="La suite payante du rapport, en volume. Remplacé par le cadenas plat des chapitres verrouillés.">
            <div data-float="">
              <Lock3D size={110} />
            </div>
          </Archivee>
          <Archivee nom="Les billes" texte="Les trois points du logo, en volume, nacre et opale.">
            <Marbles />
          </Archivee>
          <Archivee nom="La carte de choix" texte="Export complet ou captures, avant les tuiles d’applis du parcours.">
            <ChoiceCard
              app="instagram"
              title="Des captures"
              badge="Le plus rapide"
              badgeTone="toi"
              subtitle="Insta, Hinge…"
              selected={card === "captures"}
              onClick={() => setCard(card === "captures" ? "export" : "captures")}
            />
          </Archivee>
          <Archivee nom="Ton pari" texte="L’étiquette d’un pari raté, du temps où BLUSH faisait deviner.">
            <PariTag />
          </Archivee>
          <Archivee nom="La preuve" texte={"Un vrai message daté dans une carte. Le rapport montre ses preuves dans «\u00a0Ce qu’on voit\u00a0»."}>
            <div className="w-full">
              <ProofCard conclusion="Vous relancez autant l’un que l’autre.">
                <Bubble from="elle" caption="Elle relance · 4 min après toi">
                  tu fais quoi samedi{NBSP}?
                </Bubble>
              </ProofCard>
            </div>
          </Archivee>
          <Archivee nom="Les étapes" texte="Une liste numérotée dans une carte, pour les étapes d’un export.">
            <div className="w-full">
              <StepList steps={["Ouvre votre conv", "Exporter la discussion, sans médias"]} />
            </div>
          </Archivee>
          <Archivee nom="La légende de carte" texte="Une petite légende grise, au-dessus du texte d’une carte.">
            <CardLabel>Sa façon d’écrire</CardLabel>
          </Archivee>
        </Row>
      </Section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Un panneau, deux formes." titleSize={26}>
        <p className="m-0 text-note font-bold leading-[1.45] text-soft">En bas de l’écran sur mobile, centré sur desktop. Échap ou un tap à côté pour fermer.</p>
        <Button onClick={() => setSheet(false)}>Fermer</Button>
      </Sheet>
    </main>
  );
}
