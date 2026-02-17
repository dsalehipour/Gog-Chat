import { checkGogInstalled } from "@/lib/gog";

export async function GET() {
  const status = await checkGogInstalled();
  return Response.json(status);
}
