interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({ value, max, size = 200, strokeWidth = 12 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / max) * circumference;
  const percentage = (value / max) * 100;
  // Unique gradient id so multiple instances don't collide
  const gradId = `cp-grad-${Math.round(value * 1000)}-${size}`;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--border)" strokeWidth={strokeWidth} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={`url(#${gradId})`} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--score-high)" />
            <stop offset="100%" stopColor="var(--raw-059669)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
          {Math.round(value)}
        </div>
        <div className="text-sm text-gray-500 mt-1">out of {max}</div>
        <div className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
          {Math.round(percentage)}%
        </div>
      </div>
    </div>
  );
}
