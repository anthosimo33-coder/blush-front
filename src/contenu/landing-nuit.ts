/*
 * La landing (/), sous les convs d’exemple : ce qu’elle vit, ce qu’elle a déjà essayé, puis une nuit avec BLUSH (le 18
 * novembre 2026, d’après l’avatar client : une femme de 25 à 45 ans, une histoire floue depuis des mois, qui relance pour
 * deux et rumine la nuit). Repris de la page des pubs proposée le 13 novembre (gardée sur la branche proto/landing-pubs,
 * pas retenue : une seule page pour tout le monde). Les visiteurs des pubs importent à 6 %, contre 32 % pour Google :
 * ils doivent se reconnaître avant qu’on leur parle de BLUSH. Le premier écran, lui, ne change pas.
 *
 * Règles tenues : ce qu’elle vit est dit par elle, à la 1re personne (rien ne lui dit son âge, sa situation ou sa santé,
 * comme Meta le demande aux pages de ses pubs) ; « la psy », pas « ta psy » ; BLUSH ne remplace pas une psy ; elle
 * tend la perche, c’est lui qui propose. Les situations sont celles des lectures payées, réécrites : aucune phrase de
 * cliente ; les exemples sont inventés.
 */

/**
 * « Ça te parle ? » (le 18 novembre 2026) : ce qu’elle vit, dit par elle, à la 1re personne, comme les messages
 * qu’elle envoie à sa meilleure amie (les situations des lectures payées, réécrites : aucune phrase de cliente). Puis
 * BLUSH lui répond la vérité que l’avatar a montrée : elle n’est pas « trop », personne n’avait lu toute l’histoire.
 */
export const CA_TE_PARLE = {
  titre: "Ça te parle\u00a0?",
  messages: [
    "c’est toujours moi qui écris en premier",
    "il répond «\u00a0moi aussi\u00a0». et rien d’autre",
    "il disparaît deux jours, puis il revient comme si de rien n’était",
    "j’ai réécrit mon message cinq fois. je l’ai toujours pas envoyé",
    "mes copines en peuvent plus de m’entendre parler de lui",
  ],
  blush: "t’es pas «\u00a0trop\u00a0». personne avait lu toute votre histoire.",
} as const;

/** Ce qu’elle a déjà essayé, et pourquoi ça ne suffit pas ; BLUSH conclut en une bulle. */
export const DEJA_ESSAYE = {
  titre: "Tu as déjà tout essayé.",
  sous: "Et à 2\u00a0h, tu tournes encore en rond.",
  lignes: [
    { emoji: "👭", titre: "Les copines", texte: "Elles t’écoutent. Mais elles n’ont lu que trois captures, et chacune te dit autre chose." },
    { emoji: "📱", titre: "Les vidéos", texte: "«\u00a0S’il voulait, il le ferait.\u00a0» Merci. Ça ne te dit pas ce que LUI veut." },
    { emoji: "🔁", titre: "Relire la conv", texte: "Tu la connais par cœur. Et tu ne sais toujours pas où vous en êtes." },
    { emoji: "🛋️", titre: "La psy", texte: "Elle aide, vraiment. Mais c’est jeudi, et elle n’a jamais lu ses messages." },
  ],
  blush: "moi, j’ai tout lu. et je suis là à 2\u00a0h.",
} as const;

/** La conv de nuit avec BLUSH, sous « Tu as déjà tout essayé » : ses messages à elle (`moi`), puis les réponses de BLUSH. */
export const NUIT = {
  heure: "2:14",
  legende: "Exemple · une nuit avec BLUSH",
  messages: [
    { moi: true, texte: "il a lu mon message à 22\u00a0h\u00a041" },
    { moi: true, texte: "toujours rien. je lui réécris\u00a0?" },
    { moi: false, texte: "non. pas ce soir." },
    { moi: false, texte: "j’ai lu vos 3 mois de messages. quand il est débordé, il disparaît deux jours… puis c’est lui qui revient. il l’a fait 4 fois." },
    { moi: false, texte: "dors. demain midi, je t’aide à lui répondre 💗" },
  ],
} as const;
