import { cn } from '@/lib/utils';
import { getCategoryEmoji, getTimeRemaining } from '@/lib/helpers';
import { Clock, Users, ShieldCheck } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

interface PollCardProps {
  poll: Poll;
  userVotedOptionId?: string | null;
  onVote?: (poll: Poll) => void;
  onForceClose?: (pollId: string) => void;
  onReopen?: (pollId: string) => void;
  onActivate?: (pollId: string) => void;
}

export function PollCard({ poll, userVotedOptionId, onVote, onForceClose, onReopen, onActivate }: PollCardProps) {
  const hasVoted = !!userVotedOptionId;
  const isActive = poll.status === 'active';
  const isClosed = poll.status === 'closed' || poll.status === 'resolved';
  const isUpcoming = poll.status === 'upcoming';
  const isAnonymous = !!(poll as any).vocdoni_election_id;
  const sortedOptions = [...(poll.poll_options || [])].sort((a, b) => a.display_order - b.display_order);

  return (
    <div 
      className={cn(
        'glass rounded-2xl p-4 transition-all duration-300',
        isActive && !hasVoted && 'cursor-pointer hover:border-primary/30 hover:glow-sm',
        hasVoted && 'border-primary/20'
      )}
      onClick={() => isActive && !hasVoted && onVote?.(poll)}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getCategoryEmoji(poll.category)}</span>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            isActive ? 'bg-primary/10 text-primary' : 
            isClosed ? 'bg-muted text-muted-foreground' : 
            'bg-warning/10 text-warning'
          )}>
            {poll.status}
          </span>
          {isAnonymous && (
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
        <span className="text-xs text-muted-foreground">Day {poll.day_number}</span>
      </div>

      {/* Question */}
      <h3 className="mb-1 text-sm font-semibold leading-tight">{poll.question}</h3>
      {poll.description && (
        <p className="mb-3 text-xs text-muted-foreground line-clamp-2">{poll.description}</p>
      )}

      {/* Options */}
      <div className="mb-3 space-y-2">
        {sortedOptions.map((opt) => {
          const isSelected = userVotedOptionId === opt.id;
          const percentage = isClosed && !isAnonymous && poll.total_votes ? Math.round((opt.vote_count || 0) / poll.total_votes * 100) : 
                           isClosed && isAnonymous && opt.vote_percentage ? Math.round(opt.vote_percentage) : null;
          const isWinner = opt.is_winner;
          const isConsensus = poll.crowd_consensus_option_id === opt.id;

          return (
            <div
              key={opt.id}
              className={cn(
                'relative overflow-hidden rounded-xl border px-3 py-2 text-sm transition-all',
                isSelected ? 'border-primary/50 bg-primary/5' :
                isWinner ? 'border-primary/30 bg-primary/5' :
                'border-border/50 bg-surface/50'
              )}
            >
              {/* Progress bar background */}
              {percentage !== null && (
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 transition-all duration-500',
                    isWinner ? 'bg-primary/10' : 'bg-muted/30'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {opt.flag_emoji && <span>{opt.flag_emoji}</span>}
                  <span className={cn('font-medium', isSelected && 'text-primary')}>{opt.label}</span>
                  {isSelected && <span className="text-[10px] text-primary">✓ Your pick</span>}
                  {isConsensus && <span className="text-[10px] text-primary">👥 Consensus</span>}
                </div>
                {percentage !== null && (
                  <span className="font-mono text-xs text-muted-foreground">{percentage}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>{poll.total_votes || 0} votes</span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && onForceClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onForceClose(poll.id); }}
              className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
            >
              Close Now ⏩
            </button>
          )}
          {isClosed && onReopen && (
            <button
              onClick={(e) => { e.stopPropagation(); onReopen(poll.id); }}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              Reopen 🔄
            </button>
          )}
          {isUpcoming && onActivate && (
            <button
              onClick={(e) => { e.stopPropagation(); onActivate(poll.id); }}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              Open Now ▶️
            </button>
          )}
          {isActive && (
            <div className="flex items-center gap-1 text-primary">
              <Clock className="h-3 w-3" />
              <span>{getTimeRemaining(poll.closes_at)}</span>
            </div>
          )}
          {hasVoted && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              +1,000 pts
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
