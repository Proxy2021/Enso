/**
 * Sparkline — lightweight inline SVG sparkline for score trends.
 * Sprint 14 Track B: Projects tab enrichment.
 */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 64,
  height = 20,
  strokeColor = "#818cf8",
  fillColor = "rgba(129,140,248,0.12)",
  className = "",
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 1; // vertical padding in px

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + ((max - v) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = points.join(" ");
  // Build closed polygon for fill (adds bottom-right and bottom-left corners)
  const fillPolygon = `${polyline} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Trend: ${data.join(", ")}`}
    >
      <polygon points={fillPolygon} fill={fillColor} />
      <polyline
        points={polyline}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {(() => {
        const lastX = width;
        const lastY = pad + ((max - data[data.length - 1]) / range) * (height - pad * 2);
        return <circle cx={lastX} cy={lastY} r="2" fill={strokeColor} />;
      })()}
    </svg>
  );
}

/**
 * Derive a trend label from a score array.
 * Returns "improving", "stable", or "declining" based on last 3 values.
 */
export function deriveTrend(data: number[]): "improving" | "stable" | "declining" {
  if (data.length < 2) return "stable";
  const recent = data.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const diff = last - first;
  if (diff > 0.3) return "improving";
  if (diff < -0.3) return "declining";
  return "stable";
}
