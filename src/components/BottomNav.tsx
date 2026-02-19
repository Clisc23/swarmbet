import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/polls', icon: BarChart3, label: 'Polls' },
  { path: '/leaderboard', icon: Trophy, label: 'Ranks' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-bottom">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = tab.path === '/' 
            ? location.pathname === '/' 
            : location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 transition-all duration-200',
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className={cn('h-5 w-5', isActive && 'glow-sm')} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && (
                <div className="h-0.5 w-4 rounded-full gradient-primary mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
