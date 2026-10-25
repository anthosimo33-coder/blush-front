import "server-only";
import { sql } from "drizzle-orm";
import { ETAPES_VISITE, type EtapeVisite, type GenreFil, type OffreId, type SourceVisite } from "@/types";
import type { Direct, GesteDuFil } from "@/types/api";
import { db, uneLigne } from "./db";
import { DEBUT_DU_JOUR, aujourdhuiParis } from "./temps";
import { EN_LIGNE_S } from "./visites";

/*
 * /admin en direct : qui est sur le site en ce moment (les onglets qui ont fait signe depuis EN_LIGNE_S), où ils en sont,
 * d’où ils arrivent, de quelle ville, et le fil des derniers gestes. Que des nombres, des villes et des écrans : ni
 * compte, ni email, ni conv, ni adresse IP (src/server/visites.ts).
 */

const lignes = async <T>(q: ReturnType<typeof sql>) => (await db().execute(q)).rows as T[];
const n = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => new Date(v as string).toISOString();

/** Combien de gestes le fil montre au plus. */
const GESTES_DU_FIL = 30;

/** /admin en direct, à cet instant. */
export async function direct(): Promise<Direct> {
  const [onglets, minutes, records, gestes, jour] = await Promise.all([
    /* Chaque onglet en ligne, d’après son dernier signe */
    lignes<{ etape: EtapeVisite; source: SourceVisite; ville: string | null; pays: string | null; lat: number | null; lon: number | null }>(
      sql`select distinct on (onglet) etape, source, ville, pays, lat, lon from presences
          where vu_le > now() - make_interval(secs => ${EN_LIGNE_S}) order by onglet, vu_le desc`,
    ),
    lignes<{ minute: string; n: string }>(
      sql`select m as minute, count(p.onglet) as n
          from generate_series(date_trunc('minute', now()) - interval '29 minutes', date_trunc('minute', now()), interval '1 minute') as m
          left join presences p on p.minute = m group by m order by m`,
    ),
    lignes<{ minute: string; n: string }>(sql`select minute, count(*) as n from presences where minute >= ${DEBUT_DU_JOUR} group by minute order by n desc, minute desc limit 1`),
    /* Un achat avec le prix payé, retrouvé par sa ref (pas celui du catalogue, qui a pu changer depuis, ou un lot de la roue) */
    lignes<LigneDuFil>(
      sql`select f.genre, f.ville, f.source, f.offre, f.le, (select a.centimes from achats a where f.genre = 'achat' and a.id::text = f.ref) as centimes
          from fil_direct f where f.le > now() - interval '24 hours' order by f.le desc, f.id desc limit ${GESTES_DU_FIL}`,
    ),
    lignes<{ visiteurs: string; achats: string; centimes: string }>(
      sql`select (select count(*) from visites where jour = ${aujourdhuiParis().iso}) as visiteurs,
            (select count(*) from achats where paye_le >= ${DEBUT_DU_JOUR}) as achats,
            (select coalesce(sum(centimes), 0) from achats where paye_le >= ${DEBUT_DU_JOUR}) as centimes`,
    ).then((l) => uneLigne(l, "direct:jour")),
  ]);

  const etapes = new Map<EtapeVisite, number>();
  const sources = new Map<SourceVisite, number>();
  const villes = new Map<string, Direct["villes"][number]>();
  for (const o of onglets) {
    etapes.set(o.etape, (etapes.get(o.etape) ?? 0) + 1);
    sources.set(o.source, (sources.get(o.source) ?? 0) + 1);
    const cle = `${o.ville ?? ""}|${o.pays ?? ""}`;
    const v = villes.get(cle);
    if (v) v.n += 1;
    else villes.set(cle, { ville: o.ville, pays: o.pays, lat: o.lat, lon: o.lon, n: 1 });
  }
  const parNombre = <T extends { n: number }>(xs: T[]) => xs.sort((a, b) => b.n - a.n);
  const record = records[0];

  return {
    le: new Date().toISOString(),
    enLigne: onglets.length,
    etapes: ETAPES_VISITE.map((etape) => ({ etape, n: etapes.get(etape) ?? 0 })),
    sources: parNombre([...sources].map(([source, k]) => ({ source, n: k }))),
    villes: parNombre([...villes.values()]),
    minutes: minutes.map((m) => ({ le: iso(m.minute), n: n(m.n) })),
    record: record ? { n: n(record.n), le: iso(record.minute) } : null,
    fil: gestes.map(gesteDuFil).filter((g): g is GesteDuFil => g !== null),
    jour: { visiteurs: n(jour.visiteurs), achats: n(jour.achats), centimes: n(jour.centimes) },
  };
}

/** Une ligne du fil lue en base, et le prix payé de son achat (null : pas un achat, ou un achat sans ref). */
type LigneDuFil = { genre: GenreFil; ville: string | null; source: SourceVisite | null; offre: OffreId | null; le: string; centimes: number | null };

/** Une ligne du fil, sous la forme de son genre ; null : une ligne incomplète (une arrivée sans source, un achat sans offre). */
function gesteDuFil(l: LigneDuFil): GesteDuFil | null {
  const base = { ville: l.ville, le: iso(l.le) };
  if (l.genre === "arrivee") return l.source ? { genre: l.genre, ...base, source: l.source } : null;
  if (l.genre === "paiement") return l.offre ? { genre: l.genre, ...base, offre: l.offre } : null;
  if (l.genre === "achat") return l.offre ? { genre: l.genre, ...base, offre: l.offre, ...(l.centimes !== null && { centimes: n(l.centimes) }) } : null;
  return { genre: l.genre, ...base };
}
