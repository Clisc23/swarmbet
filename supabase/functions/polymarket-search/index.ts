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
    // Verify admin password
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    const { password, query, tag, limit = 20, offset = 0 } = await req.json();

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build Polymarket search URL
    let url: string;
    if (query) {
      url = `${GAMMA_API}/events?title_contains=${encodeURIComponent(query)}&active=true&closed=false&limit=${limit}&offset=${offset}`;
    } else if (tag) {
      url = `${GAMMA_API}/events?tag=${encodeURIComponent(tag)}&active=true&closed=false&limit=${limit}&offset=${offset}`;
    } else {
      url = `${GAMMA_API}/events?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume24hr&ascending=false`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polymarket API error [${res.status}]: ${text}`);
    }

    const events = await res.json();

    // Transform to a simpler format
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
      markets: (event.markets || []).map((m: any) => ({
        id: m.id,
        question: m.question,
        slug: m.slug,
        outcomePrices: m.outcomePrices,
        outcomes: m.outcomes,
        volume: m.volume,
        active: m.active,
        closed: m.closed,
      })),
    }));

    return new Response(JSON.stringify({ events: transformed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
