import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, DoneCheck, NoteIcone, TypingDots } from "@/components/ui/feedback";
import { citation, coinsDeBulle, GroupeBulles, placeDansLeGroupe } from "@/components/ui/messages";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { auMoins } from "../aide/listes";

/*
 * Ce que l’écran répond (src/components/ui/feedback.tsx) : le souci annoncé, la pastille « c’est fait », la note avec son
 * icône, les trois points de BLUSH ; et les bulles groupées de BLUSH (src/components/ui/messages.tsx). Un seul dessin
 * pour chacun, aux couleurs des tokens (danger, ok, muted).
 */

describe("Alert", () => {
  it("annonce le souci (role=alert) dans l’habillage demandé, au rouge du token danger", () => {
    render(
      <>
        <Alert>Ça n’a pas marché.</Alert>
        <Alert variant="carte" className="mb-3 text-center">
          Vérifie ta connexion.
        </Alert>
        <Alert variant="voile" data-souci="lien">
          Le lien n’a pas pu être créé.
        </Alert>
      </>,
    );
    const [texte, carte, voile] = auMoins(screen.getAllByRole("alert"), 3);
    expect(texte.tagName).toBe("P");
    expect(texte.className).toContain("text-danger");
    expect(texte.className).not.toContain("shadow-card");
    expect(carte.className).toContain("shadow-card");
    expect(carte.className).toContain("text-danger");
    expect(carte.className).toContain("text-center");
    expect(voile.className).toContain("text-danger-ink");
    expect(voile.dataset.souci).toBe("lien");
    for (const a of [texte, carte, voile]) expect(a.className).toContain("text-note");
  });
});

describe("DoneCheck", () => {
  it("la coche à un peu plus de la moitié de la pastille, l’ombre d’après sa taille", () => {
    const { container } = render(
      <>
        <DoneCheck size={20} />
        <DoneCheck size={26} />
        <DoneCheck size={48} glyphe={22} trait={3.2} />
        <DoneCheck size={32} glyphe={16} trait={3.2} ombre={false} />
        <DoneCheck size={40} />
      </>,
    );
    const pastilles = Array.from(container.children) as HTMLElement[];
    expect(pastilles.map((p) => p.querySelector("svg")!.getAttribute("width"))).toEqual(["11", "14", "22", "16", "22"]);
    expect(pastilles.map((p) => p.querySelector("svg")!.getAttribute("stroke-width"))).toEqual(["3.4", "3.4", "3.2", "3.2", "3.4"]);
    expect(pastilles[0]!.style.boxShadow).toContain("3px 8px -3px");
    expect(pastilles[2]!.style.boxShadow).toContain("8px 18px -8px");
    /* La coche du tableau de bord (32 px, coche de 16, trait de 3,2, sans ombre) */
    expect(pastilles[3]!.style.boxShadow).toBe("");
    /* 40 px : encore la petite ombre, la grande commence au-delà */
    expect(pastilles[4]!.style.boxShadow).toContain("3px 8px -3px");
    for (const p of pastilles) {
      expect(p.className).toContain("bg-ok");
      expect(p.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("avec un label, elle dit ce qu’elle montre", () => {
    render(<DoneCheck size={20} label="prêt" />);
    expect(screen.getByRole("img", { name: "prêt" })).toBeTruthy();
  });
});

describe("NoteIcone et NotePrivee", () => {
  it("une icône grise puis le texte ; serrée pour une note centrée", () => {
    const { container } = render(
      <NoteIcone icone="shield" taille={15} serree className="text-[12px]">
        Rien n’est gardé.
      </NoteIcone>,
    );
    const note = container.firstElementChild as HTMLElement;
    expect(note.className).toContain("gap-1.5");
    expect(note.className).toContain("text-[12px]");
    const icone = note.querySelector("svg")!;
    /* L’icône suit le token du gris du texte (currentColor teinté par text-grey), pas un hex écrit à la main */
    expect([icone.getAttribute("width"), icone.getAttribute("stroke"), icone.getAttribute("class")]).toEqual(["15", "currentColor", "text-grey"]);
    expect(note.textContent).toBe("Rien n’est gardé.");
  });

  it("NotePrivee garde ses trois dessins : le cadenas doux, le petit cadenas, le bouclier", () => {
    const { container } = render(
      <>
        <NotePrivee>a</NotePrivee>
        <NotePrivee petite>b</NotePrivee>
        <NotePrivee icone="shield">c</NotePrivee>
      </>,
    );
    /* Les gris par leurs tokens : muted (#8A8780) pour le cadenas doux, grey (#6B6862) pour les deux autres */
    const icones = Array.from(container.querySelectorAll("svg")).map((s) => [s.getAttribute("width"), s.getAttribute("stroke"), s.getAttribute("class"), s.getAttribute("stroke-width")]);
    expect(icones).toEqual([
      ["16", "currentColor", "text-muted", "2.2"],
      ["15", "currentColor", "text-grey", "2.2"],
      ["16", "currentColor", "text-grey", "2.2"],
    ]);
    const notes = Array.from(container.children) as HTMLElement[];
    expect(notes.map((n) => n.className.includes("text-[12.5px]"))).toEqual([false, true, false]);
    expect(notes[0]!.className).toContain("text-legende");
  });
});

describe("TypingDots", () => {
  it("dans le gris doux par défaut, de la couleur demandée sinon (currentColor compris), la perle en dernier", () => {
    const { container } = render(
      <>
        <TypingDots />
        <TypingDots color="#FFFFFF" label="Envoi" />
        <TypingDots color="currentColor" size={4} />
      </>,
    );
    const [doux, blanc, courant] = auMoins(Array.from(container.querySelectorAll<HTMLElement>("[data-dots]")), 3);
    expect(doux.className).toContain("text-muted");
    expect(doux.getAttribute("aria-hidden")).toBe("true");
    expect(blanc.style.color).toBe("#FFFFFF");
    expect(blanc.className).not.toContain("text-muted");
    expect(screen.getByRole("status", { name: "Envoi" })).toBe(blanc);
    expect(courant.style.color).toBe("currentcolor");
    const points = Array.from(courant.children) as HTMLElement[];
    expect(points.map((p) => p.style.width)).toEqual(["4px", "4px", "4px"]);
    expect(points.slice(0, 2).every((p) => p.className.includes("bg-current"))).toBe(true);
    expect(points[2]!.style.background).toContain("--degrade-perle");
  });
});

describe("Les bulles de BLUSH", () => {
  it("placeDansLeGroupe et coinsDeBulle : les coins resserrés du côté de l’expéditeur", () => {
    expect([0, 1, 2].map((i) => placeDansLeGroupe(i, 3))).toEqual(["first", "middle", "last"]);
    expect(placeDansLeGroupe(0, 1)).toBe("single");
    expect(coinsDeBulle("blush", "first")).toBe("rounded-bl-[6px]");
    expect(coinsDeBulle("toi", "last")).toBe("rounded-tr-[6px]");
    expect(coinsDeBulle("blush", "single")).toBe("");
  });

  it("GroupeBulles : le logo à côté de la dernière bulle, une cale à côté des autres", () => {
    const { container } = render(<GroupeBulles bulles={[<span key="a">une</span>, <span key="b">deux</span>, <span key="c">trois</span>]} />);
    const rangs = Array.from(container.firstElementChild!.children) as HTMLElement[];
    expect(rangs).toHaveLength(3);
    expect(rangs.map((r) => r.firstElementChild!.querySelector("svg") !== null || r.firstElementChild!.tagName === "svg")).toEqual([false, false, true]);
    expect(rangs[0]!.firstElementChild!.className).toContain("w-[34px]");
    expect(rangs[2]!.firstElementChild!.className).not.toContain("w-[34px]");
    const bulles = rangs.map((r) => r.lastElementChild as HTMLElement);
    expect(bulles.map((b) => b.textContent)).toEqual(["une", "deux", "trois"]);
    expect(bulles[0]!.className).toContain("rounded-bl-[6px]");
    expect(bulles[1]!.className).toContain("rounded-l-[6px]");
    expect(bulles[2]!.className).toContain("rounded-tl-[6px]");
    expect(rangs.map((r) => r.style.getPropertyValue("--d"))).toEqual(["0s", "0.08s", "0.16s"]);
  });

  it("une seule bulle garde ses quatre coins ronds", () => {
    const { container } = render(<GroupeBulles bulles={[<span key="a">seule</span>]} />);
    expect((container.querySelector("[data-rise]")!.lastElementChild as HTMLElement).className).not.toMatch(/rounded-(bl|tl|l)-\[6px\]/);
  });

  it("citation : le vrai message dans sa bulle, ce qu’on creuse en la glissant, ou un autre rendu du même message", () => {
    const msg = { from: "elle" as const, caption: "hier, 23 h 12", text: "t’es où ?" };
    const cite = citation(msg);
    expect(cite.quote).toBe("t’es où ?");
    expect(cite.className).toBe("pb-2.5 pt-3");
    render(<>{cite.body}</>);
    expect(screen.getByText("t’es où ?")).toBeTruthy();
    expect(screen.getByText("hier, 23 h 12")).toBeTruthy();
    expect(citation(msg, <b>replié</b>).body).toEqual(<b>replié</b>);
  });
});
