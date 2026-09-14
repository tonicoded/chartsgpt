'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Candle, KeyLevel } from '../../lib/engine/types';
import { ema } from '../../lib/engine/indicators';

const price = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 8 : 2 });
export default function CryptoChart({ candles, levels, showEMA, showLevels }: { candles: Candle[]; levels: KeyLevel[]; showEMA: boolean; showLevels: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi>();
  const series = useRef<ISeriesApi<'Candlestick'>>();
  const volume = useRef<ISeriesApi<'Histogram'>>();
  const averages = useRef<ISeriesApi<'Line'>[]>([]);
  const lines = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const first = useRef(true);
  const [hovered, setHovered] = useState<Pick<Candle, 'open' | 'high' | 'low' | 'close'> | null>(null);
  const latest = hovered ?? candles[candles.length - 1];
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#101216' }, textColor: '#969ca8', fontFamily: 'Arial', fontSize: 12, attributionLogo: true },
      grid: { vertLines: { color: '#1b1e24' }, horzLines: { color: '#1b1e24' } },
      rightPriceScale: { borderColor: '#24282e', scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: '#24282e', timeVisible: true, secondsVisible: false, rightOffset: 8 },
      crosshair: { vertLine: { color: '#68707e' }, horzLine: { color: '#68707e' } },
      localization: { locale: 'en-GB' }
    });
    api.current = chart;
    series.current = chart.addSeries(CandlestickSeries, { upColor: '#b8f26d', downColor: '#f07583', borderVisible: false, wickUpColor: '#b8f26d', wickDownColor: '#f07583' });
    volume.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    averages.current = ['#e4b96c', '#8994fa', '#60bfd5'].map(color => chart.addSeries(LineSeries, { color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }));
    chart.subscribeCrosshairMove(param => {
      const bar = param.seriesData.get(series.current!);
      setHovered(bar && 'close' in bar && 'open' in bar && 'high' in bar && 'low' in bar ? bar : null);
    });
    return () => { chart.remove(); api.current = undefined; first.current = true; lines.current = []; };
  }, []);
  useEffect(() => {
    if (!api.current || !series.current || !candles.length) return;
    const last = candles[candles.length - 1].close;
    const precision = last >= 100 ? 2 : last >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(last)) + 4);
    series.current.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    series.current.setData(candles.map(c => ({ ...c, time: c.openTime as UTCTimestamp })));
    volume.current?.setData(candles.map(c => ({ time: c.openTime as UTCTimestamp, value: c.volume, color: c.close >= c.open ? '#b8f26d33' : '#f0758333' })));
    [20, 50, 200].forEach((period, i) => {
      const values = ema(candles.map(c => c.close), period);
      const offset = candles.length - values.length;
      averages.current[i].setData(values.map((value, j) => ({ time: candles[j + offset].openTime as UTCTimestamp, value })));
    });
    if (first.current) { api.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 130), to: candles.length + 8 }); first.current = false; }
  }, [candles]);
  useEffect(() => { averages.current.forEach(s => s.applyOptions({ visible: showEMA })); }, [showEMA]);
  useEffect(() => {
    if (!series.current) return;
    lines.current.forEach(line => series.current!.removePriceLine(line));
    lines.current = showLevels ? levels.filter(l => Number.isFinite(+l.price)).map(l => series.current!.createPriceLine({ price: +l.price, color: l.kind === 'support' ? '#b8f26d66' : '#f0758366', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })) : [];
  }, [levels, showLevels]);
  return <><div className="chart-readout" aria-label="Candle prices">{latest && <>{[['O', latest.open], ['H', latest.high], ['L', latest.low], ['C', latest.close]].map(([label, n]) => <span key={label}><b>{label}</b> {price(n as number)}</span>)}</>}<button aria-label="Reset chart" onClick={() => api.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 130), to: candles.length + 8 })}>Reset zoom</button></div><div className="crypto-chart" ref={container} role="img" aria-label="Interactive candlestick chart with volume. Scroll to zoom; drag to pan." /><div className="chart-footer"><span>Scroll to zoom · drag to pan</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a></div></>;
}
