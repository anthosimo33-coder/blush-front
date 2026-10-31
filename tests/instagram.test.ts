import { describe, expect, it } from "vitest";
import { chiffrer, detecterFormat, erreurImport, lire, participantsDe } from "@prompts/lib/conv";
import { choisirParties, lireExport } from "@prompts/lib/export";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";
import { profil } from "@prompts/lib/style";

/* Un export Instagram JSON tel qu’Instagram l’écrit : l’UTF-8 octet par octet (« Ã© »), du plus récent au plus ancien */
const latin1 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
const json = JSON.stringify({
  participants: [{ name: latin1("Léa") }, { name: "Malik" }],
  messages: [
    { sender_name: "Malik", timestamp_ms: Date.UTC(2026, 8, 12, 19, 0), content: latin1("à demain alors 😊") },
    { sender_name: latin1("Léa"), timestamp_ms: Date.UTC(2026, 8, 12, 18, 59), content: latin1("Léa a aimé un message") },
    { sender_name: latin1("Léa"), timestamp_ms: Date.UTC(2026, 8, 12, 18, 58), audio_files: [{ uri: "audio/1.mp4" }] },
    { sender_name: "Malik", timestamp_ms: Date.UTC(2026, 8, 12, 18, 30), content: latin1("t’es dispo jeudi ?") },
  ],
});

const html = `<html><body><header><time datetime="2026-09-20T05:40Z">Le Samedi 19 septembre 2026 à 22:40 (UTC)</time></header><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Malik</h2><div class="_3-95 _a6-p"><div><div></div><div>ah mince</div><div></div><div></div></div></div><div class="_3-94 _a6-o">sep 18, 2026 8:30 am</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">lea :)</h2><div class="_3-95 _a6-p"><div><div></div><div></div><div></div><div></div><div><div><audio src="x/audio/1.ogg" controls="1"><a href="x/audio/1.ogg">x/audio/1.ogg</a></audio></div></div><div><ul class="_a6-q"><li><span>❤Malik</span></li></ul></div></div></div><div class="_3-94 _a6-o">sep 18, 2026 8:29 am</div></div>
</main></body></html>`;

describe("export Instagram", () => {
  it("relit le JSON : accents réparés, messages système retirés, ordre et heure de Paris", () => {
    const r = depuisInstagramJson(json);
    expect(r.participants).toEqual(["Malik", "Léa"]);
    expect(r.texte.split("\n")).toEqual([
      "[12/09/2026 20:30:00] Malik: t’es dispo jeudi ?",
      "[12/09/2026 20:58:00] Léa: audio omitted",
      "[12/09/2026 21:00:00] Malik: à demain alors 😊",
    ]);
  });

  it("relit le HTML : heures ramenées à Paris d’après l’en-tête, vocal reconnu, réactions et deux-points retirés", () => {
    const r = depuisInstagramHtml(html);
    expect(r.texte.split("\n")).toEqual(["[18/09/2026 17:29:00] lea ): audio omitted", "[18/09/2026 17:30:00] Malik: ah mince"]);
    const f = detecterFormat(r.texte)!;
    expect(f).toBe("whatsapp-ios");
    const p = participantsDe(r.texte);
    const lu = lire(r.texte, { utilisateur: { prenom: "Malik", pronom: "il", nomExport: "Malik" }, autre: { prenom: "Léa", pronom: "elle", nomExport: "lea )" }, format: f });
    expect(p).toHaveLength(2);
    expect(lu.messages.map((m) => m.media ?? m.texte)).toEqual(["vocal", "ah mince"]);
    expect(erreurImport(lu)).toBe("courte");
  });

  it("choisit les bons fichiers d’un export", () => {
    expect(
      choisirParties([
        { nom: "a/inbox/x/message_2.json", contenu: "" },
        { nom: "a/inbox/x/message_1.json", contenu: "" },
      ]),
    ).toEqual([
      { nom: "a/inbox/x/message_1.json", contenu: "" },
      { nom: "a/inbox/x/message_2.json", contenu: "" },
    ]);
    expect(
      choisirParties([
        { nom: "a/inbox/x/message_1.json", contenu: "" },
        { nom: "a/inbox/y/message_1.json", contenu: "" },
      ]),
    ).toBe("plusieurs");
    expect(
      choisirParties([
        { nom: "WhatsApp Chat/_chat.txt", contenu: "x" },
        { nom: "autre.txt", contenu: "y" },
      ]),
    ).toEqual([{ nom: "WhatsApp Chat/_chat.txt", contenu: "x" }]);
    expect(lireExport([{ nom: "message_1.json", contenu: json }])?.appli).toBe("instagram");
  });
});

describe("un export Instagram complet", () => {
  const conv = (titre: string, noms: string[], n: number, debut: number) =>
    JSON.stringify({
      title: titre,
      participants: noms.map((name) => ({ name })),
      messages: Array.from({ length: n }, (_, k) => ({ sender_name: noms[k % noms.length], timestamp_ms: debut + (n - k) * 60_000, content: `message ${k}` })),
    });
  const fichiers = [
    { nom: "your_instagram_activity/messages/inbox/ines_1/message_1.json", contenu: conv("Inès", ["Inès", "Léo"], 120, Date.UTC(2026, 8, 20)) },
    { nom: "your_instagram_activity/messages/inbox/maxime_2/message_1.json", contenu: conv("maxime.drn", ["maxime.drn", "Léo"], 30, Date.UTC(2026, 7, 1)) },
    { nom: "your_instagram_activity/messages/inbox/groupe_3/message_1.json", contenu: conv("Les zinzins", ["A", "B", "Léo"], 60, Date.UTC(2026, 9, 1)) },
  ];

  it("se range par conv, chacune avec son nom, son nombre de messages, sa dernière date, et les groupes repérés", async () => {
    const { choisirParties, convsInstagram, resumeConvInstagram } = await import("@prompts/lib/export");
    expect(choisirParties(fichiers)).toBe("plusieurs");
    const convs = convsInstagram(fichiers);
    expect(convs).toHaveLength(3);
    const resumes = convs.map((c) => resumeConvInstagram(c.parties)!);
    expect(resumes.map((r) => [r.nom, r.messages, r.groupe])).toEqual([
      ["Inès", 120, false],
      ["maxime.drn", 30, false],
      ["Les zinzins", 60, true],
    ]);
    expect(resumes[0]!.derniere).toMatch(/^2026-09-2\d$/);
  });
});

describe("le HTML d’Instagram, lu sans expression qui se relit", () => {
  /* Un bloc de message, comme Instagram l’écrit : son nom, son contenu, sa date */
  const bloc = (nom: string, contenu: string, quand: string) =>
    `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${nom}</h2><div class="_3-95 _a6-p"><div>${contenu}</div></div><div class="_3-94 _a6-o">${quand}</div></div>`;
  const riche = [
    bloc("Malik", "<div>on se voit &amp; on parle ?<br>promis</div>", "sep 18, 2026 9:01 pm"),
    bloc("Léa", `<div><video src="x/videos/2.mp4" controls="1"><a href="x/videos/2.mp4">x/videos/2.mp4</a></video></div>`, "sep 18, 2026 9:00 pm"),
    bloc("Léa", `<div>regarde ça</div><div><a target="_blank" href="x/photos/3.jpg"><img src="x/photos/3.jpg" class="_a6_o _3-96" /></a></div>`, "sep 18, 2026 8:59 pm"),
    bloc("Malik", `<div><AUDIO src="x/audio/4.ogg"><a href="x/audio/4.ogg">x</a></AUDIO></div><ul class="_a6-q"><li>❤Léa</li></ul>`, "sep 18, 2026 8:58 pm"),
    bloc("Léa", `<div>le lien : <a href="https://exemple.fr/a">https://exemple.fr/a</a> &#x1F600; &lt;3 <> <<b>gras</b></div>`, "18 sept. 2026, 20:57"),
    bloc("Malik", "<div>Léa a aimé un message</div>", "sep 18, 2026 8:56 pm"),
  ].join("\n");

  it("donne le même texte qu’avant sa réécriture", () => {
    expect(depuisInstagramHtml(`<html><body><main>${riche}</main></body></html>`).texte.split("\n")).toEqual([
      "[19/09/2026 05:57:00] Léa: le lien : https://exemple.fr/a 😀 <3 <> gras",
      "[19/09/2026 05:58:00] Malik: audio omitted",
      "[19/09/2026 05:59:00] Léa: regarde ça image omitted",
      "[19/09/2026 06:00:00] Léa: video omitted",
      "[19/09/2026 06:01:00] Malik: on se voit & on parle ?",
      "promis",
    ]);
  });
});

/*
 * Les formes réelles d’un export Instagram, relevées sur des exports publics (les prénoms, pseudos, légendes et liens
 * sont inventés) : ce qu’Instagram écrit lui-même, ou qu’un autre compte a écrit, n’est jamais leurs mots.
 */
const T = (min: number) => Date.UTC(2026, 8, 12, 18, min);
/** Une valeur du JSON telle qu’Instagram l’écrit : ses chaînes en UTF-8 octet par octet. */
const commeInstagram = (v: unknown): unknown =>
  typeof v === "string"
    ? latin1(v)
    : Array.isArray(v)
      ? v.map(commeInstagram)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, commeInstagram(x)]))
        : v;
/** Un export JSON de ces messages (donnés du plus ancien au plus récent), du plus récent au plus ancien comme Instagram. */
const enJson = (...messages: Record<string, unknown>[]) =>
  JSON.stringify({ participants: [{ name: latin1("Léa") }, { name: "Tom" }], messages: messages.map(commeInstagram).reverse() });
/** Un bloc de message de l’export HTML, minifié comme Instagram l’écrit. */
const blocHtml = (nom: string, contenu: string, quand: string) =>
  `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${nom}</h2><div class="_3-95 _a6-p"><div>${contenu}</div></div><div class="_3-94 _a6-o">${quand}</div></div>`;
/** Un export HTML de ces blocs (donnés du plus ancien au plus récent), du plus récent au plus ancien comme Instagram. */
const enHtml = (...blocs: string[]) => `<html><body><main>${blocs.reverse().join("\n")}</main></body></html>`;
const tomEtLea = { utilisateur: { prenom: "Tom", pronom: "il" as const, nomExport: "Tom" }, autre: { prenom: "Léa", pronom: "elle" as const, nomExport: "Léa" } };
/** La lecture de l’import (lib/conv.ts), sur le texte remis au format des exports WhatsApp. */
const lu = (texte: string) => lire(texte, { ...tomEtLea, format: "whatsapp-ios" }, { autresEnTexte: true });
/** Ce que la lecture garde de chaque message : son média, sinon son texte. */
const vus = (texte: string) => lu(texte).messages.map((m) => m.media ?? m.texte);
const chiffres = (texte: string) => chiffrer(tomEtLea, lu(texte).messages);
const leursMots = (texte: string) => chiffres(texte).recurrents.map(([w]) => w);

describe("ce qu’Instagram écrit lui-même n’est pas un message", () => {
  it("jette les likes, avec ou sans nom devant, et les réactions finies par une espace", () => {
    const texte = depuisInstagramJson(
      enJson(
        { sender_name: "Tom", timestamp_ms: T(0), content: "on se voit jeudi ?" },
        { sender_name: "Léa", timestamp_ms: T(1), content: "Liked a message" },
        { sender_name: "Léa", timestamp_ms: T(2), content: "A aimé un message" },
        { sender_name: "Léa", timestamp_ms: T(3), content: "Liked a message." },
        { sender_name: "Léa", timestamp_ms: T(4), content: "Reacted ❤️ to your message " },
        { sender_name: "Léa", timestamp_ms: T(5), content: "A réagi ❤️ à votre message " },
        { sender_name: "Tom", timestamp_ms: T(6), content: "Tom liked a message " },
        /* Des messages qui en parlent restent des messages, rognés comme les autres */
        { sender_name: "Tom", timestamp_ms: T(7), content: "liked a message lol" },
        { sender_name: "Léa", timestamp_ms: T(8), content: "t’as liked a message ?" },
        { sender_name: "Léa", timestamp_ms: T(9), content: "à jeudi " },
      ),
    ).texte;
    expect(vus(texte)).toEqual(["on se voit jeudi ?", "liked a message lol", "t’as liked a message ?", "à jeudi"]);
    const html = enHtml(
      blocHtml("Tom", "<div>coucou</div>", "Sep 20, 2025 12:31 pm"),
      blocHtml("Léa", "<div>Liked a message</div>", "Sep 20, 2025 12:32 pm"),
      blocHtml("Léa", "<div>Reacted ❤️ to your message </div>", "Sep 20, 2025 12:33 pm"),
    );
    expect(vus(depuisInstagramHtml(html).texte)).toEqual(["coucou"]);
  });

  it("une story partagée est un média, avec ou sans son lien ; la ligne du mode silencieux est jetée", () => {
    const texte = depuisInstagramJson(
      enJson(
        { sender_name: "Léa", timestamp_ms: T(0), content: "Léa shared a story.", share: { link: "https://instagram.com/stories/compte.ami/1" } },
        { sender_name: "Léa", timestamp_ms: T(1), content: "Léa shared a story." },
        { sender_name: "Léa", timestamp_ms: T(2), content: "lea.mrtn wasn't notified about this message because they're in quiet mode." },
        { sender_name: "Tom", timestamp_ms: T(3), content: "lol he shared a story" },
      ),
    ).texte;
    expect(vus(texte)).toEqual(["média", "média", "lol he shared a story"]);
    expect(vus(depuisInstagramHtml(enHtml(blocHtml("Léa", "<div>Léa shared a story.</div>", "Sep 20, 2025 12:31 pm"))).texte)).toEqual(["média"]);
  });

  it("une story partagée porte « You » ou le début du nom de l’expéditeur ; un message qui en parle reste un message", () => {
    const texte = depuisInstagramJson(
      enJson(
        { sender_name: "Léa Martin", timestamp_ms: T(0), content: "Léa shared a story." },
        { sender_name: "Tom", timestamp_ms: T(1), content: "You shared a story." },
        { sender_name: "Tom", timestamp_ms: T(2), content: "omg she shared a story." },
      ),
    ).texte;
    expect(texte.split("\n").map((l) => l.split("] ")[1])).toEqual(["Léa Martin: document omitted", "Tom: document omitted", "Tom: omg she shared a story."]);
    /* En HTML, tout le message reste, sur ses deux lignes */
    const bloc = blocHtml("Tom", "<div>omg she shared a story.<br>t’as vu ce qu’elle a mis ? elle abuse</div>", "Sep 20, 2025 12:31 pm");
    expect(vus(depuisInstagramHtml(enHtml(bloc)).texte)).toEqual(["omg she shared a story.\nt’as vu ce qu’elle a mis ? elle abuse"]);
  });
});

describe("un partage d’Instagram est un média", () => {
  const reel = (k: number, multiligne = false) => ({
    sender_name: "Tom",
    timestamp_ms: T(k),
    content: "Tom sent an attachment.",
    share: {
      link: `https://www.instagram.com/reel/Cx${k}AbCdEf/`,
      share_text: multiligne ? "Quand il dit « j’arrive dans 5 min » 😭\n.\n.\n#couple #humour #pourtoi" : "POV : quand il répond pas depuis 3 jours 😭 #pov #couple #fyp",
      original_content_owner: "drole.de.couple",
    },
  });

  it("JSON : la légende d’un reel ou d’un post (share_text), écrite par un autre compte, n’est jamais leurs mots", () => {
    const texte = depuisInstagramJson(
      enJson(
        ...Array.from({ length: 12 }, (_, k) => reel(k, k % 2 === 1)),
        /* Leur texte, avec un partage : il reste, et le partage devient son média */
        {
          sender_name: "Léa",
          timestamp_ms: T(20),
          content: "regarde ça mdr",
          share: { link: "https://www.instagram.com/reel/Cx20/", share_text: "Une légende d’un autre compte\n#couple" },
        },
        { sender_name: "Léa", timestamp_ms: T(21), content: "ligne un\nligne deux", share: { link: "https://www.instagram.com/p/Cx21/", share_text: "#couple" } },
        /* Un lien tapé : Instagram en fait un partage dont la légende est le lien lui-même */
        { sender_name: "Tom", timestamp_ms: T(22), content: "https://www.exemple.fr/a", share: { link: "https://www.exemple.fr/a", share_text: "https://www.exemple.fr/a" } },
      ),
    ).texte;
    expect(texte).not.toContain("couple");
    expect(vus(texte)).toEqual([...Array<string>(12).fill("média"), "regarde ça mdr [média]", "ligne un\nligne deux [média]", "https://www.exemple.fr/a [média]"]);
    const c = chiffres(texte);
    expect(c.medias).toEqual({ toi: { média: 13 }, autre: { média: 2 } });
    expect(c.recurrents.map(([w]) => w)).toEqual(["ligne"]);
    /* Ni leur longueur (Tom n’a écrit que son lien), ni le style que le chat imite (ses emojis) ne prennent ceux de la légende */
    expect(c.motsMoyens).toEqual({ toi: 1, autre: 4 });
    expect(profil(tomEtLea, lu(texte).messages).emojis).toEqual([]);
  });

  it("HTML : la mention d’Instagram, la légende, le créateur et le lien d’un reel forment un média ; la mention seule n’est rien", () => {
    const apercu = (lien: string) =>
      `<div><div><div><div>POV : quand il répond pas 😭 #pov #couple</div><div>drole.de.couple</div><div><a target="_blank" href="${lien}">${lien}</a></div></div></div></div>`;
    const html = enHtml(
      blocHtml(
        "Léa",
        `<div></div><div>lea.mrtn sent an attachment.</div>${apercu("https://www.instagram.com/reel/ABC123/?id=1234567890_12345678")}<div></div>`,
        "May 01, 2026 5:05 pm",
      ),
      blocHtml("Tom", `<div>Tom a envoyé une pièce jointe.</div>${apercu("https://www.instagram.com/reel/ABC124/")}`, "May 01, 2026 5:06 pm"),
      blocHtml("Tom", `<div>You sent an attachment.</div>${apercu("https://www.instagram.com/p/ABC125/")}`, "May 01, 2026 5:07 pm"),
      /* Indenté, comme dans la documentation des exports */
      blocHtml(
        "Léa",
        `\n    <div>lea.mrtn sent an attachment.</div>\n    <div><div><div>\n      <div>Une légende avec #hashtags</div>\n      <div>drole.de.couple</div>\n      <div><a target="_blank" href="https://www.instagram.com/reel/ABC126/">\n        https://www.instagram.com/reel/ABC126/\n      </a></div>\n    </div></div></div>\n  `,
        "May 01, 2026 5:08 pm",
      ),
      /* La mention seule (un reel supprimé) n’est rien, comme dans le JSON ; avec une photo, c’est la photo */
      blocHtml("Tom", "<div>You sent an attachment.</div>", "May 01, 2026 5:09 pm"),
      blocHtml(
        "Léa",
        `<div>Léa sent an attachment.</div><div><a target="_blank" href="x/photos/3.jpg"><img src="x/photos/3.jpg" class="_a6_o _3-96" /></a></div>`,
        "May 01, 2026 5:10 pm",
      ),
      blocHtml("Tom", "<div>trop drôle</div>", "May 01, 2026 5:11 pm"),
    );
    const texte = depuisInstagramHtml(html).texte;
    expect(vus(texte)).toEqual(["média", "média", "média", "média", "photo", "trop drôle"]);
    expect(texte).not.toMatch(/sent an attachment|pièce jointe|instagram|couple/);
  });

  it("HTML : les blocs d’un message sont séparés, leurs mots ne se collent plus", () => {
    const html = enHtml(blocHtml("Léa", "<div><div>regarde</div><div>c’est où ?</div></div>", "May 01, 2026 5:05 pm"));
    expect(vus(depuisInstagramHtml(html).texte)).toEqual(["regarde\nc’est où ?"]);
  });

  it("un GIF de Giphy est un autocollant, d’après l’hôte de son lien", () => {
    const partage = (k: number, link: string) => ({ sender_name: "Tom", timestamp_ms: T(k), share: { link, original_content_owner: "giphy" } });
    const texte = depuisInstagramJson(
      enJson(
        partage(0, "https://media1.giphy.com/media/v1.AbCdEf/3ohs4jxp/200.gif"),
        partage(1, "https://giphy.com/gifs/chat-content-AbCdEf"),
        partage(2, "https://www.instagram.com/reel/ABC123/"),
        partage(3, "https://pasgiphy.com/media/200.gif"),
        partage(4, "https://media1.giphy.com.exemple.fr/200.gif"),
      ),
    ).texte;
    expect(vus(texte)).toEqual(["autocollant", "autocollant", "média", "média", "média"]);
  });
});

describe("les appels d’Instagram", () => {
  it("JSON : un appel passé reste pour le modèle, avec sa durée, hors de leurs mots ; un appel manqué est un média", () => {
    const texte = depuisInstagramJson(
      enJson(
        /* Le début, puis la fin avec sa durée (en secondes), quelques secondes après : une seule ligne, à l’heure du début */
        { sender_name: "Léa", timestamp_ms: T(0), content: "lea.mrtn started a video chat" },
        { sender_name: "Léa", timestamp_ms: T(0) + 760e3, content: "Video chat ended", call_duration: 754 },
        /* Personne n’a décroché : « You missed… », ou une fin au bout de 0 s */
        { sender_name: "Tom", timestamp_ms: T(20), content: "tom.dlr started an audio call" },
        { sender_name: "Tom", timestamp_ms: T(20) + 26e3, content: "You missed an audio call", call_duration: 0 },
        { sender_name: "Léa", timestamp_ms: T(30), content: "lea.mrtn started a video chat" },
        { sender_name: "Léa", timestamp_ms: T(30) + 33e3, content: "Video chat ended", call_duration: 0 },
        { sender_name: "Léa", timestamp_ms: T(40), content: "lea.mrtn missed an audio call" },
        /* Une fin sans son début (un export coupé), dans une langue dont on ne connaît pas les libellés : sa durée suffit */
        { sender_name: "Tom", timestamp_ms: T(50), content: "Chamada de vídeo encerrada", call_duration: 3900 },
        /* Des messages qui parlent d’appel restent des messages */
        { sender_name: "Tom", timestamp_ms: T(60), content: "i missed your video call lol" },
        { sender_name: "Léa", timestamp_ms: T(61), content: "I just started a video chat" },
        /* Devant, « You » ou un pseudo, dans la casse d’Instagram : un mot tapé n’en est pas un */
        { sender_name: "Tom", timestamp_ms: T(62), content: "I missed a video chat" },
        { sender_name: "Léa", timestamp_ms: T(63), content: "Tom started a video chat" },
        { sender_name: "Tom", timestamp_ms: T(64), content: "video chat ended" },
      ),
    ).texte;
    expect(texte.split("\n")[0]).toBe("[12/09/2026 20:00:00] Léa: \u200eAppel vidéo, 13\u00a0min");
    const messages = lu(texte).messages;
    expect(messages.map((m) => [m.nom, m.media ?? m.texte, !!m.deWhatsApp])).toEqual([
      ["Léa", "Appel vidéo, 13\u00a0min", true],
      ["Tom", "appel manqué", false],
      ["Léa", "appel manqué", false],
      ["Léa", "appel manqué", false],
      ["Tom", "Appel vidéo, 1\u00a0h\u00a005", true],
      ["Tom", "i missed your video call lol", false],
      ["Léa", "I just started a video chat", false],
      ["Tom", "I missed a video chat", false],
      ["Léa", "Tom started a video chat", false],
      ["Tom", "video chat ended", false],
    ]);
    const c = chiffrer(tomEtLea, messages);
    expect(c.medias).toEqual({ toi: { "appel manqué": 1 }, autre: { "appel manqué": 2 } });
    /* Les mots des messages tapés, rien des lignes d’appel */
    expect(c.recurrents).toEqual([
      ["video", 5],
      ["chat", 4],
      ["missed", 2],
      ["started", 2],
    ]);
    /* Le style que le chat imite ne lit que ce que Tom a écrit */
    expect(profil(tomEtLea, messages).n).toBe(3);
  });

  it("HTML (sans durée) : le début et la fin d’un appel font une ligne, l’appel manqué un média", () => {
    const html = enHtml(
      blocHtml("Léa", "<div>lea.mrtn started a video chat</div>", "Sep 18, 2026 8:00 pm"),
      blocHtml("Léa", "<div>Video chat ended</div>", "Sep 18, 2026 8:14 pm"),
      blocHtml("Tom", "<div>tom.dlr missed an audio call</div>", "Sep 18, 2026 8:20 pm"),
    );
    expect(lu(depuisInstagramHtml(html).texte).messages.map((m) => [m.media ?? m.texte, !!m.deWhatsApp])).toEqual([
      ["Appel vidéo", true],
      ["appel manqué", false],
    ]);
  });
});

describe("une réponse à une story", () => {
  const story = "https://instagram.com/stories/tom.dlr/3717145434100081006";

  it("JSON : son texte reste leurs mots, son lien n’y entre pas, et le modèle voit que c’en est une", () => {
    const texte = depuisInstagramJson(
      enJson(
        ...Array.from({ length: 5 }, (_, k) => ({ sender_name: "Léa", timestamp_ms: T(k), content: "trop belle sur cette photo 😍", share: { link: story } })),
        /* Sans texte, c’est le plus souvent sa propre story qu’on partage : un média */
        { sender_name: "Tom", timestamp_ms: T(10), share: { link: "https://instagram.com/stories/tom.dlr/1" } },
      ),
    ).texte;
    expect(vus(texte)).toEqual([...Array<string>(5).fill("trop belle sur cette photo 😍 [réponse à une story]"), "média"]);
    const c = chiffres(texte);
    expect(c.medias).toEqual({ toi: { média: 1 }, autre: { "réponse à une story": 5 } });
    expect(c.recurrents.map(([w]) => w)).toEqual(["belle", "cette", "photo"]);
  });

  it("HTML : le lien de la story, seul dans son bloc, est retiré du texte", () => {
    const html = enHtml(
      blocHtml("Léa", `<div>trop belle 😍</div><div><div><div><a target="_blank" href="${story}">${story}</a></div></div></div>`, "Sep 08, 2025 5:57 am"),
      blocHtml(
        "Léa",
        `\n    <div>trop belle 😍</div>\n    <div><div><div>\n      <a target="_blank" href="${story}">\n        ${story}\n      </a>\n    </div></div></div>\n  `,
        "Sep 08, 2025 5:58 am",
      ),
      blocHtml("Tom", `<div><div><div><a target="_blank" href="${story}">${story}</a></div></div></div>`, "Sep 08, 2025 5:59 am"),
    );
    const texte = depuisInstagramHtml(html).texte;
    expect(vus(texte)).toEqual(["trop belle 😍 [réponse à une story]", "trop belle 😍 [réponse à une story]", "média"]);
    expect(leursMots(texte)).toEqual(["belle"]);
    expect(texte).not.toContain("instagram.com");
  });
});
