import type { Route } from "next";
import Link from "next/link";
import { Fragment, useId } from "react";
import { jourEnLettres, NBSP } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { LiensJuridiques } from "@/components/juridique/pages";
import { CtaButton } from "@/components/landing/CtaButton";
import { ctaDe } from "@/components/landing/cta";
import { LIGNES_D_ECOUTE, LIGNES_PAR_SITUATION, URGENCES } from "@/contenu/aide";
import type { Jour, Zone } from "@/contenu/articles/types";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { prixDe } from "@/contenu/offres";

/*
 * Les pièces communes aux pages des guides et du lexique (PageArticle, HubArticles), rendues sur le serveur : le fil
 * d’Ariane, le bloc d’aide, l’appel à importer sa conv et la phrase de BLUSH qui ferme la page. Rien ici ne tourne dans
 * le navigateur.
 */

/** Une date d’article, en lettres (« 3 novembre 2026 »), lisible par les machines (`dateTime`). */
export function DateEnLettres({ jour }: { jour: Jour }) {
  return <time dateTime={jour}>{jourEnLettres(jour, { annee: true })}</time>;
}

/**
 * Le fil d’Ariane, au-dessus du titre : de BLUSH (la landing) à la page, la dernière étape sans lien. Les mêmes étapes
 * que celles des données structurées (src/lib/donnees-structurees.tsx, BreadcrumbList).
 */
export function FilDAriane({ etapes }: { etapes: readonly { nom: string; href?: Route }[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="text-legende font-extrabold text-grey">
      {/* Sur une ligne : la page où l’on est (son titre, déjà en grand dessous) se coupe la première */}
      <ol className="m-0 flex list-none items-center gap-x-1.5 p-0">
        {etapes.map(({ nom, href }, k) => (
          <Fragment key={nom}>
            {k > 0 && (
              <li aria-hidden="true" className="shrink-0 text-pale">
                ›
              </li>
            )}
            <li className={href ? "shrink-0" : "min-w-0 flex-1 truncate"}>
              {href ? (
                <Link href={href} className="text-soft no-underline hover:text-ink">
                  {nom}
                </Link>
              ) : (
                <span aria-current="page">{nom}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Le bloc d’aide d’une page orange ou rouge : les numéros d’urgence, les lignes d’écoute et les lignes par situation de
 * src/contenu/aide.ts, tels qu’ils sont (un numéro changé là change ici), chacun à un toucher ; le 3018 a aussi son
 * tchat, comme sur la feuille du rapport doux. `niveau` : celui de son titre, h3 dans une section, h2 en tête de page
 * (la zone rouge), pour que les titres se suivent sans sauter de marche.
 */
export function BlocAide({ niveau = 3 }: { niveau?: 2 | 3 }) {
  const titre = useId();
  const Titre = niveau === 2 ? "h2" : "h3";
  return (
    <aside aria-labelledby={titre} className="flex flex-col gap-3 rounded-[22px] bg-white px-4 py-4 shadow-card">
      <Titre id={titre} className="m-0 flex items-center gap-2 text-carte font-black text-ink">
        <Icon name="shield" size={20} stroke={2.3} className="text-vrai-ink" />
        Besoin d’en parler{NBSP}?
      </Titre>
      <p className="m-0 text-detail font-extrabold leading-[1.5] text-soft">{URGENCES}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {LIGNES_D_ECOUTE.map((l) => (
          <li key={l.tel} className="flex flex-col">
            <a href={`tel:${l.tel}`} className="text-detail font-black text-toi-ink no-underline hover:underline">
              {l.name} · {l.label}
            </a>
            <span className="text-legende font-extrabold text-grey">{l.detail}</span>
          </li>
        ))}
        {LIGNES_PAR_SITUATION.map((s) => {
          const nouvelOnglet = s.lien.startsWith("https:") ? { target: "_blank", rel: "noreferrer" } : {};
          return (
            <li key={s.label} className="flex flex-col">
              <a href={s.lien} {...nouvelOnglet} className="text-detail font-black text-toi-ink no-underline hover:underline">
                {s.name} · {s.label}
              </a>
              <span className="text-legende font-extrabold text-ink">{s.pour}</span>
              <span className="text-legende font-extrabold text-grey">{s.detail}</span>
              {"tchat" in s && (
                <a href={s.tchat} target="_blank" rel="noreferrer" aria-label={`Écrire en tchat au ${s.label}`} className="text-legende font-black text-toi-ink">
                  Écrire en tchat
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/**
 * L’appel à importer sa conv, tiré du code : le bouton et la ligne qui rassure de la landing (cta.ts), le prix du rapport
 * lu dans le catalogue (src/contenu/offres.ts), jamais écrits à la main dans un article.
 * TODO(produit): l’appel sur les pages sensibles (décision n° 6 du plan SEO) ; en attendant, la recommandation : le
 * bouton en zone verte et orange (après le bloc d’aide), un simple lien en zone rouge.
 */
export function AppelImport({ zone }: { zone: Zone }) {
  const cta = ctaDe(null);
  if (zone === "rouge")
    return (
      <p className="m-0 text-detail font-extrabold leading-[1.5] text-soft">
        Tu veux une lecture de ta conv{NBSP}?{" "}
        <Link href={cta.href} className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
          Importe-la sur BLUSH
        </Link>
        .
      </p>
    );
  return (
    <section aria-labelledby="importer-titre" className="flex flex-col items-center gap-3 rounded-[26px] bg-white px-5 pb-6 pt-6 text-center shadow-card">
      <h2 id="importer-titre" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
        Tu veux savoir pour toi{NBSP}?
      </h2>
      <p className="m-0 max-w-[460px] text-detail font-extrabold leading-[1.5] text-soft">
        Importe ta conv{NBSP}: captures, enregistrement d’écran, export Instagram ou WhatsApp. BLUSH la lit et te dit ce qui se passe vraiment entre vous.
      </p>
      <CtaButton retour={null} className="mt-2 w-full max-w-[340px]" />
      <span className="text-note font-extrabold text-grey">{cta.note}</span>
      <span className="text-legende font-extrabold text-grey">
        Le rapport{NBSP}: {prixDe("rapport")}
      </span>
    </section>
  );
}

/** Le pied d’une page des guides ou du lexique : la phrase de BLUSH, puis les pages légales. */
export function PiedArticle() {
  return (
    <footer className="mt-10 flex flex-col items-center gap-5 border-t border-line pt-6 text-center">
      <p className="m-0 max-w-[480px] text-note font-extrabold leading-[1.5] text-grey">{PHRASE_D_IDENTITE}</p>
      <LiensJuridiques />
    </footer>
  );
}
