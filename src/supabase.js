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
