/*
 * Le CAPTCHA (Cloudflare Turnstile), dans le navigateur : le script de Cloudflare, chargé seulement par les écrans qui
 * montent le widget (src/components/ui/Captcha.tsx : la demande de code, l’export et les captures), et le jeton qu’il
 * rend, pris par l’appel qui en a besoin (jetonCaptcha, src/services/api.ts). Un jeton ne sert qu’une fois : le widget en
 * tire un neuf dès qu’on a pris le sien. Sans clé publique (src/lib/publique.ts), rien ne se charge et il n’y a rien à
 * prouver. La vérification : src/server/captcha.ts.
 */
import { ACTIONS_CAPTCHA, SCRIPT_TURNSTILE, type ActionCaptcha } from "@/lib/captcha";
import { cleDuSiteCaptcha } from "@/lib/publique";
import { tracer } from "@/lib/tracer";

/** Ce qu’on utilise de l’objet `turnstile` du script de Cloudflare. */
type Turnstile = {
  render: (conteneur: HTMLElement, options: Record<string, unknown>) => string | null | undefined;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let chargement: Promise<Turnstile | null> | null = null;
/**
 * Le dernier chargement du script a échoué (une extension, un réseau d’entreprise) : aucun jeton ne viendra. Un appel qui
 * en voudrait un ne l’attend pas 20 secondes pour rien : un compte connecté importe tout de suite (le serveur ne lui demande
 * rien), un visiteur sans compte lit tout de suite le message « captcha ».
 */
let scriptBloque = false;

/** Charge le script de Cloudflare une fois (null : il n’a pas pu venir, une extension qui le bloque, le réseau). */
function chargerTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  chargement ??= new Promise((resoudre) => {
    scriptBloque = false;
    const script = document.createElement("script");
    script.src = SCRIPT_TURNSTILE;
    script.async = true;
    script.onload = () => resoudre(window.turnstile ?? null);
    script.onerror = () => {
      /* Le prochain écran réessaiera */
      script.remove();
      chargement = null;
      scriptBloque = true;
      tracer("captcha:script");
      /* Ceux qui attendaient un jeton n’en auront pas */
      for (const attendre of attentes) attendre(null);
      attentes.clear();
      resoudre(null);
    };
    document.head.appendChild(script);
  });
  return chargement;
}

/* ———— Le widget de l’écran, et son jeton ———— */

/** Le widget monté (un seul à la fois : un par écran), et le jeton qu’il a rendu, pas encore pris. */
let monte: { id: string; turnstile: Turnstile; jeton: string | null } | null = null;
/** Les appels qui attendent un jeton. */
const attentes = new Set<(jeton: string | null) => void>();

/* Un jeton rendu par le widget : au premier qui l’attend, sinon gardé pour le prochain */
function recu(jeton: string): void {
  if (!monte) return;
  const [suivant] = attentes;
  if (!suivant) {
    monte.jeton = jeton;
    return;
  }
  attentes.delete(suivant);
  prendre(jeton);
  suivant(jeton);
}

/* Le jeton est pris : le widget en tire un neuf pour la prochaine fois */
function prendre(jeton: string): string {
  if (monte) {
    monte.jeton = null;
    monte.turnstile.reset(monte.id);
  }
  return jeton;
}

/**
 * Monte le widget dans `conteneur` (géré : invisible le plus souvent, il ne se montre que s’il demande un geste ;
 * `interaction` le dit à l’écran, pour lui faire une place). Rend de quoi le démonter.
 */
export function monterWidget(conteneur: HTMLElement, action: ActionCaptcha, interaction: (visible: boolean) => void): () => void {
  const cle = cleDuSiteCaptcha();
  if (!cle) return () => {};
  let demonte = false;
  let id: string | null = null;
  void chargerTurnstile().then((turnstile) => {
    if (demonte || !turnstile) return;
    id =
      turnstile.render(conteneur, {
        sitekey: cle,
        action: ACTIONS_CAPTCHA[action],
        appearance: "interaction-only",
        size: "flexible",
        language: "fr",
        theme: "light",
        "refresh-expired": "auto",
        "response-field": false,
        callback: (jeton: string) => recu(jeton),
        "expired-callback": () => {
          if (monte) monte.jeton = null;
        },
        /* Le widget réessaie de lui-même ; son code d’erreur (des chiffres) dit pourquoi */
        "error-callback": (code: unknown) => {
          if (monte) monte.jeton = null;
          tracer("captcha:widget", undefined, { code: String(code) });
        },
        "before-interactive-callback": () => interaction(true),
        "after-interactive-callback": () => interaction(false),
      }) ?? null;
    if (id) monte = { id, turnstile, jeton: null };
  });
  return () => {
    demonte = true;
    if (!id) return;
    if (monte?.id === id) monte = null;
    try {
      window.turnstile?.remove(id);
    } catch (e) {
      tracer("captcha:demontage", e);
    }
  };
}

/**
 * Le jeton du widget de l’écran, à envoyer au serveur, pris (il ne sert qu’une fois). S’il n’est pas encore là (le
 * widget travaille, ou attend un geste), on l’attend au plus `delaiMs` ; null au-delà, sans clé publique, ou tout de suite
 * quand le script de Cloudflare n’a pas pu venir (scriptBloque) : le serveur dira « captcha » s’il en voulait un.
 */
export function jetonCaptcha(delaiMs = 20_000): Promise<string | null> {
  if (!cleDuSiteCaptcha()) return Promise.resolve(null);
  if (monte?.jeton) return Promise.resolve(prendre(monte.jeton));
  if (!monte && scriptBloque) return Promise.resolve(null);
  return new Promise((resoudre) => {
    const quandRecu = (jeton: string | null) => {
      clearTimeout(minuteur);
      resoudre(jeton);
    };
    const minuteur = setTimeout(() => {
      attentes.delete(quandRecu);
      resoudre(null);
    }, delaiMs);
    attentes.add(quandRecu);
  });
}
