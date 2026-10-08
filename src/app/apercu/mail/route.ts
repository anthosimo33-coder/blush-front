import { mailCode } from "@/server/mail-code";

export const dynamic = "force-dynamic";

/** En local seulement : le mail du code de connexion, tel qu’il partira (avec un code d’exemple). */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  return new Response(mailCode("159714", new URL(req.url).origin).html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
