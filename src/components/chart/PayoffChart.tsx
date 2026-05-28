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

function fmtINR(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

function fmtPrice(v: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v);
}

export function PayoffChart({ data, underlyingPrice, instrument, breakevenPoints, legs, isDark }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 transition-colors"
        style={{ background: isDark ? '#12122a' : '#ffffff' }}
      >
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 12l3-3 3 3 4-4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <p className="text-xs" style={{ color: isDark ? '#6b7280' : '#9ca3af' }}>
          Add legs to see the payoff diagram
        </p>
      </div>
    );
  }

  // ── Series data ──
  const expiryData  = data.map(p => ({ x: p.price, y: Math.round(p.expiryPnL)  }));
  const currentData = data.map(p => ({ x: p.price, y: Math.round(p.currentPnL) }));
  // Profit line: expiry P&L clamped at 0 — only shows the positive portion
  const profitData  = data.map(p => ({ x: p.price, y: Math.max(0, Math.round(p.expiryPnL)) }));

  // ── Y-axis bounds ──
  const allY = [...expiryData.map(p => p.y), ...currentData.map(p => p.y)];
  const rawMin = Math.min(...allY);
  const rawMax = Math.max(...allY);
  const yPad = Math.max((rawMax - rawMin) * 0.15, 2000);
  const chartYMin = rawMin - yPad;
  const chartYMax = rawMax + yPad;

  // ── Zone fill: zero position on gradient (% from chart top) ──
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const zeroOffset = clamp((chartYMax / (chartYMax - chartYMin)) * 100, 2, 98);

  // Strong zone colors — immediately obvious
  const profitColor = isDark ? '#00C864' : '#00B860';
  const lossColor   = isDark ? '#FF5032' : '#FF4020';

  // ── Standard deviation ──
  const avgIV  = legs.length > 0 ? legs.reduce((s, l) => s + l.iv,  0) / legs.length / 100 : 0.18;
  const avgDTE = legs.length > 0 ? legs.reduce((s, l) => s + l.daysToExpiry, 0) / legs.length : 30;
  const sigma  = underlyingPrice * avgIV * Math.sqrt(Math.max(avgDTE, 1) / 365);

  interface SL { x: number; label: string; isCMP: boolean }
  const sigmaLevels: SL[] = sigma > 0
    ? [
        { x: underlyingPrice - 2 * sigma, label: '-2σ', isCMP: false },
        { x: underlyingPrice - sigma,     label: '-1σ', isCMP: false },
        { x: underlyingPrice,             label: 'CMP', isCMP: true  },
        { x: underlyingPrice + sigma,     label: '+1σ', isCMP: false },
        { x: underlyingPrice + 2 * sigma, label: '+2σ', isCMP: false },
      ]
    : [{ x: underlyingPrice, label: 'CMP', isCMP: true }];

  // ── Theme palette ──
  const bg       = isDark ? '#12122a' : '#ffffff';
  const gridCol  = isDark ? 'rgba(255,255,255,0.06)' : '#e8e8e8';
  const axisCol  = isDark ? '#4b5563' : '#555555';
  const zeroLine = isDark ? 'rgba(255,255,255,0.7)' : '#000000';
  const labelBg  = isDark ? '#1e2640' : '#f5f5f5';
  const labelFg  = isDark ? '#cbd5e1' : '#333333';

  const options: ApexOptions = {
    chart: {
      type: 'line',
      background: bg,
      toolbar: {
        show: true,
        tools: { download: false, reset: true, zoom: true, zoomin: true, zoomout: true, pan: true },
      },
      zoom: { enabled: true },
      animations: { enabled: false },
      fontFamily: 'Inter, sans-serif',
    },
    theme: { mode: isDark ? 'dark' : 'light' },

    title: {
      text: instrument.toUpperCase(),
      align: 'center',
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: isDark ? '#e2e8f0' : '#1a1a1a',
        fontFamily: 'Inter, sans-serif',
      },
    },

    // Series: Expiry P&L (area for fill), Current P&L (line), Profit (line)
    series: [
      { name: 'Expiry P&L',  type: 'area', data: expiryData  },
      { name: 'Current P&L', type: 'line', data: currentData },
      { name: 'Profit',      type: 'line', data: profitData  },
    ],

    colors: ['#FF6B35', '#1565C0', '#00C853'],

    stroke: {
      width: [2.5, 2, 2.5],
      dashArray: [0, 6, 0],
      curve: 'smooth',
    },

    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 0 } },

    // Gradient fill on Expiry P&L: green above zero, red below zero
    fill: {
      type: ['gradient', 'solid', 'solid'],
      opacity: [1, 0, 0],
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        colorStops: [[
          { offset: 0,              color: profitColor, opacity: isDark ? 0.30 : 0.20 },
          { offset: zeroOffset - 1, color: profitColor, opacity: isDark ? 0.12 : 0.08 },
          { offset: zeroOffset,     color: lossColor,   opacity: isDark ? 0.12 : 0.08 },
          { offset: 100,            color: lossColor,   opacity: isDark ? 0.30 : 0.20 },
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
        style: { color: axisCol, fontSize: '11px', fontFamily: 'Inter, sans-serif' },
        offsetY: 4,
      },
      labels: {
        formatter: (v) => `₹${fmtPrice(Number(v))}`,
        style: { colors: axisCol, fontSize: '10px', fontFamily: 'Inter, sans-serif' },
        rotate: -20,
        offsetY: 2,
      },
      axisBorder: { color: gridCol },
      axisTicks: { color: gridCol },
      crosshairs: { show: true, stroke: { color: isDark ? '#ffffff30' : '#cccccc', width: 1, dashArray: 3 } },
    },

    yaxis: {
      min: chartYMin,
      max: chartYMax,
      tickAmount: 6,
      title: {
        text: 'Profit / Loss (₹)',
        style: { color: axisCol, fontSize: '11px', fontFamily: 'Inter, sans-serif' },
      },
      labels: {
        formatter: (v) => fmtINR(v),
        style: { colors: axisCol, fontSize: '10px', fontFamily: 'Inter, sans-serif' },
        offsetX: -4,
      },
    },

    grid: {
      borderColor: gridCol,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 16, top: 4, bottom: 0 },
    },

    annotations: {
      yaxis: [
        // ₹0 line — solid, prominent
        {
          y: 0,
          borderColor: zeroLine,
          strokeDashArray: 0,
          borderWidth: 1.5,
          label: {
            text: '₹0',
            position: 'left',
            offsetX: 24,
            style: {
              background: 'transparent',
              color: isDark ? 'rgba(255,255,255,0.5)' : '#444444',
              fontSize: '10px',
              fontWeight: '600',
              fontFamily: 'Inter, sans-serif',
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              border: 'none',
            },
          },
        },
      ],

      xaxis: [
        // Sigma + CMP lines
        ...sigmaLevels.map(sl => ({
          x: sl.x,
          borderColor: sl.isCMP ? '#2e7d32' : (isDark ? '#555555' : '#bbbbbb'),
          strokeDashArray: 4,
          borderWidth: sl.isCMP ? 2 : 1,
          label: {
            text: sl.label,
            position: 'top' as const,
            orientation: 'horizontal' as const,
            style: {
              background: sl.isCMP
                ? (isDark ? '#1b3a1e' : '#e8f5e9')
                : (isDark ? '#1e1e2e' : '#f5f5f5'),
              color: sl.isCMP ? '#4caf50' : (isDark ? '#888888' : '#757575'),
              fontSize: '10px',
              fontWeight: sl.isCMP ? '700' : '500',
              fontFamily: 'Inter, sans-serif',
              padding: { top: 3, right: 6, bottom: 3, left: 6 },
            },
          },
        })),

        // Breakeven lines
        ...breakevenPoints.map(be => ({
          x: be,
          borderColor: '#FF6B35',
          strokeDashArray: 5,
          borderWidth: 1.5,
          label: {
            text: `BE ₹${fmtPrice(be)}`,
            position: 'top' as const,
            orientation: 'horizontal' as const,
            style: {
              background: isDark ? '#2a1506' : '#fff3ee',
              color: '#d84315',
              fontSize: '10px',
              fontWeight: '600',
              fontFamily: 'Inter, sans-serif',
              padding: { top: 3, right: 6, bottom: 3, left: 6 },
            },
          },
        })),
      ],
    },

    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      fontWeight: '500',
      labels: { colors: isDark ? '#9ca3af' : '#333333' },
      markers: { size: 7, strokeWidth: 0, offsetX: -2 },
      itemMargin: { horizontal: 12 },
      offsetY: 2,
    },

    tooltip: {
      theme: isDark ? 'dark' : 'light',
      style: { fontSize: '12px', fontFamily: 'Inter, sans-serif' },
      x: { formatter: (v) => `${instrument.toUpperCase()} @ ₹${fmtPrice(v)}` },
      y: { formatter: (v) => fmtINR(v) },
      shared: true,
      intersect: false,
    },

    // Breakeven point markers
    points: breakevenPoints.map(be => ({
      x: be,
      y: 0,
      marker: {
        size: 5,
        fillColor: '#FF6B35',
        strokeColor: isDark ? '#12122a' : '#ffffff',
        strokeWidth: 2,
        shape: 'circle',
      },
    })),
  };

  return (
    <ReactApexChart
      key={isDark ? 'dark' : 'light'}
      options={options}
      series={options.series as ApexAxisChartSeries}
      type="line"
      height="100%"
    />
  );
}
