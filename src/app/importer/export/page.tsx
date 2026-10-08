import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExportScreen } from "./ExportScreen";

export const metadata: Metadata = { title: "Exporte votre conv" };

export default async function Page({ searchParams }: PageProps<"/importer/export">) {
  const { app } = await searchParams;
  /* iMessage ne s’exporte pas (Messages sur Mac n’a pas de commande pour ça) : on filme son écran */
  if (app === "imessage") redirect("/importer/captures?app=imessage");
  return <ExportScreen initialApp={app === "instagram" ? app : "whatsapp"} />;
}
