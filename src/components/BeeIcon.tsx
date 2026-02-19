export function BeeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Body */}
      <ellipse cx="12" cy="14" rx="5" ry="6" />
      {/* Stripes */}
      <line x1="7.5" y1="12.5" x2="16.5" y2="12.5" />
      <line x1="7.2" y1="15.5" x2="16.8" y2="15.5" />
      {/* Wings */}
      <path d="M7 10 Q4 4 8 6" />
      <path d="M17 10 Q20 4 16 6" />
      {/* Antennae */}
      <line x1="10" y1="8.5" x2="8" y2="5" />
      <line x1="14" y1="8.5" x2="16" y2="5" />
      <circle cx="7.5" cy="4.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="4.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
