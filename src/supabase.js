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
  let fromDate = null;
  let toDate   = null;

  if (from && to) {
    fromDate = new Date(from).toISOString();
    const t  = new Date(to);
    t.setDate(t.getDate() + 1);
    toDate = t.toISOString();
  } else if (days && days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    fromDate = since.toISOString();
  }

  const { data, error } = await supabase.rpc('get_leads_summary', {
    from_date: fromDate,
    to_date:   toDate,
  });

  if (error) throw error;
  return data || [];
}

// ─── ActiveCampaign campaigns ───────────────────────────────────────────────
// active_campaigns rows only carry `name` + `templates` (text[]) — no
// contacts/openRate/click stats exist for this source. Those get filled in
// with CMS data from active_campaign_templates and lead counts from the
// same `leads` table the Engage CMS side already uses.
export async function fetchActiveCampaigns() {
  const { data, error } = await supabase
    .from('active_campaigns')
    .select('id, created_at, name, templates')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchActiveCampaignTemplates() {
  const { data, error } = await supabase
    .from('active_campaign_templates')
    .select('template_name, body, header, buttons, updated_at');

  if (error) throw error;
  return data || [];
}
