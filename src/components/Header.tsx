import { useAuth } from '@/contexts/AuthContext';
import { formatPoints } from '@/lib/helpers';
import beeIcon from '@/assets/bee-icon.png';

export function Header() {
  const { profile } = useAuth();

  return (
    <header className="sticky top-0 z-40 glass-strong">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary overflow-hidden">
            <img src={beeIcon} alt="SwarmBet bee" className="h-6 w-6 object-contain" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Swarm<span className="text-primary">Bet</span>
          </span>
        </div>
        {profile && (
          <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
            <div className="h-2 w-2 rounded-full gradient-primary animate-pulse-glow" />
            <span className="text-sm font-mono font-semibold text-primary">
              {formatPoints(profile.swarm_points)}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
