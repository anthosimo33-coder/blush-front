import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClampedBubble } from "@/components/ui/clamp";

/*
 * Un message cité, replié quand il est long (src/components/ui/clamp.tsx) : au-delà de `limit` mots, on n’en montre que
 * les `limit` premiers, et « Lire tout » le déplie. Les messages cités par le chat se replient à 25 mots
 * (src/app/app/accueil/bulles.tsx) : la coupe suit la limite, pas un nombre écrit à part.
 */

/* Un message de `n` mots, numérotés (« mot1 mot2… ») : on lit où il est coupé */
const message = (n: number) => Array.from({ length: n }, (_, i) => `mot${i + 1}`).join(" ");

const monter = (n: number) => render(<ClampedBubble from="elle" text={message(n)} limit={25} />);

describe("ClampedBubble", () => {
  it("25 mots, la limite : le message entier, sans « Lire tout »", () => {
    const { container } = monter(25);
    expect(container.textContent).toContain(message(25));
    expect(container.textContent).not.toContain("…");
    expect(screen.queryByRole("button", { name: "Lire tout" })).toBeNull();
  });

  it("26 mots : coupé aux 25 premiers, et « Lire tout » le déplie", () => {
    const { container } = monter(26);
    expect(container.textContent).toContain(`${message(25)}…`);
    expect(container.textContent).not.toContain("mot26");
    fireEvent.click(screen.getByRole("button", { name: "Lire tout" }));
    expect(container.textContent).toContain(message(26));
    expect(screen.queryByRole("button", { name: "Lire tout" })).toBeNull();
  });

  it("31 mots : coupé aux 25 premiers aussi (pas aux 30 d’avant)", () => {
    const { container } = monter(31);
    expect(container.textContent).toContain(`${message(25)}…`);
    expect(container.textContent).not.toContain("mot26");
    expect(screen.getByRole("button", { name: "Lire tout" }).getAttribute("aria-expanded")).toBe("false");
  });
});
