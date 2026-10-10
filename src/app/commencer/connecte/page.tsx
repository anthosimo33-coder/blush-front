import type { Metadata } from "next";
import { CommencerScreen } from "../CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où\u00a0?" };

/* /commencer pour qui a déjà une session (next.config.ts sert cette page à la même adresse) : pas de liste d’attente */
export default function Page() {
  return <CommencerScreen />;
}
