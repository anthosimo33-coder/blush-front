import { NB_CHAPITRES } from "@/contenu/chapitres";
import type { GenreDuHaut } from "@/contenu/haut-du-paywall";
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
    chiffres: [
      { valeur: "4 sur 5", texte: "des convs, c’est elle qui les lance depuis le 12\u00a0févr.", cote: "elle" },
      { valeur: "6 fois", texte: "elle a parlé de se revoir depuis le 3\u00a0mars", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "5 fois", texte: "«\u00a0c’est pas grave\u00a0» depuis le 14\u00a0févr.", cote: "elle" },
      { valeur: "−40\u00a0%", texte: "de messages par jour depuis le 14\u00a0févr.", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "6\u00a0min", texte: "pour te répondre, en moyenne", cote: "elle" },
      { valeur: "12\u00a0févr.", texte: "il propose un soir et une heure", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "6 sur 7", texte: "de ses messages arrivent après 23\u00a0h", cote: "elle" },
      { valeur: "28\u00a0janv.", texte: "la seule fois où elle parle de «\u00a0nous\u00a0»", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "−60\u00a0%", texte: "de longueur pour ses messages depuis le 26\u00a0févr.", cote: "elle" },
      { valeur: "9 sur 10", texte: "des relances viennent de toi depuis le 26\u00a0févr.", cote: "toi" },
    ],
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
    chiffres: [
      { valeur: "11\u00a0h\u00a020", texte: "le lendemain du date, elle t’écrit la première", cote: "elle" },
      { valeur: "3", texte: "propositions de sa part depuis le 9\u00a0mars", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "3 fois", texte: "il propose un verre… «\u00a0si t’as le temps\u00a0»", cote: "elle" },
      { valeur: "4\u00a0avr.", texte: "son premier «\u00a0on devrait se faire un verre\u00a0»", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "7 fois", texte: "il parle de projets à deux depuis janvier", cote: "elle" },
      { valeur: "4\u00a0min", texte: "pour te répondre, comme au début", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "2\u00a0jours", texte: "pour te répondre depuis le 16\u00a0févr.", cote: "elle" },
      { valeur: "0", texte: "question de sa part depuis votre date", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "5\u00a0min", texte: "pour te répondre, même tard le soir", cote: "elle" },
      { valeur: "15\u00a0mars", texte: "son premier message ouvertement dragueur", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "4 fois", texte: "elle propose de vous voir depuis le 1er\u00a0mars", cote: "elle" },
      { valeur: "21\u00a0mars", texte: "elle te demande si tu viens à l’anniv", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "3", texte: "«\u00a0on verra\u00a0» depuis le 23\u00a0févr.", cote: "elle" },
      { valeur: "0", texte: "proposition de sa part en deux semaines", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "23\u00a0févr.", texte: "elle parle de toi à sa coloc", cote: "elle" },
      { valeur: "2\u00a0min", texte: "pour te répondre, le soir", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "5", texte: "prétextes pour te voir depuis janvier", cote: "elle" },
      { valeur: "2\u00a0févr.", texte: "les crêpes «\u00a0il va en rester\u00a0»", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "8 sur 10", texte: "de vos messages parlent d’organisation", cote: "pareil" },
      { valeur: "19\u00a0janv.", texte: "son dernier «\u00a0tu me manques\u00a0»", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "14\u00a0h", texte: "pour te répondre, en moyenne", cote: "elle" },
      { valeur: "11\u00a0mars", texte: "elle reparle de samedi, trois jours après", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "1er\u00a0mars", texte: "il parle de te présenter à ses parents", cote: "elle" },
      { valeur: "9 sur 10", texte: "de vos soirées, c’est lui qui les propose", cote: "elle" },
    ],
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
    chiffres: [
      { valeur: "9\u00a0h", texte: "pour te répondre, contre 10 min en janvier", cote: "elle" },
      { valeur: "0", texte: "question de sa part depuis le 20\u00a0févr.", cote: "elle" },
    ],
  },
];

/** Les mots autour des témoignages (la maquette A1, choisie le 16 octobre) : le titre de leur section, sur chaque carte. */
export const TEMOIGNAGES = {
  titre: "Ils se posaient la même question.",
  aVu: "BLUSH a vu",
} as const;

/**
 * Les témoignages, sur la landing et sous le paywall. Vide : la section n’apparaît pas. Uniquement de vrais avis, avec
 * l’accord écrit des personnes : jamais d’avis inventé. Ce sont ceux de testeurs de BLUSH, dans leurs mots : Mattheo,
 * Sonia et Charlotte donnés le 16 octobre, les sept autres le 22 octobre (avec leur photo et leur accord écrit, d’après
 * l’utilisateur ; seules les fautes de frappe sont corrigées, « oi » en « moi », « cest », « ca », « fréquentait »,
 * « meilleure ami », et les guillemets mis à la française). L’ordre est celui de la landing et, sans titre qui
 * leur ressemble (AVIS_DU_HAUT), du paywall : les trois avis sur le vocal (Jasmine, Enzo, Lina) jamais côte à côte. Leur phrase en grand (`citation`) et le passage surligné (`surligne`) sont des morceaux de leur
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
    name: "Erine",
    label: "Ils se parlent",
    teinte: "flou",
    vu: "un mec qui la gardait au chaud",
    citation: "Je l’ai bloqué le soir même et jme sens trop mieux",
    surligne: "J’ai mis notre conv sur BLUSH et le verdict m’a dit cash qu’il me gardait au chaud.",
    text: "Wsh faut que je vous raconte. Le mec à qui je parle depuis 2 mois likait toutes mes stories mais répondait jamais à mes messages. J’ai mis notre conv sur BLUSH et le verdict m’a dit cash qu’il me gardait au chaud. J’avais le seum mais c’était trop vrai mdrr. Je l’ai bloqué le soir même et jme sens trop mieux",
    photo: "/avis/erine.webp",
  },
  {
    name: "Jasmine",
    label: "Son crush",
    teinte: "elle",
    vu: "tout sur son crush, en un vocal",
    citation: "elle avait raison sur tout.",
    surligne: "C’est trop fun et en vrai ça aide grave",
    text: "Ma pote m’a fait écouter sa vocale et j’ai cru mourir de rire mdrrrr. Du coup j’ai testé avec mon crush et la vocale m’a clashée encore plus fort lol. Mais enfaite elle avait raison sur tout. C’est trop fun et en vrai ça aide grave",
    photo: "/avis/jasmine.webp",
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
    name: "Sofia",
    label: "Son crush",
    teinte: "elle",
    vu: "des «\u00a0on verra\u00a0» qui veulent dire non",
    citation: "ça m’a évité de perdre encore 3 mois.",
    surligne: "BLUSH m’a expliqué que ses «\u00a0on verra\u00a0» c’était des non polis.",
    text: "Le mec me disait «\u00a0on verra\u00a0» à chaque fois que je proposais de se voir. Moi je pensais qu’il était juste occupé lol. BLUSH m’a expliqué que ses «\u00a0on verra\u00a0» c’était des non polis. Ça m’a piquée mais ça m’a évité de perdre encore 3 mois. Merci BLUSH sérieux",
    photo: "/avis/sofia.webp",
  },
  {
    name: "Enzo",
    label: "Sa crush",
    teinte: "elle",
    vu: "tout sur sa crush, en un vocal",
    citation: "la vocale m’a clashé encore plus fort que eux",
    surligne: "Mais en vrai elle a tout capté sur la meuf.",
    text: "Mes potes m’ont fait écouter leurs vocales en soirée et c’était trop drôle mdrrrr. Du coup j’ai testé avec ma crush et la vocale m’a clashé encore plus fort que eux lol. Mais en vrai elle a tout capté sur la meuf. C’est trop fun et ça aide grave",
    photo: "/avis/enzo.webp",
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
  {
    name: "Lucas",
    label: "Son ex",
    teinte: "flou",
    vu: "ce qu’elle lui avait fait, dans l’ordre",
    citation: "Ça m’a mis une claque, j’ai pas répondu",
    surligne: "Le rapport m’a rappelé tout ce qu’elle m’avait fait en mode chronologie.",
    text: "Mon ex m’a écrit «\u00a0tu me manques\u00a0» après 5 mois et j’allais repartir direct jpp. Un pote m’a dit de passer par BLUSH avant de répondre. Le rapport m’a rappelé tout ce qu’elle m’avait fait en mode chronologie. Ça m’a mis une claque, j’ai pas répondu et franchement merci",
    photo: "/avis/lucas.webp",
  },
  {
    name: "Maelys",
    label: "Situationship",
    teinte: "flou",
    vu: "des réponses en 3 mots depuis une semaine",
    citation: "BLUSH m’a sorti la phrase parfaite et depuis c’est niquel",
    surligne: "c’est trop bien maintenant c’est ma meilleure amie",
    text: "Enfaite on m’a envoyé ça pour tester, j’me disais c’est banal, mais enfaite c’est trop bien maintenant c’est ma meilleure amie. Le mec que je fréquentais me répondait en 3 mots depuis une semaine. J’ai demandé à BLUSH quoi lui dire. BLUSH m’a sorti la phrase parfaite et depuis c’est niquel",
    photo: "/avis/maelys.webp",
  },
  {
    name: "Lina",
    label: "Testé entre potes",
    teinte: "flou",
    vu: "tout, en un vocal",
    citation: "La vocale m’a clashée direct",
    surligne: "En vrai elle a tout capté BLUSH, c’est trop fun et réel",
    text: "La vocale m’a clashée direct mdrrrr. Ma pote a pleuré de rire mais moi j’ai moins rigolé lol. En vrai elle a tout capté BLUSH, c’est trop fun et réel",
    photo: "/avis/lina.webp",
  },
];

/**
 * Sur le paywall, l’avis qui passe en premier, d’après le titre du haut (genreDuHaut) : celui dont l’histoire lui
 * ressemble (une proposition du 22 octobre 2026). « C’est toi qui portes la conv » : Charlotte, qui relançait seule ;
 * « Tu ouvres la conv. Lucas, lui, revient » et « Lucas court après toi » : Mattheo, qu’elle reprenait après ses
 * silences ; la tendance (« Depuis le 12 mars, Lucas t’écrit 2 fois moins ») : Maelys, des réponses en 3 mots depuis une
 * semaine. Les autres gardent leur ordre ; à l’égalité, ou sans titre, l’ordre de TESTIMONIALS. Chaque prénom est celui
 * d’un avis de TESTIMONIALS (tests/client/temoignages.test.tsx).
 */
export const AVIS_DU_HAUT: Partial<Record<GenreDuHaut, string>> = { tendance: "Maelys", toi: "Charlotte", elle: "Mattheo", contraste: "Mattheo" };

/**
 * La note des avis sur la landing (NOTE_DES_AVIS, src/contenu/paiement.ts) : sous les boutons, et, au-dessus des avis,
 * qui l’a donnée (des testeurs).
 * TODO(produit): à côté d’une note, la loi demande aussi quand et comment les avis ont été recueillis (Code de la
 * consommation, art. D.111-17 ; la directive Omnibus) ; retiré le 22 octobre à la demande de l’utilisateur.
 */
export const NOTE_LANDING = {
  avis: (nombre: string) => ` · ${nombre} avis de testeurs`,
  origine: (note: string, nombre: string) => `${note} sur 5, d’après ${nombre} avis de testeurs de BLUSH.`,
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
