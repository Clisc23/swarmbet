import { cn } from '@/lib/utils';
import { formatPoints, generateAvatar } from '@/lib/helpers';
import { Trophy, Flame } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  player_id: string;
  username: string;
  avatar_seed: string;
  swarm_points: number;
  accuracy_score: number;
  current_streak: number;
  max_streak: number;
  total_predictions: number;
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
}

function getRankStyle(rank: number) {
  if (rank === 1) return { bg: 'bg-gold/10 border-gold/30', text: 'text-gold', icon: '🥇' };
  if (rank === 2) return { bg: 'bg-silver/10 border-silver/30', text: 'text-silver', icon: '🥈' };
  if (rank === 3) return { bg: 'bg-bronze/10 border-bronze/30', text: 'text-bronze', icon: '🥉' };
  return { bg: 'bg-surface/30 border-border/30', text: 'text-muted-foreground', icon: '' };
}

export function LeaderboardRow({ entry, isCurrentUser }: LeaderboardRowProps) {
  const style = getRankStyle(entry.rank);

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border px-3 py-3 transition-all',
      isCurrentUser ? 'border-primary/30 bg-primary/5 glow-sm' : style.bg,
    )}>
      {/* Rank */}
      <div className="flex w-8 items-center justify-center">
        {style.icon ? (
          <span className="text-lg">{style.icon}</span>
        ) : (
          <span className={cn('font-mono text-sm font-bold', style.text)}>#{entry.rank}</span>
        )}
      </div>

      {/* Avatar + Name */}
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <img
          src={generateAvatar(entry.avatar_seed)}
          alt=""
          className="h-8 w-8 rounded-full bg-muted"
        />
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', isCurrentUser && 'text-primary')}>
            {entry.username}
            {isCurrentUser && <span className="ml-1 text-[10px]">(you)</span>}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{(entry.accuracy_score * 100).toFixed(0)}% acc</span>
            {entry.current_streak > 0 && (
              <span className="flex items-center gap-0.5 text-primary">
                <Flame className="h-2.5 w-2.5" />{entry.current_streak}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Points */}
      <div className="text-right">
        <p className="font-mono text-sm font-bold text-primary">{formatPoints(entry.swarm_points)}</p>
        <p className="text-[10px] text-muted-foreground">{entry.total_predictions} votes</p>
      </div>
    </div>
  );
}

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

export function LeaderboardList({ entries, currentUserId }: LeaderboardListProps) {
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Trophy className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No rankings yet. Start voting!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <LeaderboardRow
          key={entry.player_id}
          entry={entry}
          isCurrentUser={entry.player_id === currentUserId}
        />
      ))}
    </div>
  );
}
