import { render } from "@testing-library/react";
import { useContext, useEffect, useLayoutEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompteDeLaPage } from "@/components/shell/compte-de-la-page";
import { PoseConv } from "@/components/shell/PoseConv";
import { MontageDeLaPage } from "@/lib/query";
import { lireConvDeLaPage, poserConvDeLaPage } from "@/services/session";
import type { Account } from "@/types/api";

/*
 * PoseConv (src/components/shell/PoseConv.tsx), la page d’une conv côté navigateur : sa conv est posée avant les premiers
 * appels de ses écrans (leurs effets, de mise en page comme les autres), `data-conv-posee` le dit sur <html> tant
 * qu’elle l’est (les tests de bout en bout l’attendent), et elle est retirée au démontage.
 */

afterEach(() => {
  for (const k of Object.keys(vu)) delete vu[k];
  poserConvDeLaPage(null);
  delete document.documentElement.dataset.convPosee;
});

/* Un écran de la page : ce que ses effets voient, au premier passage */
const vu: Record<string, unknown> = {};
function Ecran() {
  const page = useCompteDeLaPage();
  const montage = useContext(MontageDeLaPage);
  useLayoutEffect(() => {
    vu.miseEnPage ??= lireConvDeLaPage();
    vu.marqueur ??= document.documentElement.dataset.convPosee;
    Object.assign(vu, { page, montage });
  }, [page, montage]);
  useEffect(() => {
    vu.effet ??= lireConvDeLaPage();
  }, []);
  return null;
}

describe("PoseConv", () => {
  it("pose la conv avant les effets de ses écrans, le dit sur <html>, et la retire au démontage", () => {
    const { unmount } = render(
      <PoseConv id="conv-a" compte={null} rendu={Date.now()}>
        <Ecran />
      </PoseConv>,
    );
    expect(vu.miseEnPage).toBe("conv-a");
    expect(vu.effet).toBe("conv-a");
    expect(vu.marqueur).toBe("");
    expect(document.documentElement.dataset.convPosee).toBe("");
    unmount();
    expect(lireConvDeLaPage()).toBeNull();
    expect(document.documentElement.dataset.convPosee).toBeUndefined();
  });

  it("donne à ses écrans le compte rendu et l’heure du rendu, et un montage à elle", () => {
    const compte: Account = { email: "lea@blush.test", subscription: { plan: "rapport", priceLabel: "", renewLabel: "", stopLabel: "", active: true, paused: false }, storyDeleted: false };
    const { unmount } = render(
      <PoseConv id="conv-b" compte={compte} rendu={1234}>
        <Ecran />
      </PoseConv>,
    );
    expect(vu.page).toEqual({ compte, rendu: 1234 });
    const premier = vu.montage;
    expect(premier).toBeTypeOf("object");
    unmount();
    /* La page montée de nouveau (revue par l’historique) a un autre montage : elle relit ce qui vient du rendu */
    render(
      <PoseConv id="conv-b" compte={compte} rendu={1234}>
        <Ecran />
      </PoseConv>,
    );
    expect(vu.montage).not.toBe(premier);
  });

  it("hors d’une page de conv, pas de compte rendu : la coque le lit", () => {
    render(<Ecran />);
    expect(vu.page).toBeNull();
  });
});
