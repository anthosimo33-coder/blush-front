import type { Metadata } from "next";
import { ExportScreen } from "./ExportScreen";

export const metadata: Metadata = { title: "Exporte votre conv" };

export default async function Page({ searchParams }: PageProps<"/importer/export">) {
  const { app } = await searchParams;
  return <ExportScreen initialApp={app === "imessage" || app === "instagram" ? app : "whatsapp"} />;
}
