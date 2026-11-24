import QRCode from 'qrcode';
import { useMemo } from 'react';

/** QR rendered as SVG rects (no innerHTML). Always shown next to the written code. */
export function QrCode({
  value,
  size = 220,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { n, cells } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const out: Array<[number, number]> = [];
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) if (qr.modules.get(x, y)) out.push([x, y]);
    }
    return { n: count, cells: out };
  }, [value]);
  const margin = 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-margin} ${-margin} ${n + margin * 2} ${n + margin * 2}`}
      shapeRendering="crispEdges"
    >
      <title>{label}</title>
      <rect x={-margin} y={-margin} width={n + margin * 2} height={n + margin * 2} fill="#FFFDF7" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#1F1C17" />
      ))}
    </svg>
  );
}
