import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GAMMA_API = 'https://gamma-api.polymarket.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');

    const body = await req.json();
    const { password, action } = body;

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch available tags
    if (action === 'tags') {
      const tagsRes = await fetch(`${GAMMA_API}/tags`);
      if (!tagsRes.ok) throw new Error(`Tags API error [${tagsRes.status}]`);
      const tags = await tagsRes.json();
      return new Response(JSON.stringify({ tags }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch sports metadata
    if (action === 'sports') {
      const sportsRes = await fetch(`${GAMMA_API}/sports`);
      if (!sportsRes.ok) throw new Error(`Sports API error [${sportsRes.status}]`);
      const sports = await sportsRes.json();
      return new Response(JSON.stringify({ sports }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { query, tag_id, limit = 20, offset = 0, end_date_max, end_date_min } = body;
    const validOrders = ['volume', 'liquidity', 'created_at'];
    const order = validOrders.includes(body.order) ? body.order : 'volume';
    const ascending = body.ascending ?? false;

    // Build Polymarket search URL
    const params = new URLSearchParams();
    params.set('active', 'true');
    params.set('closed', 'false');
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    params.set('order', order);
    params.set('ascending', String(ascending));

    if (query) params.set('title_contains', query);
    if (tag_id) params.set('tag_id', String(tag_id));
    if (end_date_max) params.set('end_date_max', end_date_max);
    if (end_date_min) params.set('end_date_min', end_date_min);

    const url = `${GAMMA_API}/events?${params.toString()}`;
    console.log('Fetching Polymarket:', url);

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polymarket API error [${res.status}]: ${text}`);
    }

    const events = await res.json();

    const transformed = (Array.isArray(events) ? events : []).map((event: any) => ({
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      image: event.image,
      startDate: event.startDate,
      endDate: event.endDate,
      volume: event.volume,
      volume24hr: event.volume24hr,
      liquidity: event.liquidity,
      tags: (event.tags || []).map((t: any) => t.label || t.slug || ''),
      markets: (event.markets || []).map((m: any) => ({
        id: m.id,
        question: m.question,
        slug: m.slug,
        outcomePrices: m.outcomePrices,
        outcomes: m.outcomes,
        volume: m.volume,
        active: m.active,
        closed: m.closed,
        endDate: m.endDate,
      })),
    }));

    return new Response(JSON.stringify({ events: transformed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
