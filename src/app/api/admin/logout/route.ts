import { clearSessionCookie, ok } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = ok({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}
