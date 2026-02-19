import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboard, useUserRank, useTotalUsers } from '@/hooks/useLeaderboard';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { LeaderboardList, LeaderboardRow } from '@/components/LeaderboardList';
import { Trophy, Users } from 'lucide-react';
import { formatPoints } from '@/lib/helpers';

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { data: leaderboard, isLoading } = useLeaderboard(50, 0);
  const { data: userRank } = useUserRank(profile?.id);
  const { data: totalUsers } = useTotalUsers();

  return (
    <div className="min-h-screen pb-20">
      <Header />
      <main className="mx-auto max-w-md px-4 py-4 space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold">Leaderboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top 10% shares the 3 ETH prize pool
          </p>
        </div>

        {/* User rank card */}
        {profile && userRank && (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Your Position</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{totalUsers || 0} players</span>
              </div>
            </div>
            <LeaderboardRow
              entry={{
                rank: userRank,
                player_id: profile.id,
                username: profile.username,
                avatar_seed: profile.avatar_seed || '',
                swarm_points: profile.swarm_points,
                accuracy_score: profile.accuracy_score || 0,
                current_streak: profile.current_streak || 0,
                max_streak: profile.max_streak || 0,
                total_predictions: profile.total_predictions || 0,
              }}
              isCurrentUser
            />
            {totalUsers && userRank && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Prize zone: top {Math.ceil(totalUsers * 0.1)}</span>
                  <span>{userRank <= Math.ceil(totalUsers * 0.1) ? '🏆 In the money!' : `${Math.ceil(totalUsers * 0.1) - userRank + 1} spots away`}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-primary"
                    style={{ width: `${Math.max(5, Math.min(100, ((totalUsers - userRank + 1) / totalUsers) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="glass rounded-xl p-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <LeaderboardList
            entries={leaderboard || []}
            currentUserId={profile?.id}
          />
        )}
      </main>
      <BottomNav />
    </div>
  );
}
