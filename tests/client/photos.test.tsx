import { existsSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/Avatar";
import { LANDING_CONVS } from "@/contenu/landing";
import { EXPORT_STEPS } from "@/contenu/parcours";

describe("les photos dans les ronds", () => {
  it("une photo à la place de l’initiale, sur sa couleur ; sans photo, l’initiale", () => {
    const avec = render(
      <Avatar tone="elle" size={44} photo="/convs/lea.webp">
        L
      </Avatar>,
    );
    expect(avec.container.querySelector("img")?.getAttribute("src")).toBe("/convs/lea.webp");
    expect(avec.container.textContent).toBe("");
    avec.unmount();
    const sans = render(
      <Avatar tone="elle" size={44}>
        L
      </Avatar>,
    );
    expect(sans.container.querySelector("img")).toBeNull();
    expect(sans.container.textContent).toBe("L");
  });

  it("les convs de la landing : une photo seulement sur une pastille « initiale », et son fichier existe", () => {
    const avecPhoto = LANDING_CONVS.filter((c) => c.photo);
    expect(avecPhoto.length).toBeGreaterThan(0);
    for (const c of avecPhoto) {
      expect(c.avatar, `${c.name} : sa pastille`).toBe("initial");
      expect(c.photo, `${c.name} : sa photo`).toMatch(/^\/convs\/[a-z-]+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", c.photo!)), `${c.name} : ${c.photo} existe`).toBe(true);
    }
  });

  it("Sophie, sur le téléphone de l’export WhatsApp : sa photo existe", () => {
    const { photo } = EXPORT_STEPS.whatsapp.menu;
    expect(photo).toMatch(/^\/convs\/[a-z-]+\.webp$/);
    expect(existsSync(join(process.cwd(), "public", photo)), `${photo} existe`).toBe(true);
  });
});
