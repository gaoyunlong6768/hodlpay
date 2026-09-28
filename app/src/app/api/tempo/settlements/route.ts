import { getAddress, isAddress } from "viem";
import { settlementsFor } from "@/lib/server/tempo";

/** Lists HodlPay payouts a merchant received on Tempo: GET ?merchant=0x… */
export async function GET(request: Request) {
  const merchant = new URL(request.url).searchParams.get("merchant") ?? "";
  if (!isAddress(merchant)) return Response.json({ error: "merchant must be an EVM address" }, { status: 400 });
  try {
    return Response.json({ settlements: await settlementsFor(getAddress(merchant)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
