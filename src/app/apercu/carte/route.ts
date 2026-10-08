import { carteVerdict } from "@/server/carte-verdict";

export const dynamic = "force-dynamic";

const EXEMPLES = {
  court: { emoji: "🤏", title: "Vous êtes à deux doigts.", subtitle: "Elle a posé la question, t’as esquivé." },
  moyen: { emoji: "🔥", title: "Vous êtes un couple, sans le nom.", subtitle: "Elle veut que tu dormes chez elle tous les jours. Il manque juste le mot." },
  long: { emoji: "🤔", title: "Elle teste si tu restes quand ça devient compliqué, et toi tu fuis dès que ça chauffe.", subtitle: "Trois relances en une semaine, zéro réponse claire. Ça mérite une vraie conversation." },
  froid: { emoji: "🧊", title: "Elle a déjà tourné la page.", subtitle: "Ses réponses raccourcissent depuis le 3 mars." },
} as const;

/** En local seulement : l’image d’un verdict partagé. `?cas=court|moyen|long|froid&format=carte|story`. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const p = new URL(req.url).searchParams;
  const v = EXEMPLES[(p.get("cas") ?? "court") as keyof typeof EXEMPLES] ?? EXEMPLES.court;
  return carteVerdict(v, p.get("format") === "story" ? "story" : "carte");
}
