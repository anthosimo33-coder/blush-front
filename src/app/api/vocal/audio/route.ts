import { contexteRequete } from "@/server/donnees";
import { erreur } from "@/server/http";
import { audioDe } from "@/server/vocal";

/**
 * L’audio du vocal de l’histoire ouverte (MP3), déchiffré à la volée. Son adresse change avec le vocal (`?v=`) : le
 * navigateur peut le garder. Safari lit l’audio par morceaux : on répond aux demandes de plage (Range).
 */
export async function GET(req: Request) {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const audio = await audioDe(story.id);
  if (!audio) return erreur("pas_pret", 404);
  const entetes = { "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=31536000, immutable" };
  const plage = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (plage && (plage[1] || plage[2])) {
    const total = audio.length;
    const debut = plage[1] ? +plage[1] : Math.max(0, total - +plage[2]);
    const fin = plage[1] && plage[2] ? Math.min(+plage[2], total - 1) : total - 1;
    if (debut >= total || debut > fin) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(new Uint8Array(audio.subarray(debut, fin + 1)), {
      status: 206,
      headers: { ...entetes, "content-range": `bytes ${debut}-${fin}/${total}`, "content-length": String(fin - debut + 1) },
    });
  }
  return new Response(new Uint8Array(audio), { headers: { ...entetes, "content-length": String(audio.length) } });
}
