export function generateAvatar(seed: string, size = 40): string {
  // Generate a deterministic avatar using DiceBear API
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}&size=${size}&backgroundColor=0a0f14`;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'SB-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function formatPoints(points: number): string {
  if (points >= 1000000) return `${(points / 1000000).toFixed(1)}M`;
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`;
  return points.toString();
}

export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    soccer: '⚽',
    tennis: '🎾',
    golf: '⛳',
    f1: '🏎️',
    cricket: '🏏',
    cycling: '🚴',
    basketball: '🏀',
    esports: '🎮',
    other: '🏆',
  };
  return map[category] || '🏆';
}

export function getTimeRemaining(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
