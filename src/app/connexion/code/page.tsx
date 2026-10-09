import type { Metadata } from "next";
import { CodeScreen } from "@/app/email/code/CodeScreen";
import { suiteSure } from "@/lib/suite";

export const metadata: Metadata = { title: "Ton code" };

export default async function Page({ searchParams }: PageProps<"/connexion/code">) {
  const suite = suiteSure((await searchParams).suite);
  return <CodeScreen connexion suite={suite ?? undefined} />;
}
