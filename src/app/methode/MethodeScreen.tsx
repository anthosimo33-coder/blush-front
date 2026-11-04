import { cn } from "@/lib/cn";
import { CONTENEUR, GRILLE_DE_LECTURE, PageEditoriale } from "@/components/article/cadre";
import { DansCeGuide, Intertitre, TexteDeSection, type EntreeDuSommaire } from "@/components/article/texte";
import { EnTeteDeConfiance, LigneVers, LIGNES } from "@/components/juridique/confiance";
import { Icon } from "@/components/ui/icons";
import type { Bloc } from "@/contenu/conditions";
import { EDITEUR } from "@/contenu/mentions-legales";
import { METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";

/*
 * /methode, rendue sur le serveur dans l’habit des guides (le cadre « Magazine ») : le grand titre (« nos guides » dans
 * la bulle rose), le chapeau et la signature, puis chaque règle de src/contenu/pages-de-confiance.ts comme une section
 * de guide (son numéro, son intertitre, sa première phrase en attaque), le sommaire collé à gauche sur un ordinateur. Ce
 * qu’on n’écrit jamais, en croix (comme « Les pièges » d’un guide) ; sous la dernière règle, où signaler une erreur
 * (l’email de l’éditeur), les mentions légales (le directeur de la publication, dont la relecture parle) et les numéros
 * d’aide ; puis la fin rose de la landing.
 * Les guides y mènent depuis leur signature et leur fiche (src/components/article/pieces.tsx).
 */

/** La règle dont la liste se lit en croix : ce qu’on n’écrit jamais. */
const JAMAIS = "jamais";

/** La règle sous laquelle on peut nous écrire : ses lignes vers l’email, les mentions légales et l’aide la suivent. */
const ERREUR = "erreur";

/** Les paragraphes et les listes d’une règle, en morceaux d’article : la première phrase en attaque, les puces roses. */
const enBlocs = (blocs: readonly Bloc[]) => blocs.map((b) => (typeof b === "string" ? ({ type: "paragraphe", texte: b } as const) : ({ type: "liste", elements: b } as const)));

/** Ce qu’on n’écrit jamais : chaque ligne barrée d’une croix ambre, dans une carte, comme « Les pièges » d’un guide. */
function EnCroix({ lignes }: { lignes: readonly string[] }) {
  return (
    <ul className="m-0 mt-2 list-none overflow-hidden rounded-[26px] bg-white px-5 shadow-card ordi:rounded-[32px] ordi:px-8">
      {lignes.map((l) => (
        <li key={l} className="flex gap-3.5 border-t border-sep py-4 text-[16px] font-extrabold leading-[1.5] text-ink first:border-t-0 ordi:py-5 ordi:text-[17px]">
          <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fff1dc] text-attente-ink">
            <Icon name="close" size={13} stroke={3} />
          </span>
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}

/** La page : ses règles, puis signaler une erreur, les mentions légales et les numéros d’aide. */
export function MethodeScreen() {
  const entrees: EntreeDuSommaire[] = METHODE.sections.map((s, k) => ({ id: s.id, titre: s.titre, rang: k + 1, numero: k + 1 }));
  return (
    <PageEditoriale rubrique={{ nom: METHODE.court, chemin: "/methode" }} surLaRubrique fin="vente" bouton={false} ici="/methode">
      <EnTeteDeConfiance titre={METHODE.titre} surligne={METHODE.surligne} sous={METHODE.sous} misAJourLe={METHODE.misAJourLe} className={cn(CONTENEUR, "pt-8 ordi:pt-20")} />

      <div data-lecture="" className={cn(CONTENEUR, GRILLE_DE_LECTURE, "mt-12 ordi:mt-20")}>
        {/* Sur un ordinateur, le sommaire collé à gauche des règles ; sur un téléphone, les règles se suivent, sans rien à empiler devant */}
        <div className="hidden ordi:col-start-1 ordi:row-start-1 ordi:block" style={{ gridRowEnd: `span ${entrees.length + 1}` }}>
          <DansCeGuide titre="Dans cette page" entrees={entrees} className="ordi:sticky ordi:top-28" />
        </div>

        {/* Les règles se touchent (leur écart en rembourrage, pas en marge) : la bande où le sommaire lit la règle en cours ne tombe jamais entre deux */}
        {METHODE.sections.map((s, k) => (
          <section key={s.id} aria-labelledby={s.id} data-section={k + 1} className={cn("ordi:col-start-2", k > 0 && "pt-16 ordi:pt-24")}>
            <Intertitre id={s.id} numero={k + 1}>
              {s.titre}
            </Intertitre>
            {s.id === JAMAIS ? <EnCroix lignes={s.blocs.flatMap((b) => (typeof b === "string" ? [b] : b))} /> : <TexteDeSection morceaux={enBlocs(s.blocs)} />}
            {s.id === ERREUR && (
              <ul className={cn(LIGNES, "mt-8 overflow-hidden rounded-[26px] bg-white shadow-card ordi:mt-10 ordi:rounded-[32px]")}>
                <li>
                  <LigneVers href={`mailto:${EDITEUR.email}`} icone="mail" ton="toi" titre={METHODE.signaler} sous={EDITEUR.email} />
                </li>
                <li>
                  {/* La ligne vers les mentions légales, où le directeur de la publication est nommé (la règle « Relu et validé » y renvoie) */}
                  <LigneVers href="/mentions-legales" icone="list" titre={METHODE.mentions} sous={METHODE.mentionsSous} />
                </li>
                <li>
                  <LigneVers href="/aide" icone="phone" ton="vrai" titre={PAGE_AIDE.court} />
                </li>
              </ul>
            )}
          </section>
        ))}
      </div>
    </PageEditoriale>
  );
}
