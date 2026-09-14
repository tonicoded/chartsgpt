import { cryptoMarkets, BinanceError } from '../../../../lib/market/binance';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json({ markets: await cryptoMarkets() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to load markets.' }, { status: error instanceof BinanceError ? error.status : 500 }); }
}
