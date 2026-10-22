import { NB_CHAPITRES } from "@/contenu/chapitres";
import type { LandingConv, QuestionAnswer, Testimonial } from "@/types";

/*
 * Landing : les convs qui défilent sous le titre, et le verdict que BLUSH montre quand on en choisit une.
 * Exemples fictifs, écrits pour la landing (textes relus le 8 octobre, voix de BLUSH), avec une photo à la place de
 * l’initiale (public/convs/, recadrées en carré de 256 px, sans leurs métadonnées). Mêmes sens d’emojis :
 * 🤏 à deux doigts · 🔥 partant·e · 🤔 hésite · 🧊 s’éloigne.
 * En couple (Mon cœur, Chéri, Julien) : 🔥 toujours le feu · 🤏 il manque un petit rien · 🤔 un truc coince · 🧊 vous vous éloignez.
 */
export const LANDING_CONVS: LandingConv[] = [
  /* ———— Rangée 1 ———— */
  {
    id: "lea",
    name: "Léa",
    label: "Ton crush",
    app: "whatsapp",
    avatar: "initial",
    photo: "/convs/lea.webp",
    verdict: { emoji: "🤏", title: "Vous êtes à deux doigts.", subtitle: "Elle te tend des perches depuis trois semaines." },
    proof: { text: "on refait un verre quand tu veux, mais cette fois c’est toi qui choisis le bar", caption: "3 mars, 22\u00a0h\u00a014" },
    confidence: "sur",
    proofs: 9,
    next: "Choisis le bar, et propose-lui un soir précis.",
  },
  {
    id: "coeur",
    name: "Mon cœur",
    label: "Ta copine",
    app: "whatsapp",
    avatar: "initial",
    photo: "/convs/moncoeur.webp",
    verdict: { emoji: "🤔", title: "Un truc coince.", subtitle: "Elle dit «\u00a0c’est pas grave\u00a0». Ses messages disent le contraire." },
    proof: { text: "c’est pas grave, vas-y avec tes potes", caption: "28 févr., 19\u00a0h\u00a041" },
    confidence: "sur",
    proofs: 11,
    next: "Propose-lui une soirée rien qu’à vous deux, avec un jour précis.",
  },
  {
    id: "theo",
    name: "Théo",
    label: "Ton match Hinge",
    app: "hinge",
    avatar: "app",
    verdict: { emoji: "🔥", title: "Il est partant.", subtitle: "Il propose de se voir, avec un jour et une heure." },
    proof: { text: "bon on arrête de se parler par écran\u00a0? jeudi 20\u00a0h, je connais un bar", caption: "12 févr., 19\u00a0h\u00a002" },
    confidence: "sur",
    proofs: 6,
    next: "Dis oui, et confirme l’heure.",
  },
  {
    id: "ines",
    name: "Inès",
    label: "Ta situationship",
    app: "imessage",
    avatar: "initial",
    photo: "/convs/ines.webp",
    verdict: { emoji: "🤔", title: "Elle hésite.", subtitle: "Elle aime ce que vous avez. Elle n’ose pas encore le nommer." },
    proof: { text: "je sais pas trop ce qu’on fait toi et moi, mais j’aime bien", caption: "28 janv., 0\u00a0h\u00a037" },
    confidence: "probable",
    proofs: 5,
    next: "Propose-lui un vrai rendez-vous, sans parler de «\u00a0nous\u00a0».",
  },
  {
    id: "nathan",
    name: "Nathan",
    label: "Vous vous parlez",
    app: "whatsapp",
    avatar: "app",
    verdict: { emoji: "🧊", title: "Il s’éloigne.", subtitle: "Ses messages raccourcissent depuis trois semaines, et il ne relance plus." },
    proof: { text: "dsl grosse semaine", caption: "19 mars, 23\u00a0h\u00a050" },
    confidence: "sur",
    proofs: 11,
    next: "Arrête de relancer. Laisse-lui la place de revenir vers toi.",
  },
  {
    id: "camille",
    name: "Camille",
    label: "Ton date de samedi",
    app: "imessage",
    avatar: "app",
    verdict: { emoji: "🔥", title: "Elle est partante.", subtitle: "Elle t’a écrit la première, dès le lendemain." },
    proof: { text: "j’ai passé une super soirée, on remet ça\u00a0?", caption: "9 mars, 11\u00a0h\u00a020" },
    confidence: "sur",
    proofs: 4,
    next: "Propose-lui le resto dont elle t’a parlé.",
  },

  /* ———— Rangée 2 ———— */
  {
    id: "sacha",
    name: "Sacha boulot",
    label: "Ton collègue",
    app: "whatsapp",
    avatar: "initial",
    photo: "/convs/sacha.webp",
    verdict: { emoji: "🤔", title: "Il hésite.", subtitle: "Il ouvre la porte, puis il la referme à moitié." },
    proof: { text: "on devrait se faire un verre un de ces quatre… enfin si t’as le temps", caption: "4 avr., 18\u00a0h\u00a031" },
    confidence: "probable",
    proofs: 3,
    next: "Dis oui, et glisse-lui que t’es libre jeudi soir. Laisse-le fixer le reste.",
  },
  {
    id: "cheri",
    name: "Chéri",
    label: "Ton copain",
    app: "imessage",
    avatar: "initial",
    photo: "/convs/cheri.webp",
    verdict: { emoji: "🔥", title: "Toujours le feu.", subtitle: "Il parle de vos projets sans que tu lui demandes." },
    proof: { text: "faut qu’on parte quelque part cet été toi et moi", caption: "9 mars, 22\u00a0h\u00a003" },
    confidence: "sur",
    proofs: 8,
    next: "Réponds avec une date et une destination.",
  },
  {
    id: "margaux",
    name: "Margaux",
    label: "Votre premier date",
    app: "instagram",
    avatar: "initial",
    photo: "/convs/margaux.webp",
    verdict: { emoji: "🧊", title: "Elle s’éloigne.", subtitle: "Elle répond poliment, deux jours après, sans poser de question." },
    proof: { text: "oui c’était sympa\u00a0!", caption: "16 févr., 13\u00a0h\u00a005" },
    confidence: "probable",
    proofs: 4,
    next: "Fais une seule proposition claire. Puis laisse-la revenir vers toi.",
  },
  {
    id: "jules",
    name: "Jules Insta",
    label: "Ton crush Insta",
    app: "instagram",
    avatar: "app",
    verdict: { emoji: "🤏", title: "Vous êtes à deux doigts.", subtitle: "Il flirte ouvertement. Il attend que l’un de vous propose un verre." },
    proof: { text: "tu me fais trop rire toi, c’est dangereux", caption: "15 mars, 21\u00a0h\u00a046" },
    confidence: "sur",
    proofs: 8,
    next: "Renvoie-lui la balle sur le même ton. Le verre, c’est à lui de le proposer.",
  },
  {
    id: "chloe",
    name: "Chloé",
    label: "La pote de ta pote",
    app: "imessage",
    avatar: "app",
    verdict: { emoji: "🔥", title: "Elle est partante.", subtitle: "Elle cherche des occasions de te voir, sans en avoir l’air." },
    proof: { text: "tu viens à l’anniv de Sarah samedi\u00a0?", caption: "21 mars, 17\u00a0h\u00a012" },
    confidence: "sur",
    proofs: 7,
    next: "Dis oui, et propose d’y aller ensemble.",
  },
  {
    id: "yanis",
    name: "Yanis",
    label: "Ton match Bumble",
    app: "autre",
    avatar: "initial",
    photo: "/convs/yanis.webp",
    verdict: { emoji: "🤔", title: "Il hésite.", subtitle: "Trois «\u00a0on\u00a0verra\u00a0» en deux semaines. Il garde la porte ouverte, sans la franchir." },
    proof: { text: "haha peut-être, on verra", caption: "7 mars, 22\u00a0h\u00a058" },
    confidence: "probable",
    proofs: 3,
    next: "Glisse-lui que t’es libre jeudi, et laisse-le proposer.",
  },

  /* ———— Rangée 3 ———— */
  {
    id: "emma",
    name: "Emma",
    label: "Ton date en cours",
    app: "whatsapp",
    avatar: "initial",
    photo: "/convs/emma.webp",
    verdict: { emoji: "🤏", title: "Vous êtes à deux doigts.", subtitle: "Elle parle déjà de toi à ses proches." },
    proof: { text: "ma coloc veut savoir qui me fait sourire comme ça devant mon tel", caption: "23 févr., 22\u00a0h\u00a009" },
    confidence: "sur",
    proofs: 10,
    next: "Dis-lui ce que tu ressens, en face.",
  },
  {
    id: "maxime",
    name: "Maxime du 3e",
    label: "Ton voisin",
    app: "imessage",
    avatar: "app",
    verdict: { emoji: "🔥", title: "Il est partant.", subtitle: "Il cherche un prétexte pour te voir. Il en a trouvé un bon." },
    proof: { text: "je fais des crêpes ce soir, il va en rester", caption: "2 févr., 19\u00a0h\u00a040" },
    confidence: "sur",
    proofs: 5,
    next: "Monte, et apporte de quoi boire.",
  },
  {
    id: "julien",
    name: "Julien",
    label: "Ton mec",
    app: "whatsapp",
    avatar: "initial",
    photo: "/convs/julien.webp",
    verdict: { emoji: "🤏", title: "Il manque un petit rien.", subtitle: "Vous vous écrivez tous les jours, mais plus que pour vous organiser." },
    proof: { text: "tu peux prendre le pain en rentrant", caption: "11 mars, 18\u00a0h\u00a012" },
    confidence: "probable",
    proofs: 6,
    next: "Envoie-lui un message qui n’a rien à voir avec l’organisation.",
  },
  {
    id: "alice",
    name: "Alice soirée",
    label: "Ton crush de soirée",
    app: "instagram",
    avatar: "initial",
    photo: "/convs/alice.webp",
    verdict: { emoji: "🤔", title: "Elle hésite.", subtitle: "Elle répond toujours, mais jamais avant le lendemain." },
    proof: { text: "c’était cool samedi\u00a0!", caption: "11 mars, 16\u00a0h\u00a027" },
    confidence: "probable",
    proofs: 4,
    next: "Propose-lui quelque chose de précis, une seule fois. Sa réponse te dira tout.",
  },
  {
    id: "lucas",
    name: "Lucas",
    label: "Ton presque-couple",
    app: "whatsapp",
    avatar: "app",
    verdict: { emoji: "🤏", title: "Vous êtes à deux doigts.", subtitle: "Il te présente déjà à ses proches. Il manque juste le mot." },
    proof: { text: "mes parents demandent quand ils vont enfin te rencontrer", caption: "1er mars, 20\u00a0h\u00a015" },
    confidence: "sur",
    proofs: 12,
    next: "Pose-lui la question\u00a0: «\u00a0on\u00a0est\u00a0quoi,\u00a0nous\u00a0?\u00a0»",
  },
  {
    id: "zoe",
    name: "Zoé",
    label: "Ton match Tinder",
    app: "autre",
    avatar: "initial",
    photo: "/convs/zoe.webp",
    verdict: { emoji: "🧊", title: "Elle s’éloigne.", subtitle: "Elle met plus de temps à répondre, et elle ne pose plus de questions." },
    proof: { text: "ah oui pardon j’avais pas vu", caption: "27 févr., 14\u00a0h\u00a052" },
    confidence: "sur",
    proofs: 6,
    next: "Like son message, et passe à autre chose. Si elle revient, ce sera pour de vrai.",
  },
];

/** Les mots autour des témoignages (la maquette A1, choisie le 16 octobre) : le titre de leur section, sur chaque carte. */
export const TEMOIGNAGES = {
  titre: "Ils se posaient la même question.",
  aVu: "BLUSH a vu",
} as const;

/**
 * Les témoignages, sur la landing et sous le paywall. Vide : la section n’apparaît pas. Uniquement de vrais avis, avec
 * l’accord écrit des personnes : jamais d’avis inventé. Ces trois-là sont ceux de testeurs de BLUSH, dans leurs mots,
 * donnés le 16 octobre. Leur phrase en grand (`citation`) et le passage surligné (`surligne`) sont des morceaux de leur
 * avis, mot pour mot (tests/client/temoignages.test.tsx) ; `vu` dit, en une ligne, ce que BLUSH a vu pour eux ; `photo`, leur
 * visage dans le rond (public/avis/, recadrée en carré de 256 px, sans ses métadonnées).
 * TODO(produit): garder leur accord écrit, et les remplacer par des avis de clients quand il y en aura.
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Mattheo",
    label: "Son crush",
    teinte: "elle",
    vu: "qui reprend après un silence",
    citation: "aujourd’hui on est ensemble.",
    surligne: "BLUSH m’a fait remarquer qu’elle reprenait toujours la conversation quand je laissais un blanc, mais qu’elle ne venait jamais me parler d’elle-même.",
    text: "Pendant 5 mois, je me suis demandé si elle était vraiment intéressée ou juste sympa avec moi. BLUSH m’a fait remarquer qu’elle reprenait toujours la conversation quand je laissais un blanc, mais qu’elle ne venait jamais me parler d’elle-même. J’ai arrêté de jouer au mec trop occupé, je lui ai proposé un resto quelques jours après, et aujourd’hui on est ensemble.",
    photo: "/avis/mattheo.webp",
  },
  {
    name: "Sonia",
    label: "En couple",
    teinte: "vrai",
    vu: "le moment où ça a changé",
    citation: "pour la première fois depuis longtemps, on a réussi à parler de ce qui n’allait pas.",
    surligne: "BLUSH a retracé nos derniers échanges et repéré le moment où nos conversations ont commencé à changer.",
    text: "Je pensais qu’on s’éloignait sans vraiment savoir pourquoi. BLUSH a retracé nos derniers échanges et repéré le moment où nos conversations ont commencé à changer. On a tout relu ensemble, on s’est reconnus dans certains passages, et pour la première fois depuis longtemps, on a réussi à parler de ce qui n’allait pas.",
    photo: "/avis/sonia.webp",
  },
  {
    name: "Charlotte",
    label: "Situationship",
    teinte: "flou",
    vu: "qui relance sans réponse",
    citation: "Ça m’a fait mal de le voir noir sur blanc",
    surligne: "BLUSH m’a montré que c’était toujours moi qui relançais et que ses réponses ne menaient jamais nulle part.",
    text: "J’étais à deux doigts de lui renvoyer un message, comme d’habitude. BLUSH m’a montré que c’était toujours moi qui relançais et que ses réponses ne menaient jamais nulle part. Ça m’a fait mal de le voir noir sur blanc, mais j’ai fini par supprimer mon brouillon. Son dernier vocal\u00a0? Je l’ai écouté bien trop de fois avant d’en arriver là.",
    photo: "/avis/charlotte.webp",
  },
];

/**
 * La note des avis sur la landing (NOTE_DES_AVIS, src/contenu/paiement.ts) : sous les boutons, et, au-dessus des avis,
 * d’où elle vient. À côté d’une note, la loi demande de dire qui l’a donnée et quand (Code de la consommation, art.
 * D.111-17 ; la directive Omnibus).
 */
export const NOTE_LANDING = {
  avis: (nombre: string) => ` · ${nombre} avis de testeurs`,
  origine: (note: string, nombre: string) => `${note} sur 5, d’après ${nombre} avis de testeurs de BLUSH, recueillis lors de tests menés en université en octobre 2026.`,
};

/** Dans le bloc du quotidien, la réponse de BLUSH à « elle voit quelqu’un d’autre ? ». */
export const REPONSE_EXEMPLE: Pick<QuestionAnswer, "title" | "evidence" | "confidence" | "limits"> = {
  title: "Rien ne l’indique dans votre conv.",
  evidence: "Elle te parle tous les soirs entre 22\u00a0h et 1\u00a0h, 6\u00a0jours sur 7. Ses week-ends, elle te les raconte.",
  confidence: "probable",
  limits: "BLUSH ne voit que vos messages.",
};

/** Dans le bloc du quotidien, la réponse de BLUSH à « on en est où ? » : le verdict, la tendance, le prochain pas. */
export const VERDICT_EXEMPLE = {
  emoji: "🤏",
  short: "À deux doigts",
  trend: "↗ ça se réchauffe",
  nextStep: "Ton prochain pas\u00a0: lui demander samedi, en face.",
};

/**
 * Ce que BLUSH promet en chiffres, dans « Rapide. Complet. Discret. ». Le nombre de chapitres vient de la règle
 * (NB_CHAPITRES) ; le dernier fait reprend PROMESSE_CONV et la page Confidentialité, qui fait foi (« La conv brute,
 * effacée après ton rapport ») : ce qui en vient (le rapport, sa fiche) reste, chiffré, ce n’est donc pas « 0 message ».
 * « conv brute gardée après ton rapport » : libellé validé le 12 octobre 2026 (il remplace « message gardé »).
 */
export const FAITS_LANDING = [
  { valeur: "40\u00a0s", libelle: "pour analyser votre conv" },
  { valeur: `${NB_CHAPITRES}`, libelle: "chapitres dans ton rapport" },
  { valeur: "0", libelle: "conv brute gardée après ton rapport" },
] as const;
