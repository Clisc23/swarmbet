import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePolls } from '@/hooks/usePolls';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Lock, Search, Plus, Play, Square, RotateCcw, TrendingUp, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

// -- Types --
interface PolymarketMarket {
  id: string; question: string; slug: string; outcomePrices: string; outcomes: string;
  volume: number; active: boolean; closed: boolean;
}
interface PolymarketEvent {
  id: string; title: string; slug: string; description: string; image: string;
  volume: number; volume24hr: number; liquidity: number; markets: PolymarketMarket[];
}
interface PollFormData {
  question: string; description: string; category: string; day_number: number;
  opens_at: string; closes_at: string; status: string; polymarket_event_id: string;
  polymarket_slug: string; options: { label: string; flag_emoji: string; polymarket_price?: number | null }[];
}

const emptyForm: PollFormData = {
  question: '', description: '', category: 'sports', day_number: 1,
  opens_at: '', closes_at: '', status: 'upcoming', polymarket_event_id: '', polymarket_slug: '',
  options: [{ label: '', flag_emoji: '' }, { label: '', flag_emoji: '' }],
};

// -- Password Gate --
function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-verify', { body: { password: pw } });
      if (error || !data?.authenticated) { toast.error('Invalid password'); return; }
      onAuth(pw);
    } catch { toast.error('Auth failed'); }
    finally { setChecking(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Lock className="mx-auto h-8 w-8 text-primary mb-2" />
          <CardTitle>Admin Access</CardTitle>
          <CardDescription>Enter the admin password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus />
            <Button type="submit" className="w-full" disabled={checking || !pw}>
              {checking ? 'Checking…' : 'Enter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// -- Main Admin Dashboard --
export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('polls');
  const [prefill, setPrefill] = useState<Partial<PollFormData> | null>(null);

  const handleImport = useCallback((data: Partial<PollFormData>) => {
    setPrefill(data);
    setActiveTab('create');
    toast.success('Market imported! Finish filling the form below.');
  }, []);

  if (!password) return <PasswordGate onAuth={setPassword} />;

  return (
    <div className="min-h-screen pb-8">
      <header className="glass-strong sticky top-0 z-40 border-b border-border/50 px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-lg font-bold">🐝 Admin Dashboard</h1>
          <Button variant="ghost" size="sm" onClick={() => setPassword(null)}>Log out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 mb-6">
            <TabsTrigger value="polls">Manage Polls</TabsTrigger>
            <TabsTrigger value="create">Create Poll</TabsTrigger>
            <TabsTrigger value="polymarket">Polymarket</TabsTrigger>
          </TabsList>
          <TabsContent value="polls"><PollManager password={password} /></TabsContent>
          <TabsContent value="create">
            <CreatePoll password={password} prefill={prefill} onCreated={() => setPrefill(null)} />
          </TabsContent>
          <TabsContent value="polymarket"><PolymarketBrowser password={password} onImport={handleImport} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// -- Poll Manager --
function PollManager({ password }: { password: string }) {
  const { data: polls, isLoading } = usePolls();
  const queryClient = useQueryClient();

  const handleAction = useCallback(async (pollId: string, action: 'activate' | 'reopen') => {
    try {
      const { error } = await supabase.functions.invoke('demo-poll-action', { body: { poll_id: pollId, action } });
      if (error) throw error;
      toast.success(action === 'activate' ? 'Poll activated!' : 'Poll reopened!');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
    } catch (err: any) { toast.error(err.message); }
  }, [queryClient]);

  const handleClose = useCallback(async (pollId: string) => {
    try {
      const { error } = await supabase.functions.invoke('close-polls', { body: { force_poll_id: pollId } });
      if (error) throw error;
      toast.success('Poll closed & resolved!');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
    } catch (err: any) { toast.error(err.message); }
  }, [queryClient]);

  if (isLoading) return <p className="text-muted-foreground text-center py-8">Loading polls…</p>;

  const grouped = {
    active: (polls || []).filter(p => p.status === 'active'),
    upcoming: (polls || []).filter(p => p.status === 'upcoming'),
    closed: (polls || []).filter(p => p.status === 'closed' || p.status === 'resolved'),
  };

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([status, items]) => (
        <section key={status}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {status} ({items.length})
          </h3>
          {items.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
          <div className="space-y-2">
            {items.map(poll => (
              <Card key={poll.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{poll.question}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{poll.category}</Badge>
                      <Badge variant="outline" className="text-[10px]">Day {poll.day_number}</Badge>
                      <Badge variant="outline" className="text-[10px]">{poll.total_votes || 0} votes</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {status === 'upcoming' && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(poll.id, 'activate')}>
                        <Play className="h-3 w-3 mr-1" /> Activate
                      </Button>
                    )}
                    {status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => handleClose(poll.id)}>
                        <Square className="h-3 w-3 mr-1" /> Close
                      </Button>
                    )}
                    {status === 'closed' && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(poll.id, 'reopen')}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// -- Create Poll --
function CreatePoll({ password, prefill, onCreated }: { password: string; prefill?: Partial<PollFormData> | null; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PollFormData>({ ...emptyForm });

  // Apply prefill when it changes
  useEffect(() => {
    if (prefill) {
      setForm(prev => ({
        ...prev,
        question: prefill.question || prev.question,
        description: prefill.description || prev.description,
        category: prefill.category || prev.category,
        polymarket_event_id: prefill.polymarket_event_id || '',
        polymarket_slug: prefill.polymarket_slug || '',
        options: prefill.options && prefill.options.length >= 2 ? prefill.options : prev.options,
      }));
    }
  }, [prefill]);

  const updateField = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const updateOption = (idx: number, field: string, value: string) => {
    const opts = [...form.options];
    opts[idx] = { ...opts[idx], [field]: value };
    setForm(prev => ({ ...prev, options: opts }));
  };
  const addOption = () => setForm(prev => ({ ...prev, options: [...prev.options, { label: '', flag_emoji: '' }] }));
  const removeOption = (idx: number) => {
    if (form.options.length <= 2) return;
    setForm(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.question || form.options.some(o => !o.label)) {
      toast.error('Fill in question and all options');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-poll', {
        body: {
          password,
          poll: {
            question: form.question,
            description: form.description || null,
            category: form.category,
            day_number: form.day_number,
            opens_at: form.opens_at ? new Date(form.opens_at).toISOString() : new Date().toISOString(),
            closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: form.status,
            polymarket_event_id: form.polymarket_event_id || null,
            polymarket_slug: form.polymarket_slug || null,
          },
          options: form.options,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Poll created!');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      setForm({ ...emptyForm });
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create poll');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Question *</Label>
          <Input value={form.question} onChange={(e) => updateField('question', e.target.value)} placeholder="Who will win the NBA Finals?" />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Optional description" />
        </div>
        <div>
          <Label>Category *</Label>
          <Input value={form.category} onChange={(e) => updateField('category', e.target.value)} placeholder="sports" />
        </div>
        <div>
          <Label>Day Number *</Label>
          <Input type="number" min={1} value={form.day_number} onChange={(e) => updateField('day_number', parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <Label>Opens At</Label>
          <Input type="datetime-local" value={form.opens_at} onChange={(e) => updateField('opens_at', e.target.value)} />
        </div>
        <div>
          <Label>Closes At</Label>
          <Input type="datetime-local" value={form.closes_at} onChange={(e) => updateField('closes_at', e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>

      {(form.polymarket_event_id || form.polymarket_slug) && (
        <div className="glass rounded-lg p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">Linked to Polymarket:</span>{' '}
          {form.polymarket_slug || form.polymarket_event_id}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Options *</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addOption}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {form.options.map((opt, idx) => (
            <div key={idx} className="flex gap-2">
              <Input className="w-16" placeholder="🏀" value={opt.flag_emoji} onChange={(e) => updateOption(idx, 'flag_emoji', e.target.value)} />
              <Input className="flex-1" placeholder={`Option ${idx + 1}`} value={opt.label} onChange={(e) => updateOption(idx, 'label', e.target.value)} />
              {form.options.length > 2 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(idx)} className="text-destructive">✕</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Poll'}
      </Button>
    </form>
  );
}

// -- Polymarket Browser --
function PolymarketBrowser({ password, onImport }: { password: string; onImport: (data: Partial<PollFormData>) => void }) {
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<PolymarketEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const search = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('polymarket-search', {
        body: { password, query: searchQuery || query, limit: 20 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEvents(data.events || []);
      if ((data.events || []).length === 0) toast.info('No events found');
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [password, query]);

  const formatVolume = (v: number) => {
    if (!v) return '$0';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Polymarket events…"
          onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button onClick={() => search()} disabled={loading}><Search className="h-4 w-4" /></Button>
        <Button variant="outline" onClick={() => { setQuery(''); search(''); }} disabled={loading}>
          <TrendingUp className="h-4 w-4" />
        </Button>
      </div>

      {loading && <p className="text-center text-muted-foreground py-8">Searching…</p>}

      <div className="space-y-2">
        {events.map((event) => (
          <Card key={event.id}>
            <div className="p-4 cursor-pointer" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>
              <div className="flex items-start gap-3">
                {event.image && <img src={event.image} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{event.title}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">Vol: {formatVolume(event.volume)}</Badge>
                    <Badge variant="outline" className="text-[10px]">24h: {formatVolume(event.volume24hr)}</Badge>
                    <Badge variant="outline" className="text-[10px]">{event.markets.length} market{event.markets.length !== 1 ? 's' : ''}</Badge>
                  </div>
                </div>
                {expanded === event.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {expanded === event.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                {event.description && (
                  <p className="text-xs text-muted-foreground">{event.description.slice(0, 200)}{event.description.length > 200 ? '…' : ''}</p>
                )}
                {event.markets.map((market) => {
                  let outcomes: string[] = [];
                  let prices: number[] = [];
                  try { outcomes = JSON.parse(market.outcomes || '[]'); } catch { outcomes = []; }
                  try { prices = JSON.parse(market.outcomePrices || '[]').map(Number); } catch { prices = []; }

                  return (
                    <div key={market.id} className="glass rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium">{market.question}</p>
                      <div className="flex flex-wrap gap-1">
                        {outcomes.map((outcome, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {outcome}: {prices[i] ? `${(prices[i] * 100).toFixed(0)}%` : '–'}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onImport({
                          question: market.question,
                          description: event.description?.slice(0, 500) || '',
                          category: 'prediction',
                          polymarket_event_id: event.id,
                          polymarket_slug: event.slug,
                          options: outcomes.map((o, i) => ({ label: o, flag_emoji: '', polymarket_price: prices[i] || null })),
                        })}>
                          <Plus className="h-3 w-3 mr-1" /> Import as Poll
                        </Button>
                         <a href={`https://polymarket.com/event/${event.slug}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3" /></Button>
                        </a>
                      </div>
                    </div>
                  );
                })}

                {/* Import entire event as a poll */}
                <div className="border-t border-border/50 pt-3">
                  <Button size="sm" variant="default" onClick={() => {
                    // Take top 4 markets by volume, use their questions as options
                    const topMarkets = [...event.markets]
                      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
                      .slice(0, 4);
                    if (topMarkets.length < 2) {
                      toast.error('Event needs at least 2 markets to import');
                      return;
                    }
                    onImport({
                      question: event.title,
                      description: event.description?.slice(0, 500) || '',
                      category: 'prediction',
                      polymarket_event_id: event.id,
                      polymarket_slug: event.slug,
                      options: topMarkets.map((m) => {
                        let prices: number[] = [];
                        try { prices = JSON.parse(m.outcomePrices || '[]').map(Number); } catch {}
                        // Use the "Yes" price (first outcome) as the polymarket_price
                        return { label: m.question, flag_emoji: '', polymarket_price: prices[0] || null };
                      }),
                    });
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Import Event as Poll (top {Math.min(event.markets.length, 4)} markets)
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
