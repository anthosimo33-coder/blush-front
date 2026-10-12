import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXTES_GRILLE } from "@/app/importer/captures/parts";
import { ReorderGrid } from "@/components/ui/ReorderGrid";

/*
 * La grille à réordonner (src/components/ui/ReorderGrid.tsx), seule, avec les textes des captures : le clavier, la
 * souris et l’appui maintenu au doigt déplacent une case, la croix ou Suppr la retirent, et rien ne bouge quand elle
 * est figée (pendant l’envoi). L’écran qui la porte (CapturesScreen) a ses tests de bout en bout (instagram-captures-*).
 */

type Case = { id: string };

/** La grille, avec l’état que l’écran tient : l’ordre, les retraits, la dernière annonce. */
function Grille({ ids, fige, onAdd }: { ids: string[]; fige?: boolean; onAdd?: () => void }) {
  const [items, setItems] = useState<Case[]>(ids.map((id) => ({ id })));
  const [annonce, setAnnonce] = useState("");
  const move = (id: string, to: number) =>
    setItems((list) => {
      const next = list.filter((s) => s.id !== id);
      next.splice(to, 0, { id });
      return next;
    });
  return (
    <>
      <ReorderGrid
        items={items}
        onMove={move}
        onRemove={(id) => setItems((list) => list.filter((s) => s.id !== id))}
        onAnnounce={setAnnonce}
        fige={fige}
        rendu={(s, position) => (
          <span data-testid="case">
            {s.id}:{position}
          </span>
        )}
        ajout={onAdd && { onAdd, rendu: <span>+</span> }}
        textes={TEXTES_GRILLE}
        sous={<p data-testid="sous">sous la grille</p>}
        aide="Glisse pour changer l’ordre."
      />
      <p data-testid="annonce">{annonce}</p>
    </>
  );
}

/** L’ordre affiché, case par case (« id:position »). */
const ordre = () => screen.getAllByTestId("case").map((c) => c.textContent);
const poignee = (position: number, total: number) => screen.getByRole("button", { name: `Capture ${position} sur ${total}` });
const annonce = () => screen.getByTestId("annonce").textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ReorderGrid", () => {
  it("se lit comme une liste ordonnée, chaque case avec sa position et l’aide du geste dès qu’il y en a deux", () => {
    const { unmount } = render(<Grille ids={["a", "b", "c"]} onAdd={() => {}} />);
    expect(screen.getByRole("list", { name: "Tes captures, dans l’ordre" })).toBeTruthy();
    expect(ordre()).toEqual(["a:1", "b:2", "c:3"]);
    /* L’aide est rendue par la grille, après ce qui se dit sous elle, et chaque case la désigne */
    const aide = screen.getByText("Glisse pour changer l’ordre.");
    expect(aide.id).not.toBe("");
    expect(poignee(2, 3).getAttribute("aria-describedby")).toBe(aide.id);
    expect(screen.getByTestId("sous").compareDocumentPosition(aide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajouter des captures" })).toBeTruthy();
    unmount();
    /* Une seule case, et sans `ajout` : ni aide, ni case d’ajout */
    render(<Grille ids={["a"]} />);
    expect(poignee(1, 1).getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("Glisse pour changer l’ordre.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ajouter des captures" })).toBeNull();
  });

  it("au clavier : les flèches déplacent (haut et bas d’une ligne de trois), sans sortir de la grille, et l’annoncent", async () => {
    render(<Grille ids={["a", "b", "c", "d", "e"]} />);
    fireEvent.keyDown(poignee(1, 5), { key: "ArrowRight" });
    expect(ordre()).toEqual(["b:1", "a:2", "c:3", "d:4", "e:5"]);
    expect(annonce()).toBe("Capture déplacée en position 2.");
    /* Le focus suit la case déplacée, à l’image suivante */
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(document.activeElement?.textContent).toBe("a:2");
    fireEvent.keyDown(poignee(2, 5), { key: "ArrowDown" });
    expect(ordre()).toEqual(["b:1", "c:2", "d:3", "e:4", "a:5"]);
    expect(annonce()).toBe("Capture déplacée en position 5.");
    fireEvent.keyDown(poignee(5, 5), { key: "ArrowUp" });
    expect(ordre()).toEqual(["b:1", "a:2", "c:3", "d:4", "e:5"]);
    /* Au bord : rien ne bouge, rien ne s’annonce */
    fireEvent.keyDown(poignee(1, 5), { key: "ArrowLeft" });
    fireEvent.keyDown(poignee(1, 5), { key: "ArrowUp" });
    expect(ordre()).toEqual(["b:1", "a:2", "c:3", "d:4", "e:5"]);
    expect(annonce()).toBe("Capture déplacée en position 2.");
    /* Vers le bas depuis l’avant-dernière ligne : bornée à la dernière case (la 4 + 3 n’existe pas), et annoncée */
    fireEvent.keyDown(poignee(4, 5), { key: "ArrowDown" });
    expect(ordre()).toEqual(["b:1", "a:2", "c:3", "e:4", "d:5"]);
    expect(annonce()).toBe("Capture déplacée en position 5.");
    /* Déjà dernière : rien ne bouge */
    fireEvent.keyDown(poignee(5, 5), { key: "ArrowRight" });
    fireEvent.keyDown(poignee(5, 5), { key: "ArrowDown" });
    expect(ordre()).toEqual(["b:1", "a:2", "c:3", "e:4", "d:5"]);
  });

  it("Suppr, Retour arrière ou la croix retirent la case", () => {
    render(<Grille ids={["a", "b", "c"]} />);
    fireEvent.keyDown(poignee(2, 3), { key: "Delete" });
    expect(ordre()).toEqual(["a:1", "c:2"]);
    fireEvent.keyDown(poignee(1, 2), { key: "Backspace" });
    expect(ordre()).toEqual(["c:1"]);
    fireEvent.click(screen.getByRole("button", { name: "Retirer la capture 1" }));
    expect(screen.queryAllByTestId("case")).toEqual([]);
  });

  it("à la souris : un glisser de plus de 6 px soulève la case, la case survolée prend sa place, le lâcher l’annonce", () => {
    render(<Grille ids={["a", "b", "c"]} />);
    const a = poignee(1, 3);
    /* Le bouton droit ne prend rien */
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 30, clientY: 10 });
    expect(a.className).not.toContain("cursor-grabbing");
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    /* Un petit tremblement : rien ne se soulève */
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 13, clientY: 12 });
    expect(a.className).not.toContain("cursor-grabbing");
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 30, clientY: 10 });
    expect(a.className).toContain("cursor-grabbing");
    /* Au-dessus de la troisième case */
    const c = screen.getAllByRole("listitem")[2]!;
    const sous = vi.spyOn(document, "elementFromPoint").mockReturnValue(c);
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 200, clientY: 10 });
    expect(sous).toHaveBeenCalledWith(200, 10);
    expect(ordre()).toEqual(["b:1", "c:2", "a:3"]);
    expect(annonce()).toBe("");
    const retire = vi.spyOn(window, "removeEventListener");
    fireEvent.pointerUp(a, { pointerId: 1, pointerType: "mouse" });
    /* Le défilement de la page, bloqué pendant le glisser, est rendu */
    expect(retire).toHaveBeenCalledWith("touchmove", expect.any(Function));
    expect(annonce()).toBe("Capture déplacée en position 3.");
    expect(poignee(3, 3).className).toContain("cursor-grab");
    expect(poignee(3, 3).className).not.toContain("cursor-grabbing");
  });

  it("au doigt : un appui maintenu soulève la case ; un balayage fait défiler la page, sans rien soulever", () => {
    vi.useFakeTimers();
    render(<Grille ids={["a", "b"]} />);
    const a = poignee(1, 2);
    /* Un balayage : plus de 10 px avant la fin de l’appui */
    fireEvent.pointerDown(a, { pointerId: 2, pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(a, { pointerId: 2, pointerType: "touch", clientX: 10, clientY: 40 });
    act(() => vi.advanceTimersByTime(500));
    expect(a.className).not.toContain("cursor-grabbing");
    /* Un appui maintenu : soulevée après 230 ms */
    fireEvent.pointerDown(a, { pointerId: 3, pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(229));
    expect(a.className).not.toContain("cursor-grabbing");
    const pose = vi.spyOn(window, "addEventListener");
    act(() => vi.advanceTimersByTime(1));
    expect(a.className).toContain("cursor-grabbing");
    /* Pendant le glisser, la page ne défile pas ; une annulation (un appel, une alerte) le rend, avec le même écouteur */
    const bloque = pose.mock.calls.find(([type]) => type === "touchmove")?.[1];
    expect(bloque).toBeTypeOf("function");
    const retire = vi.spyOn(window, "removeEventListener");
    fireEvent.pointerCancel(a, { pointerId: 3, pointerType: "touch" });
    expect(retire).toHaveBeenCalledWith("touchmove", bloque);
    expect(a.className).not.toContain("cursor-grabbing");
    expect(annonce()).toBe("Capture déplacée en position 1.");
  });

  it("à la souris : lâchée hors de la grille, la case se pose et l’annonce ; survoler ensuite, bouton relâché, ne déplace plus rien", () => {
    render(<Grille ids={["a", "b", "c"]} />);
    const a = poignee(1, 3);
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 30, clientY: 10 });
    const [premiere, , troisieme] = screen.getAllByRole("listitem");
    const sous = vi.spyOn(document, "elementFromPoint").mockReturnValue(troisieme!);
    /* Le pointeur n’est plus sur la case (React l’a déplacée) : le mouvement arrive ailleurs dans la page */
    fireEvent.pointerMove(document.body, { pointerId: 1, pointerType: "mouse", clientX: 200, clientY: 10 });
    expect(ordre()).toEqual(["b:1", "c:2", "a:3"]);
    /* Lâchée au-dessus de la grille, sur le titre de l’écran */
    fireEvent.pointerUp(document.body, { pointerId: 1, pointerType: "mouse" });
    expect(annonce()).toBe("Capture déplacée en position 3.");
    expect(poignee(3, 3).className).not.toContain("cursor-grabbing");
    /* Bouton relâché : passer sur la première case ne déplace rien */
    sous.mockReturnValue(premiere!);
    fireEvent.pointerMove(poignee(1, 3), { pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document.body, { pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 10 });
    expect(ordre()).toEqual(["b:1", "c:2", "a:3"]);
  });

  it("le pointeur perdu par la case déplacée lui est rendu tant qu’il est appuyé ; relâché, le glisser se finit", () => {
    render(<Grille ids={["a", "b"]} />);
    const a = poignee(1, 2);
    const capture = vi.fn();
    a.setPointerCapture = capture;
    fireEvent.pointerDown(a, { pointerId: 4, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(a, { pointerId: 4, pointerType: "mouse", clientX: 30, clientY: 10 });
    expect(capture).toHaveBeenCalledTimes(1);
    /* Un autre pointeur ne compte pas */
    fireEvent.lostPointerCapture(a, { pointerId: 9 });
    expect(capture).toHaveBeenCalledTimes(1);
    fireEvent.lostPointerCapture(a, { pointerId: 4 });
    expect(capture).toHaveBeenLastCalledWith(4);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(a.className).toContain("cursor-grabbing");
    /* Le navigateur refuse : le pointeur n’est plus appuyé (relâché hors de la fenêtre). La case se pose */
    capture.mockImplementation(() => {
      throw new DOMException("relâché", "InvalidStateError");
    });
    fireEvent.lostPointerCapture(a, { pointerId: 4 });
    expect(a.className).not.toContain("cursor-grabbing");
    expect(annonce()).toBe("Capture déplacée en position 1.");
  });

  it("au clavier, après Suppr ou la croix, le focus va à la case qui prend la place, à la précédente, puis à la grille", async () => {
    render(<Grille ids={["a", "b", "c"]} />);
    const image = () => act(() => new Promise((r) => requestAnimationFrame(r)));
    poignee(2, 3).focus();
    fireEvent.keyDown(poignee(2, 3), { key: "Delete" });
    await image();
    expect(document.activeElement?.textContent).toBe("c:2");
    /* La dernière retirée : la précédente */
    const croix = screen.getByRole("button", { name: "Retirer la capture 2" });
    croix.focus();
    fireEvent.click(croix);
    await image();
    expect(document.activeElement?.textContent).toBe("a:1");
    /* Plus aucune case : la grille elle-même */
    fireEvent.keyDown(poignee(1, 1), { key: "Backspace" });
    await image();
    expect(document.activeElement).toBe(screen.getByRole("list", { name: "Tes captures, dans l’ordre" }));
  });

  it("au clavier, la dernière case retirée, le focus va à la case d’ajout quand il y en a une", async () => {
    render(<Grille ids={["a"]} onAdd={() => {}} />);
    fireEvent.keyDown(poignee(1, 1), { key: "Delete" });
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ajouter des captures" }));
  });

  it("démontée en plein glisser, ou pendant l’appui maintenu : ni écouteur de la fenêtre, ni minuteur ne restent", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Grille ids={["a", "b"]} />);
    fireEvent.pointerDown(poignee(1, 2), { pointerId: 5, pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(230));
    expect(poignee(1, 2).className).toContain("cursor-grabbing");
    const retire = vi.spyOn(window, "removeEventListener");
    unmount();
    for (const type of ["touchmove", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) expect(retire).toHaveBeenCalledWith(type, expect.any(Function));
    /* L’appui maintenu en cours : son minuteur part avec l’écran */
    const deuxieme = render(<Grille ids={["c", "d"]} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Capture 1 sur 2" }), { pointerId: 6, pointerType: "touch", clientX: 10, clientY: 10 });
    const pose = vi.spyOn(window, "addEventListener");
    deuxieme.unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(pose).not.toHaveBeenCalledWith("touchmove", expect.any(Function), expect.anything());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("figée (pendant l’envoi) : ni flèches, ni Suppr, ni glisser, et la croix est cachée", () => {
    render(<Grille ids={["a", "b"]} fige />);
    fireEvent.keyDown(poignee(1, 2), { key: "ArrowRight" });
    fireEvent.keyDown(poignee(1, 2), { key: "Delete" });
    fireEvent.pointerDown(poignee(1, 2), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(poignee(1, 2), { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 0 });
    expect(ordre()).toEqual(["a:1", "b:2"]);
    expect(poignee(1, 2).className).not.toContain("cursor-grabbing");
    expect(screen.queryByRole("button", { name: "Retirer la capture 1" })).toBeNull();
  });
});
