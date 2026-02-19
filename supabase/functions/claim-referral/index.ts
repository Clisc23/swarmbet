import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { referral_code } = await req.json();

    // Get current user
    const { data: currentUser } = await supabase
      .from('users')
      .select('*')
      .eq('auth_uid', authUser.id)
      .single();

    if (!currentUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (currentUser.referred_by) {
      return new Response(JSON.stringify({ error: 'Already referred' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find referrer
    const { data: referrer } = await supabase
      .from('users')
      .select('*')
      .eq('referral_code', referral_code)
      .single();

    if (!referrer || referrer.id === currentUser.id) {
      return new Response(JSON.stringify({ error: 'Invalid referral code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create referral
    await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: currentUser.id,
      points_awarded: 100,
    });

    // Award points to both
    await supabase.from('users').update({ swarm_points: referrer.swarm_points + 100, referral_count: (referrer.referral_count || 0) + 1 }).eq('id', referrer.id);
    await supabase.from('users').update({ swarm_points: currentUser.swarm_points + 100, referred_by: referrer.id }).eq('id', currentUser.id);

    await supabase.from('points_history').insert([
      { user_id: referrer.id, amount: 100, type: 'referral_given', description: `Referred ${currentUser.username}` },
      { user_id: currentUser.id, amount: 100, type: 'referral_received', description: `Referred by ${referrer.username}` },
    ]);

    return new Response(JSON.stringify({ success: true, referrer_username: referrer.username }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
