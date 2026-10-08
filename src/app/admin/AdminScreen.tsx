import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Chiffre, Periode, StatsAdmin } from "@/server/stats";

/*
 * Le tableau de bord de BLUSH : que des nombres (aucune conv, aucun message, aucun email). Une lecture d’un coup
 * d’œil en haut (les chiffres clés et leur tendance), puis le parcours d’une conv, l’activité jour par jour,
 * le partage, les coûts, la santé et la bêta. Textes relus le 8 octobre (voix de BLUSH).
 */

const N = " ";
const DEGRADE = "linear-gradient(90deg, #3D8BFF, #FF4F9A 60%, #12C08A)";
const nombre = (v: number) => v.toLocaleString("fr-FR");
const dollars = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${N}$`;
const pourcent = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}${N}%` : "–");
const PERIODES: [Periode, string][] = [
  [1, "24 h"],
  [7, "7 jours"],
  [30, "30 jours"],
];
const nomPeriode = (j: Periode) => (j === 1 ? "la veille" : `les ${j}${N}jours d’avant`);
/** Sous un chiffre clé : contre quoi se lit la tendance, en court (une ligne sur téléphone). */
const contre = (j: Periode) => (j === 1 ? "vs la veille" : `vs ${j}${N}j d’avant`);

function Carte({ titre, sous, droite, children, className }: { titre: string; sous?: ReactNode; droite?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-card bg-white p-5 shadow-card lg:p-6", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[17px] font-black tracking-[-0.01em]">{titre}</h2>
          {sous && <p className="m-0 text-[13px] font-extrabold text-grey">{sous}</p>}
        </div>
        {droite}
      </header>
      {children}
    </section>
  );
}

/** La tendance d’un chiffre, contre la période d’avant : en vert si ça monte, en rouge si ça baisse. */
function Tendance({ c, inverse = false }: { c: Chiffre; inverse?: boolean }) {
  const d = c.valeur - c.avant;
  const bien = inverse ? d < 0 : d > 0;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-[12px] font-black tabular-nums",
        d === 0 ? "bg-plaque text-grey" : bien ? "bg-[rgba(18,192,138,0.12)] text-vrai-ink" : "bg-[rgba(229,72,77,0.1)] text-[#C2363B]",
      )}
    >
      {d === 0 ? "=" : `${d > 0 ? "+" : "−"}${nombre(Math.abs(d))}`}
    </span>
  );
}

function Cle({ label, c, aide }: { label: string; c: Chiffre; aide: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-white p-4 shadow-card lg:p-5">
      <span className="text-[13px] font-black text-grey">{label}</span>
      <span className="text-[34px] font-black leading-none tracking-[-0.03em] tabular-nums">{nombre(c.valeur)}</span>
      <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-grey">
        <Tendance c={c} />
        {aide}
      </span>
    </div>
  );
}

/** Le parcours des convs importées sur la période : jusqu’où chacune est allée. */
function Parcours({ p }: { p: StatsAdmin["parcours"] }) {
  const etapes: [string, number][] = [
    ["Convs importées", p.importees],
    ["Liées à un compte", p.compte],
    ["Verdict lu", p.verdict],
    ["Rapport écrit", p.rapport],
    ["A parlé à BLUSH", p.chat],
  ];
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {etapes.map(([nom, v], k) => (
        <li key={nom} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-black">{nom}</span>
            <span className="flex items-baseline gap-2">
              {k > 0 && <span className="text-[12px] font-extrabold text-grey">{pourcent(v, etapes[k - 1][1])} de l’étape d’avant</span>}
              <span className="text-[16px] font-black tabular-nums">{nombre(v)}</span>
            </span>
          </div>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#F1EFEA]">
            <span className="block h-full rounded-full" style={{ width: p.importees ? `${Math.max(2, (v / p.importees) * 100)}%` : "0%", background: DEGRADE }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const SERIES = [
  { cle: "imports", nom: "Imports", couleur: "#FFC2DD" },
  { cle: "verdicts", nom: "Verdicts", couleur: "#FF4F9A" },
  { cle: "rapports", nom: "Rapports", couleur: "#121214" },
] as const;

/** Jour par jour : trois barres par jour (imports, verdicts, rapports). */
function Activite({ jours }: { jours: StatsAdmin["activite"] }) {
  const max = Math.max(1, ...jours.flatMap((j) => [j.imports, j.verdicts, j.rapports]));
  const pas = 30;
  const h = 150;
  const tous = jours.length > 14 ? 5 : 2;
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${jours.length * pas} ${h + 22}`} className="h-auto w-full" role="img" aria-label="Imports, verdicts et rapports, jour par jour">
        {[0.5, 1].map((t) => (
          <line key={t} x1={0} x2={jours.length * pas} y1={h - h * t} y2={h - h * t} stroke="#EFEDE8" strokeWidth={1} strokeDasharray="3 4" />
        ))}
        <line x1={0} x2={jours.length * pas} y1={h} y2={h} stroke="#E6E3DC" strokeWidth={1} />
        {jours.map((j, k) => (
          <g key={j.jour}>
            {SERIES.map((s, i) => {
              const v = j[s.cle];
              const hauteur = v ? Math.max(3, (v / max) * (h - 8)) : 0;
              return <rect key={s.cle} x={k * pas + 5 + i * 7} y={h - hauteur} width={6} height={hauteur} rx={3} fill={s.couleur}><title>{`${j.jour} · ${s.nom} : ${v}`}</title></rect>;
            })}
            {(jours.length - 1 - k) % tous === 0 && (
              <text x={k * pas + pas / 2} y={h + 16} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6B6862">
                {Number(j.jour.slice(8))}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3">
        {SERIES.map((s) => (
          <span key={s.cle} className="flex items-center gap-1.5 text-[12px] font-black text-soft">
            <span className="size-2.5 rounded-full" style={{ background: s.couleur }} />
            {s.nom}
            <span className="tabular-nums text-grey">{nombre(jours.reduce((t, j) => t + j[s.cle], 0))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Le partage, étape par étape : de la fenêtre ouverte à l’import d’un pote. */
function Partage({ p }: { p: StatsAdmin["partage"] }) {
  const etapes: [string, number, string][] = [
    ["Fenêtres ouvertes", p.ouvertures, "« Partager mon verdict » touché"],
    ["Aperçus dessinés", p.apercus, "le lien collé dans une conv"],
    ["Visites", p.visites, "des personnes, pas des robots"],
    ["« Analyser ma conv »", p.essais, "touché sur la page du verdict"],
    ["Imports", p.imports, "venus d’un verdict partagé"],
  ];
  return (
    <div className="flex flex-col gap-2">
      {etapes.map(([nom, v, aide], k) => (
        <div key={nom} className="flex items-center gap-3 rounded-[18px] bg-[#F8F7F4] px-3.5 py-2.5">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black", k === etapes.length - 1 ? "text-white [background:var(--rose-blush)]" : "bg-white text-ink shadow-soft")}>{k + 1}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-black">{nom}</span>
            <span className="truncate text-[12px] font-extrabold text-grey">{aide}</span>
          </span>
          <span className="text-[20px] font-black tabular-nums">{nombre(v)}</span>
        </div>
      ))}
      <p className="m-0 px-1 text-[12px] font-extrabold text-grey">
        {nombre(p.liens)} lien{p.liens > 1 ? "s" : ""} créé{p.liens > 1 ? "s" : ""} sur la période · {nombre(p.actifs)} actif{p.actifs > 1 ? "s" : ""} en tout
      </p>
    </div>
  );
}

function Couts({ c, jours }: { c: StatsAdmin["couts"]; jours: Periode }) {
  const max = Math.max(0.0001, ...c.postes.map((p) => p.dollars));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <span className="flex flex-col gap-1">
          <span className="text-[34px] font-black leading-none tracking-[-0.03em] tabular-nums">{dollars(c.total)}</span>
          <span className="text-[12px] font-extrabold text-grey">
            {dollars(c.avant)} {nomPeriode(jours)}
          </span>
        </span>
        <span className="flex gap-2">
          <Pastille label="par rapport" valeur={c.parRapport} />
          <Pastille label="par verdict" valeur={c.parVerdict} />
        </span>
      </div>
      {c.postes.length ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {c.postes.map((p) => (
            <li key={p.nom} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3">
              <span className="text-[13px] font-black">{p.nom}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[#F1EFEA]">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(2, (p.dollars / max) * 100)}%` }} />
              </span>
              <span className="text-[13px] font-black tabular-nums">
                {dollars(p.dollars)} <span className="font-extrabold text-grey">· {nombre(p.appels)} appel{p.appels > 1 ? "s" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] font-extrabold text-grey">Aucun appel au modèle sur la période.</p>
      )}
    </div>
  );
}

function Pastille({ label, valeur }: { label: string; valeur: number | null }) {
  return (
    <span className="flex flex-col rounded-[14px] bg-plaque px-3 py-1.5">
      <span className="text-[15px] font-black tabular-nums">{valeur == null ? "–" : dollars(valeur)}</span>
      <span className="text-[11px] font-extrabold text-grey">{label}</span>
    </span>
  );
}

function Sante({ s }: { s: StatsAdmin["sante"] }) {
  const calme = !s.echecs.length && !s.bloquees;
  return (
    <div className="flex flex-col gap-3">
      {calme ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-[rgba(18,192,138,0.1)] px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A" }}>
            <Icon name="check" size={16} color="#FFFFFF" stroke={3.2} />
          </span>
          <span className="text-[14px] font-black text-vrai-ink">Rien à signaler</span>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {s.echecs.map((e) => (
            <li key={e.code} className="flex items-center justify-between gap-3 rounded-[14px] bg-[rgba(229,72,77,0.07)] px-3.5 py-2">
              <span className="font-mono text-[13px] font-bold text-[#C2363B]">{e.code}</span>
              <span className="text-[14px] font-black tabular-nums">{nombre(e.n)}</span>
            </li>
          ))}
          {s.bloquees > 0 && (
            <li className="flex items-center justify-between gap-3 rounded-[14px] bg-[rgba(255,170,44,0.12)] px-3.5 py-2">
              <span className="text-[13px] font-black text-[#A86500]">Tâches bloquées (relancées au prochain passage)</span>
              <span className="text-[14px] font-black tabular-nums">{nombre(s.bloquees)}</span>
            </li>
          )}
        </ul>
      )}
      <div className="flex gap-2">
        <Pastille2 label="en cours" v={s.enCours} />
        <Pastille2 label="en attente" v={s.enAttente} />
      </div>
    </div>
  );
}

function Pastille2({ label, v }: { label: string; v: number }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-full bg-plaque px-3 py-1.5 text-[12px] font-extrabold text-grey">
      <span className="text-[14px] font-black tabular-nums text-ink">{nombre(v)}</span>
      {label}
    </span>
  );
}

function Beta({ b }: { b: StatsAdmin["beta"] }) {
  const lignes: [string, ReactNode, string?][] = [
    ["Liste d’attente", nombre(b.attente), b.attenteNouveaux ? `+${nombre(b.attenteNouveaux)} sur la période` : undefined],
    ["Comptes", nombre(b.comptes)],
    ["Invités", b.invites === "tous" ? "tout le monde" : nombre(b.invites), "BLUSH_ACCES_LIBRE"],
  ];
  return (
    <div className="flex flex-col">
      {lignes.map(([nom, v, aide], k) => (
        <div key={nom} className={cn("flex items-center justify-between gap-3 py-2.5", k > 0 && "border-t-2 border-sep")}>
          <span className="flex flex-col">
            <span className="text-[14px] font-black">{nom}</span>
            {aide && <span className="text-[12px] font-extrabold text-grey">{aide}</span>}
          </span>
          <span className="text-[20px] font-black tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** `base` : l’adresse de la page, à laquelle s’ajoute `?p=` pour changer de période. */
export function AdminScreen({ s, base = "/admin" }: { s: StatsAdmin; base?: string }) {
  const heure = new Date(s.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const avant = contre(s.jours);
  return (
    <main className="min-h-dvh bg-paper pb-16">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 pt-5 lg:px-8 lg:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={30} fontSize={22} href="/" />
            <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-black text-white">Admin</span>
          </div>
          <nav aria-label="Période" className="flex rounded-full bg-[#E9E6DF] p-1">
            {PERIODES.map(([j, nom]) => (
              <Link
                key={j}
                href={`${base}?p=${j}`}
                aria-current={j === s.jours ? "page" : undefined}
                className={cn("flex h-8 items-center rounded-full px-3.5 text-[13px] font-black no-underline", j === s.jours ? "bg-white text-ink shadow-soft" : "text-soft hover:text-ink")}
              >
                {nom}
              </Link>
            ))}
          </nav>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-black leading-[1.05] tracking-[-0.03em] lg:text-[42px]">Tableau de bord</h1>
          <p className="m-0 text-[14px] font-extrabold text-grey">
            Mis à jour à {heure} · {s.beta.fermee ? "bêta fermée" : "ouvert à tous"} · que des nombres, aucune conv
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Cle label="Nouveaux comptes" c={s.cles.comptes} aide={avant} />
          <Cle label="Convs importées" c={s.cles.convs} aide={avant} />
          <Cle label="Verdicts" c={s.cles.verdicts} aide={avant} />
          <Cle label="Rapports écrits" c={s.cles.rapports} aide={avant} />
          <Cle label="Messages au chat" c={s.cles.messages} aide={avant} />
          <Cle label="Actifs au chat" c={s.cles.actifs} aide="comptes" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Carte titre="Le parcours d’une conv" sous="Les convs importées sur la période, et jusqu’où elles sont allées">
            <Parcours p={s.parcours} />
          </Carte>
          <Carte titre="Jour par jour" sous={`Les ${s.activite.length}${N}derniers jours, heure de Paris`}>
            <Activite jours={s.activite} />
          </Carte>
          <Carte titre="Le partage" sous="Du verdict partagé à la conv d’un pote">
            <Partage p={s.partage} />
          </Carte>
          <Carte titre="Coûts de l’IA" sous="Claude, en dollars, sur la période">
            <Couts c={s.couts} jours={s.jours} />
          </Carte>
          <Carte titre="Santé" sous="Échecs sur la période, et les tâches en ce moment">
            <Sante s={s.sante} />
          </Carte>
          <Carte titre="Bêta" sous="Qui attend, qui est entré">
            <Beta b={s.beta} />
          </Carte>
        </div>

        <p className="m-0 flex items-start gap-2 text-[12px] font-extrabold leading-[1.5] text-grey">
          <Icon name="shield" size={15} color="#6B6862" stroke={2.2} style={{ marginTop: 1 }} />
          Que des nombres{N}: aucune conv, aucun message, aucun email n’apparaît ici. Une conv effacée (par son auteur ou par la purge) sort des comptes.
        </p>
      </div>
    </main>
  );
}
