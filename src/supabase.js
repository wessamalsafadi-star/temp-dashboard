import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL  || 'https://lcakezpksltscljxszkq.supabase.co';
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

export async function fetchLatestSnapshot() {
  const { data, error } = await supabase
    .from('campaign_snapshots')
    .select('data, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return { campaigns: data.data || [], syncedAt: data.created_at };
}

export async function fetchLeadsByPeriod(days, from, to) {
  let query = supabase
    .from('leads')
    .select('campaign, template, created_at')
    .order('created_at', { ascending: true })
    .limit(10000);

  if (from && to) {
    // Custom range
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1); // include the to date fully
    query = query
      .gte('created_at', new Date(from).toISOString())
      .lt('created_at', toDate.toISOString());
  } else if (days && days > 0) {
    // Relative period
    const since = new Date();
    since.setDate(since.getDate() - days);
    query = query.gte('created_at', since.toISOString());
  }
  // days === 0 with no from/to = all time, no filter applied

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
