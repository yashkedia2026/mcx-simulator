import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import type { PayoffPoint, OptionLeg } from '@/types';

interface Props {
  data: PayoffPoint[];
  underlyingPrice: number;
  instrument: string;
  breakevenPoints: number[];
  legs: OptionLeg[];
  isDark: boolean;
}

const CHART_FONT = "'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function fmtINR(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

/** Axis labels: compact rupees (₹90K, ₹2.5L, ₹1.2Cr) so the y-axis stays narrow, especially on phones. */
function fmtCompactINR(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2,
  }).format(v);
}

/** A round tick spacing (1, 2, 2.5, 5 or 10 times a power of ten) for roughly `ticks` divisions. */
function niceStep(range: number, ticks: number): number {
  const rough = Math.max(range, 1) / ticks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

// Mirrors the colour tokens in index.css. SVG attributes cannot read CSS
// variables, so the chart keeps literal copies: one accent for the payoff line,
// neutrals for everything else, green/red only for the profit and loss zones.
const PALETTE = {
  dark:  { text: '#f4f7fb', muted: '#aeb8c8', grid: 'rgba(184, 201, 230, 0.16)', card: '#171d2f', accent: '#7aa9ff', positive: '#28d17c', negative: '#ff667d' },
  light: { text: '#172033', muted: '#59677b', grid: '#e5eaf2', card: '#ffffff', accent: '#2563eb', positive: '#067647', negative: '#c8233c' },
};

function fmtPrice(v: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v);
}

export function PayoffChart({ data, underlyingPrice, instrument, breakevenPoints, legs, isDark }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 transition-colors"
        style={{ background: 'var(--th-card)' }}
      >
        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 12l3-3 3 3 4-4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
          Add legs to see the payoff diagram
        </p>
      </div>
    );
  }

  const c = isDark ? PALETTE.dark : PALETTE.light;

  // ── Series data ──
  const expiryData  = data.map(p => ({ x: p.price, y: Math.round(p.expiryPnL)  }));
  const currentData = data.map(p => ({ x: p.price, y: Math.round(p.currentPnL) }));

  // ── Y-axis: round tick values with ₹0 always on a gridline ──
  const allY = [...expiryData.map(p => p.y), ...currentData.map(p => p.y), 0];
  const rawMin = Math.min(...allY);
  const rawMax = Math.max(...allY);
  const yPad = Math.max((rawMax - rawMin) * 0.15, 2000);
  const yStep = niceStep(rawMax - rawMin + 2 * yPad, 6);
  const chartYMin = Math.floor((rawMin - yPad * 0.5) / yStep) * yStep;
  const chartYMax = Math.ceil((rawMax + yPad) / yStep) * yStep;   // headroom for the marker labels
  const yTicks = Math.round((chartYMax - chartYMin) / yStep);

  // ── Zone fill: zero position on gradient (% from chart top) ──
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const zeroOffset = clamp((chartYMax / (chartYMax - chartYMin)) * 100, 2, 98);

  // ── Standard deviation ──
  const avgIV  = legs.length > 0 ? legs.reduce((s, l) => s + l.iv,  0) / legs.length / 100 : 0.18;
  const avgDTE = legs.length > 0 ? legs.reduce((s, l) => s + l.daysToExpiry, 0) / legs.length : 30;
  const sigma  = underlyingPrice * avgIV * Math.sqrt(Math.max(avgDTE, 1) / 365);

  interface SL { x: number; label: string; isCMP: boolean }
  const sigmaLevels: SL[] = sigma > 0
    ? [
        { x: underlyingPrice - 2 * sigma, label: '−2σ', isCMP: false },
        { x: underlyingPrice - sigma,     label: '−1σ', isCMP: false },
        { x: underlyingPrice,             label: 'CMP', isCMP: true  },
        { x: underlyingPrice + sigma,     label: '+1σ', isCMP: false },
        { x: underlyingPrice + 2 * sigma, label: '+2σ', isCMP: false },
      ]
    : [{ x: underlyingPrice, label: 'CMP', isCMP: true }];

  // The σ lines are always drawn, but a label is only shown when it has room:
  // close to expiry the band is narrow and the labels would sit on top of each
  // other (and on "CMP"), most visibly on a phone.
  const viewport = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const plotWidth = Math.max(160, viewport - (viewport >= 1024 ? 570 : 150));
  const pxPerSigma = (sigma / Math.max(data[data.length - 1].price - data[0].price, 1)) * plotWidth;
  const showSigmaLabel = (sl: SL) => sl.isCMP ||
    (Math.abs(sl.x - underlyingPrice) > sigma * 1.5 ? pxPerSigma * 2 >= 44 : pxPerSigma >= 40);

  // Marker labels sit on the card colour so they mask the line behind them.
  const markerLabel = (color: string, weight: string) => ({
    background: c.card,
    color,
    fontSize: '12px',
    fontWeight: weight,
    fontFamily: CHART_FONT,
    padding: { top: 2, right: 4, bottom: 2, left: 4 },
  });

  const options: ApexOptions = {
    chart: {
      type: 'line',
      background: 'transparent',
      foreColor: c.muted,
      toolbar: {
        show: true,
        offsetY: -2,
        tools: { download: false, reset: true, zoom: true, zoomin: true, zoomout: true, pan: true },
      },
      zoom: { enabled: true },
      animations: { enabled: false },
      fontFamily: CHART_FONT,
    },
    theme: { mode: isDark ? 'dark' : 'light' },

    title: {
      text: instrument.toUpperCase(),
      align: 'left',
      offsetX: 4,
      style: { fontSize: '14px', fontWeight: '600', color: c.text, fontFamily: CHART_FONT },
    },

    // Expiry P&L is the one accented line (area, for the profit/loss fill);
    // the model curve is a quieter dashed neutral.
    series: [
      { name: 'Expiry P&L', type: 'area', data: expiryData  },
      { name: 'Model P&L',  type: 'line', data: currentData },
    ],

    colors: [c.accent, c.muted],

    stroke: {
      width: [2.5, 1.75],
      dashArray: [0, 5],
      curve: 'straight',
    },

    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 4 } },

    // Gradient fill on Expiry P&L: green above zero, red below zero
    fill: {
      type: ['gradient', 'solid'],
      // A line series takes its stroke opacity from here too: 0 would hide the model curve.
      opacity: [1, 1],
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        colorStops: [[
          { offset: 0,              color: c.positive, opacity: isDark ? 0.24 : 0.16 },
          { offset: zeroOffset - 1, color: c.positive, opacity: isDark ? 0.08 : 0.06 },
          { offset: zeroOffset,     color: c.negative, opacity: isDark ? 0.08 : 0.06 },
          { offset: 100,            color: c.negative, opacity: isDark ? 0.24 : 0.16 },
        ]],
      },
    },

    xaxis: {
      type: 'numeric',
      min: data[0].price,
      max: data[data.length - 1].price,
      tickAmount: 8,
      title: {
        text: 'Underlying Price',
        style: { color: c.muted, fontSize: '12px', fontWeight: '500', fontFamily: CHART_FONT },
        offsetY: -4,
      },
      labels: {
        formatter: (v) => `₹${fmtPrice(Number(v))}`,
        style: { colors: c.muted, fontSize: '12px', fontFamily: CHART_FONT },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { color: c.grid },
      axisTicks: { color: c.grid },
      crosshairs: { show: true, stroke: { color: c.muted, width: 1, dashArray: 3 } },
      tooltip: { enabled: false },
    },

    yaxis: {
      min: chartYMin,
      max: chartYMax,
      tickAmount: yTicks,
      title: {
        text: 'Profit / Loss (₹)',
        style: { color: c.muted, fontSize: '12px', fontWeight: '500', fontFamily: CHART_FONT },
      },
      labels: {
        formatter: (v) => fmtCompactINR(v),
        style: { colors: c.muted, fontSize: '12px', fontFamily: CHART_FONT },
        offsetX: -4,
      },
    },

    grid: {
      borderColor: c.grid,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 8, right: 16, top: 0, bottom: 0 },
    },

    annotations: {
      yaxis: [
        // ₹0 line — solid; the axis already labels it
        { y: 0, borderColor: c.text, strokeDashArray: 0, borderWidth: 1.25, opacity: 0.7 },
      ],

      xaxis: [
        // Sigma + current price lines: top row of labels
        ...sigmaLevels.map(sl => ({
          x: sl.x,
          borderColor: c.muted,
          strokeDashArray: sl.isCMP ? 0 : 3,
          borderWidth: 1,
          label: {
            text: showSigmaLabel(sl) ? sl.label : '',
            position: 'top' as const,
            orientation: 'horizontal' as const,
            borderWidth: 0,
            style: markerLabel(sl.isCMP ? c.text : c.muted, sl.isCMP ? '600' : '500'),
          },
        })),

        // Breakeven lines: labels on a second row so they never cover the row above
        ...breakevenPoints.map(be => ({
          x: be,
          borderColor: c.text,
          strokeDashArray: 5,
          borderWidth: 1.25,
          label: {
            text: `BE ₹${fmtPrice(be)}`,
            position: 'top' as const,
            orientation: 'horizontal' as const,
            offsetY: 20,
            borderWidth: 0,
            style: markerLabel(c.text, '600'),
          },
        })),
      ],

      // Breakeven dot markers at y=0
      points: breakevenPoints.map(be => ({
        x: be,
        y: 0,
        marker: { size: 4, fillColor: c.text, strokeColor: c.card, strokeWidth: 2, shape: 'circle' as const },
      })),
    },

    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',
      fontFamily: CHART_FONT,
      fontSize: '12px',
      fontWeight: '500',
      labels: { colors: c.muted },
      markers: { size: 5, strokeWidth: 0, offsetX: -2 },
      itemMargin: { horizontal: 8 },
      offsetY: -4,
    },

    tooltip: {
      theme: isDark ? 'dark' : 'light',
      style: { fontSize: '12px', fontFamily: CHART_FONT },
      x: { formatter: (v: number) => `${instrument.toUpperCase()} @ ₹${fmtPrice(v)}` },
      y: { formatter: (v) => fmtINR(v) },
      shared: true,
      intersect: false,
    },

    // Narrow charts (phones): fewer price ticks so labels never need rotating, and
    // the legend moves below the plot so the larger touch toolbar cannot cover it.
    responsive: [{ breakpoint: 520, options: { xaxis: { tickAmount: 4 }, legend: { position: 'bottom', offsetY: 0 } } }],
  };

  return (
    <ReactApexChart
      key={isDark ? 'dark' : 'light'}
      options={options}
      series={options.series as ApexCharts.ApexOptions['series']}
      type="line"
      height="100%"
    />
  );
}
