import type { Metadata } from "next";
import type { AppKind } from "@/types";
import { CapturesScreen } from "./CapturesScreen";

export const metadata: Metadata = { title: "Choisis tes captures" };

const APPS: AppKind[] = ["instagram", "hinge", "autre", "whatsapp", "imessage"];

export default async function Page({ searchParams }: PageProps<"/importer/captures">) {
  const { app, mode } = await searchParams;
  return <CapturesScreen app={APPS.includes(app as AppKind) ? (app as AppKind) : null} addMode={mode === "ajout"} />;
}
