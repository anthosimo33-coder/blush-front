"use client";

import { useLayoutEffect } from "react";
import { poserConvDeLaPage } from "@/services/session";

/** Pose la conv de la page avant les premiers appels de ses écrans (un effet de mise en page passe avant les autres). */
export function PoseConv({ id }: { id: string | null }) {
  useLayoutEffect(() => {
    poserConvDeLaPage(id);
    return () => poserConvDeLaPage(null);
  }, [id]);
  return null;
}
