import type { Metadata } from 'next';
import CryptoTerminal from './terminal';
export const metadata: Metadata = {
  title: { absolute: 'ChartsGPT — Crypto terminal' },
  description: 'Crypto technical analysis with Binance market data, market structure and trade setups.',
  alternates: { canonical: '/app/' },
  robots: { index: false, follow: false }
};
export default function CryptoApp() { return <CryptoTerminal />; }
