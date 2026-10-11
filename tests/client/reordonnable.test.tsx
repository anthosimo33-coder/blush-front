import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReorderGrid } from "@/components/ui/ReorderGrid";

/*
 * La grille à réordonner (src/components/ui/ReorderGrid.tsx), seule, avec les textes des captures : le clavier, la
 * souris et l’appui maintenu au doigt déplacent une case, la croix ou Suppr la retirent, et rien ne bouge quand elle
 * est figée (pendant l’envoi). L’écran qui la porte (CapturesScreen) a ses tests de bout en bout (instagram-captures-*).
 */

const TEXTES = {
  liste: "Tes captures, dans l’ordre",
  element: (position: number, total: number) => `Capture ${position} sur ${total}`,
  retirer: (position: number) => `Retirer la capture ${position}`,
  deplacee: (position: number) => `Capture déplacée en position ${position}.`,
  ajouter: "Ajouter des captures",
};

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
        onAdd={onAdd}
        fige={fige}
        rendu={(s, position) => (
          <span data-testid="case">
            {s.id}:{position}
          </span>
        )}
        ajout={<span>+</span>}
        textes={TEXTES}
        aide="aide"
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
});

describe("ReorderGrid", () => {
  it("se lit comme une liste ordonnée, chaque case avec sa position et l’aide du geste dès qu’il y en a deux", () => {
    const { unmount } = render(<Grille ids={["a", "b", "c"]} onAdd={() => {}} />);
    expect(screen.getByRole("list", { name: "Tes captures, dans l’ordre" })).toBeTruthy();
    expect(ordre()).toEqual(["a:1", "b:2", "c:3"]);
    expect(poignee(2, 3).getAttribute("aria-describedby")).toBe("aide");
    expect(screen.getByRole("button", { name: "Ajouter des captures" })).toBeTruthy();
    unmount();
    /* Une seule case, et sans `onAdd` : ni aide, ni case d’ajout */
    render(<Grille ids={["a"]} />);
    expect(poignee(1, 1).getAttribute("aria-describedby")).toBeNull();
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
    const c = screen.getAllByRole("listitem")[2];
    const sous = vi.spyOn(document, "elementFromPoint").mockReturnValue(c);
    fireEvent.pointerMove(a, { pointerId: 1, pointerType: "mouse", clientX: 200, clientY: 10 });
    expect(sous).toHaveBeenCalledWith(200, 10);
    expect(ordre()).toEqual(["b:1", "c:2", "a:3"]);
    expect(annonce()).toBe("");
    fireEvent.pointerUp(a, { pointerId: 1, pointerType: "mouse" });
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
    act(() => vi.advanceTimersByTime(1));
    expect(a.className).toContain("cursor-grabbing");
    fireEvent.pointerCancel(a, { pointerId: 3, pointerType: "touch" });
    expect(a.className).not.toContain("cursor-grabbing");
    expect(annonce()).toBe("Capture déplacée en position 1.");
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
