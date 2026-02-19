import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getCategoryEmoji } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Check, ChevronLeft } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

interface VoteSheetProps {
  poll: Poll;
  onSubmit: (optionId: string, confidence: string) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const confidenceLevels = [
  { value: 'low', label: 'Low', emoji: '🤔', desc: 'Just a guess' },
  { value: 'medium', label: 'Medium', emoji: '💭', desc: 'Somewhat confident' },
  { value: 'high', label: 'High', emoji: '🔥', desc: 'Very confident' },
];

export function VoteSheet({ poll, onSubmit, onClose, loading }: VoteSheetProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string>('medium');
  const sortedOptions = [...(poll.poll_options || [])].sort((a, b) => a.display_order - b.display_order);

  const handleSubmit = async () => {
    if (!selectedOption) return;
    await onSubmit(selectedOption, confidence);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-slide-up">
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg py-4">
          <button onClick={onClose} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{getCategoryEmoji(poll.category)}</span>
            <span className="text-xs uppercase tracking-wider text-primary font-semibold">Day {poll.day_number}</span>
          </div>
          <h2 className="text-xl font-bold leading-tight">{poll.question}</h2>
          {poll.description && (
            <p className="mt-1 text-sm text-muted-foreground">{poll.description}</p>
          )}
        </div>

        {/* Options */}
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select your prediction</p>
          {sortedOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelectedOption(opt.id)}
              className={cn(
                'w-full rounded-2xl border-2 px-4 py-4 text-left transition-all duration-200',
                selectedOption === opt.id
                  ? 'border-primary bg-primary/5 glow-sm'
                  : 'border-border/50 bg-surface/30 hover:border-border hover:bg-surface/50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {opt.flag_emoji && <span className="text-2xl">{opt.flag_emoji}</span>}
                  <span className="font-semibold">{opt.label}</span>
                </div>
                {selectedOption === opt.id && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary">
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Confidence */}
        {selectedOption && (
          <div className="mt-6 animate-fade-in">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence level</p>
            <div className="flex gap-2">
              {confidenceLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setConfidence(level.value)}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-3 py-3 text-center transition-all duration-200',
                    confidence === level.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border/50 bg-surface/30'
                  )}
                >
                  <span className="text-lg">{level.emoji}</span>
                  <p className="mt-1 text-xs font-semibold">{level.label}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submit button */}
      {selectedOption && (
        <div className="fixed bottom-0 left-0 right-0 glass-strong p-4 safe-bottom">
          <div className="mx-auto max-w-md">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-xl py-6 text-base font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {loading ? 'Submitting...' : 'Confirm Vote — Earn 1,000 pts'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
