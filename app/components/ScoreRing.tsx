type Props = {
  value: number;
  size?: number;
  /** true = CSS keyframe animation; false (default) = static, SSR-safe */
  animate?: boolean;
};

export default function ScoreRing({ value, size = 140, animate = false }: Props) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const fillStyle = animate
    ? ({ "--target-offset": offset } as React.CSSProperties)
    : { strokeDasharray: circumference, strokeDashoffset: offset, animation: "none" };

  return (
    <div className="ring-container" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle className="ring-bg" cx="50" cy="50" r={radius} />
        <circle className="ring-fill" cx="50" cy="50" r={radius} style={fillStyle} />
      </svg>
      <div className="ring-number" style={{ fontSize: size * 0.32 }}>
        {value}
      </div>
    </div>
  );
}
