import type { Metadata } from "next";
import { CodeScreen } from "../CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

/* /email/code en bêta fermée (src/proxy.ts sert cette page à la même adresse) : le même écran pour tous, invité ou pas */
export default function Page() {
  return <CodeScreen fermee />;
}
