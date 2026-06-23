import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  fetchLatestSnapshot, fetchLeadsByPeriod,
  fetchActiveCampaigns, fetchActiveCampaignTemplates,
} from './supabase';
import './App.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n) => (n == null ? '—' : n.toLocaleString());
const pct   = (n, d) => (n == null || !d) ? '—' : Math.round((n / d) * 100) + '%';
const round = (n) => (n == null ? null : Math.round(n * 10) / 10);
const dash  = (v, suffix = '') => (v == null ? '—' : `${round(v)}${suffix}`);

function healthScore({ contacts = 0, openRate = 0, clicks = 0, leads = 0 }) {
  if (!contacts) return 0;
  return Math.round(openRate * 0.5 + (clicks / contacts) * 100 * 0.3 + (leads / contacts) * 100 * 0.2);
}
const healthColor = (s) => (s >= 60 ? '#00d4aa' : s >= 30 ? '#f5a623' : '#ff4d4d');

// ── Campaign categories ─────────────────────────────────────────────────────
// Future-proofed: if the campaign record carries `category`, that wins. Until the
// pipeline sets it, we infer from the name so the segmentation is useful today.
const CATEGORIES = [
  { key: 'all',    label: 'All',    color: 'var(--text-1)' },
  { key: 'reheat', label: 'Reheat', color: '#ff9d4d' },
  { key: 'refer',  label: 'Refer',  color: '#4d9fff' },
  { key: 'retain', label: 'Retain', color: '#00d4aa' },
  { key: 'other',  label: 'Other',  color: '#5b6b7d' },
];
const CAT_META = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function categoryOf(c) {
  if (c?.category && CAT_META[c.category]) return c.category;
  const n = (c?.campaignName || '').toLowerCase();
  if (/\b(reheat|re-?engage|re-?activat|win.?back|dormant|cold|lapsed)\b/.test(n)) return 'reheat';
  if (/\b(refer|referral|introduce|friend)\b/.test(n))                              return 'refer';
  if (/\b(retain|retention|renew|tenant|loyalty|keep)\b/.test(n))                   return 'retain';
  return 'other';
}

// ── Source (Engage CMS vs ActiveCampaign) ───────────────────────────────────
const SOURCES = [
  { key: 'all',      label: 'All sources' },
  { key: 'engage',    label: 'Engage CMS' },
  { key: 'activecampaign', label: 'ActiveCampaign' },
];

const tierOf = (color) =>
  color === '#00d4aa' ? 'top' : color === '#f5a623' ? 'mid' : color === '#ff6b6b' ? 'low' : 'none';
const TIERS = [['all', 'All'], ['top', 'Top'], ['mid', 'Mid'], ['low', 'Low'], ['none', 'No signal']];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function interpolate(text) {
  if (!text) return '';
  return text
    .replace(/\{\{customer_first_name\}\}/g, 'Sarah')
    .replace(/\{\{first_name\}\}/g, 'Sarah')
    .replace(/\{\{[^}]+\}\}/g, '…');
}

const PERIODS = [
  { label: 'Last 7 days',   days: 7   },
  { label: 'Last month',    days: 30  },
  { label: 'Last 3 months', days: 90  },
  { label: 'Last 6 months', days: 180 },
  { label: 'All time',      days: 0   },
];

// ─── Normalize ActiveCampaign rows into the same shape as Engage CMS campaigns ──
// AC has no contacts/openRate/click metrics — those stay null so every
// metric-rendering helper (fmt/pct/dash) already falls back to '—'.
// Variants are built from `templates[]`, joined against the CMS cache
// (active_campaign_templates) for the preview, and lead counts come from
// `periodLeadsMap`/`periodLeadsRaw`, the same `leads` rows Engage CMS uses,
// filtered by campaign name.
function normalizeActiveCampaigns(rows, templateMap) {
  return rows.map(r => {
    const templates = r.templates || [];
    const variants = templates.map((t, i) => {
      const cms = templateMap[t];
      return {
        id: `${r.id}_${t}`,
        name: templates.length > 1 ? `Template ${i + 1}` : 'Template',
        template: t,
        percentage: templates.length ? Math.round(100 / templates.length) : null,
        metrics: { numberOfContacts: null, openRate: null, clicksByUser: null, numberOfLeads: null },
        cms: cms ? {
          title: null,
          headerType: cms.header ? 'IMAGE' : 'TEXT', // AC sync doesn't capture type; image is the common case
          header: cms.header,
          body: cms.body,
          buttons: cms.buttons || [],
        } : null,
      };
    });

    return {
      _id: `ac_${r.id}`,
      campaignName: r.name,
      dateCreated: r.created_at,
      numberOfContacts: null,
      openRate: null,
      clicksByUser: null,
      numberOfLeads: null,
      status: undefined,
      source: 'activecampaign',
      variants,
    };
  });
}

// ─── Tiny inline sparkline ──────────────────────────────────────────────────────
function Sparkline({ values, color = '#00d4aa', w = 66, h = 22 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const lastY = h - (values[values.length - 1] / max) * (h - 4) - 2;
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────
function Chip({ label, value, accent, sub }) {
  return (
    <div className="chip" style={{ '--accent-chip': accent || 'var(--accent)' }}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
      {sub && <span className="chip-sub">{sub}</span>}
    </div>
  );
}

// ─── Source badge ────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  if (source !== 'activecampaign') return null;
  return <span className="tag tag-mono source-badge">AC</span>;
}

// ─── WA phone preview ─────────────────────────────────────────────────────────
function WhatsAppPreview({ cms }) {
  if (!cms) return (
    <div className="wa-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>No CMS data linked</span>
    </div>
  );

  const { header, headerType, body, buttons = [] } = cms;
  const lines = interpolate(body || '').split('\n');

  return (
    <div className="wa-phone">
      <div className="wa-bar">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M6.5 1.5L3 5l3.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <div className="wa-avatar">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <div className="wa-contact">Campaign contact</div>
          <div className="wa-online">online</div>
        </div>
      </div>
      <div className="wa-chat">
        <div className="wa-day-label">Today</div>
        <div className="wa-bubble-wrap">
          <div className="wa-bubble">
            {header && headerType === 'IMAGE' && (
              <img src={header} alt="header" className="wa-header-img"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
            {header && headerType === 'VIDEO' && (
              <video src={header} controls playsInline preload="metadata" className="wa-header-video"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
            <div className="wa-body">
              {lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 ? '\n' : ''}</span>)}
            </div>
            <div className="wa-meta">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              <svg width="15" height="9" viewBox="0 0 16 10" fill="none">
                <path d="M1 5l3 3 5-7" stroke="#53bdeb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 5l3 3 5-7" stroke="#53bdeb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {buttons.length > 0 && (
              <div className="wa-buttons">
                {buttons.map((b, i) => (
                  <div key={i} className="wa-btn">{b.content}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="wa-input-bar">
        <div className="wa-input-fake">Message</div>
        <div className="wa-send">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </div>
      </div>
    </div>
  );
}

// ─── A/B variant comparison ─────────────────────────────────────────────────────
function VariantComparison({ variants, periodLeadsByTemplate, winnerInfo }) {
  const rows = variants.map(v => ({
    id: v.id || v.name,
    name: v.name,
    open: v.metrics?.openRate || 0,
    clicks: v.metrics?.clicksByUser || 0,
    leads: periodLeadsByTemplate[v.template] || 0,
  }));

  const metrics = [
    { k: 'open',   label: 'Open rate',    color: '#00d4aa', fmt: v => round(v) + '%' },
    { k: 'clicks', label: 'Clicks',       color: '#f5a623', fmt: v => fmt(v) },
    { k: 'leads',  label: 'Period leads', color: '#a78bfa', fmt: v => fmt(v) },
  ];

  const winnerName = rows.find(r => r.id === winnerInfo.id)?.name;
  const liftLabel = winnerInfo.lift <= 0
    ? 'no clear leader yet'
    : `+${metrics.find(x => x.k === winnerInfo.key).fmt(winnerInfo.lift)} ${metrics.find(x => x.k === winnerInfo.key).label.toLowerCase()} vs next best`;

  return (
    <div className="vcmp">
      <div className="vcmp-head">
        <span className="vcmp-trophy">🏆</span>
        <span className="vcmp-winner-name">{winnerName}</span>
        <span className="vcmp-lift">{liftLabel}</span>
      </div>
      <div className="vcmp-grid" style={{ gridTemplateColumns: `96px repeat(${rows.length}, 1fr)` }}>
        <div />
        {rows.map(r => (
          <div key={r.id} className={`vcmp-col-head ${r.id === winnerInfo.id ? 'win' : ''}`}>
            {r.name}{r.id === winnerInfo.id && <span className="vcmp-tag">WIN</span>}
          </div>
        ))}
        {metrics.map(m => {
          const max = Math.max(...rows.map(r => r[m.k]), 1);
          return (
            <FragmentRow key={m.k} label={m.label}>
              {rows.map(r => (
                <div key={r.id} className="vcmp-cell">
                  <div className="vcmp-track">
                    <div className="vcmp-bar"
                      style={{ width: `${(r[m.k] / max) * 100}%`, background: m.color, opacity: r.id === winnerInfo.id ? 1 : 0.45 }} />
                  </div>
                  <span className="vcmp-val" style={{ color: r.id === winnerInfo.id ? m.color : 'var(--text-2)' }}>
                    {m.fmt(r[m.k])}
                  </span>
                </div>
              ))}
            </FragmentRow>
          );
        })}
      </div>
    </div>
  );
}
function FragmentRow({ label, children }) {
  return (<><div className="vcmp-row-label">{label}</div>{children}</>);
}

// ─── Variant analytics panel (drill-down — preserved) ───────────────────────────
function VariantDetail({ variant, accentColor, onClose }) {
  const [tab, setTab] = useState(variant.cms ? 'preview' : 'analytics');
  const { name, template, metrics = {}, cms } = variant;
  const { numberOfContacts: sent, openRate, clicksByUser: clicks, numberOfLeads: leads } = metrics;
  const hasMetrics = sent != null;

  const openCount = hasMetrics ? Math.round(((openRate || 0) / 100) * sent) : null;
  const health    = hasMetrics ? healthScore({ contacts: sent, openRate, clicks, leads }) : null;
  const hColor    = health != null ? healthColor(health) : 'var(--text-3)';
  const leadsDead = hasMetrics && (leads || 0) === 0 && sent > 0;

  const funnelData = hasMetrics ? [
    { stage: 'Sent',    count: sent,           fill: '#4d9fff' },
    { stage: 'Opened',  count: openCount,      fill: '#00d4aa' },
    { stage: 'Clicked', count: clicks || 0,    fill: '#f5a623' },
    { stage: 'Leads',   count: leads || 0,     fill: '#a78bfa' },
  ] : [];

  return (
    <div className="variant-detail" style={{ '--vd-accent': accentColor }}>
      <div className="vd-header">
        <div><div className="vd-name">{name} — <span className="vd-template">{template}</span></div></div>
        <button className="vd-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="vd-tabs">
        {variant.cms && <button className={`vd-tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')}>📱 Preview</button>}
        <button className={`vd-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>📊 Analytics</button>
      </div>
      <div className="vd-body">
        {tab === 'preview' && (
          <div className="vd-preview-grid">
            <WhatsAppPreview cms={cms} />
            <div className="vd-cms-meta">
              {cms?.title && (
                <div className="vd-meta-block">
                  <div className="vd-meta-label">Template title</div>
                  <div className="vd-meta-value">{cms.title}</div>
                </div>
              )}
              <div className="vd-meta-block">
                <div className="vd-meta-label">Header type</div>
                <span className="tag tag-blue">{cms?.headerType || 'TEXT'}</span>
              </div>
              {cms?.header && (
                <div className="vd-meta-block">
                  <div className="vd-meta-label">Header media</div>
                  {cms.headerType === 'IMAGE' && (
                    <img src={cms.header} alt="header" style={{ width: '100%', borderRadius: 8, maxHeight: 120, objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {cms.headerType === 'VIDEO' && (
                    <video src={cms.header} controls playsInline preload="metadata"
                      style={{ width: '100%', borderRadius: 8, maxHeight: 120, background: '#000' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>
              )}
              {cms?.buttons?.length > 0 && (
                <div className="vd-meta-block">
                  <div className="vd-meta-label">Buttons ({cms.buttons.length})</div>
                  {cms.buttons.map((b, i) => (
                    <div key={i} className="vd-button-card">
                      <div className="vd-button-content">{b.content}</div>
                      {b.replyText && <div className="vd-button-reply">Reply: "{b.replyText}"</div>}
                      {b.actions?.length > 0 && (
                        <div className="vd-button-actions">
                          {b.actions.map((a, j) => (
                            <span key={j} className="tag tag-gray">
                              {a.type}{a.data?.labelName ? ` · ${a.data.labelName}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="vd-quick-stats">
                <div className="vd-meta-label" style={{ marginBottom: 8 }}>Quick stats</div>
                {[['Sent', fmt(sent), '#4d9fff'], ['Open rate', dash(openRate, '%'), '#00d4aa'], ['Clicks', fmt(clicks), '#f5a623'], ['Leads', fmt(leads), '#a78bfa']].map(([l, v, c]) => (
                  <div key={l} className="vd-stat-row"><span>{l}</span><span style={{ color: c, fontWeight: 600 }}>{v}</span></div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'analytics' && (
          <>
            <div className="vd-kpis">
              <Chip label="Sent"      value={fmt(sent)}             accent="#4d9fff" />
              <Chip label="Open rate" value={dash(openRate, '%')}   accent="#00d4aa" sub={hasMetrics ? fmt(openCount) + ' opened' : undefined} />
              <Chip label="Clicks"    value={fmt(clicks)}           accent="#f5a623" sub={hasMetrics ? pct(clicks, sent) + ' of sent' : undefined} />
              <Chip label="Leads"     value={leadsDead ? '—' : fmt(leads)} accent={leadsDead ? 'var(--text-3)' : '#a78bfa'} sub={!hasMetrics ? undefined : leadsDead ? 'none recorded' : pct(leads, sent) + ' conversion'} />
              <Chip label="Health"    value={hasMetrics ? health : '—'}   accent={hasMetrics ? hColor : 'var(--text-3)'} sub={hasMetrics ? 'out of 100' : 'no data'} />
            </div>
            <div className="vd-charts">
              <div className="chart-card">
                <div className="chart-title">Funnel</div>
                {!hasMetrics && <div className="no-variants">No funnel metrics for this source.</div>}
                {hasMetrics && funnelData.map((f, i) => (
                  <div key={f.stage} style={{ marginBottom: i < funnelData.length - 1 ? 12 : 0 }}>
                    <div className="funnel-row">
                      <span>{f.stage}</span>
                      <span style={{ color: f.fill }}>{fmt(f.count)} <span className="funnel-pct">({pct(f.count, sent)})</span></span>
                    </div>
                    <div className="funnel-track"><div className="funnel-bar" style={{ width: pct(f.count, sent) === '—' ? '0%' : pct(f.count, sent), background: f.fill }} /></div>
                  </div>
                ))}
              </div>
              <div className="chart-card">
                <div className="chart-title">Breakdown</div>
                {hasMetrics ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={funnelData.filter(f => f.count > 0)} dataKey="count" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                          {funnelData.map(f => <Cell key={f.stage} fill={f.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--navy-3)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 12 }} formatter={v => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pie-legend">
                      {funnelData.map(f => (
                        <span key={f.stage} className="legend-item"><span className="legend-dot" style={{ background: f.fill }} />{f.stage}</span>
                      ))}
                    </div>
                  </>
                ) : <div className="no-variants">No breakdown available for this source.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Campaign detail (rendered inside the drawer) ───────────────────────────────
function CampaignDetail({ campaign, periodLeadsRaw, periodLeadsMap, accent }) {
  const [active, setActive] = useState(null);
  const { campaignName, numberOfContacts, openRate, clicksByUser, numberOfLeads, variants = [] } = campaign;
  const hasMetrics = numberOfContacts != null;

  const periodLeadsByTemplate = useMemo(() => {
    const map = {};
    (periodLeadsRaw || []).forEach(l => { if (l.template) map[l.template] = (map[l.template] || 0) + Number(l.lead_count); });
    return map;
  }, [periodLeadsRaw]);

  const winnerInfo = useMemo(() => {
    if (variants.length < 2) return null;
    const rows = variants.map(v => ({
      id: v.id || v.name,
      leads: periodLeadsByTemplate[v.template] || 0,
      clicks: v.metrics?.clicksByUser || 0,
      open: v.metrics?.openRate || 0,
    }));
    const key = rows.some(r => r.leads > 0) ? 'leads' : rows.some(r => r.clicks > 0) ? 'clicks' : 'open';
    const sorted = [...rows].sort((a, b) => b[key] - a[key]);
    return { id: sorted[0].id, key, lift: sorted[0][key] - (sorted[1]?.[key] || 0) };
  }, [variants, periodLeadsByTemplate]);

  const campaignPeriodLeads = periodLeadsMap?.[campaignName] || 0;
  const convRate  = (hasMetrics && numberOfContacts) ? ((numberOfLeads / numberOfContacts) * 100).toFixed(1) : null;
  const leadsDead = hasMetrics && (numberOfLeads || 0) === 0 && (numberOfContacts || 0) > 0;

  return (
    <>
      <div className="drawer-stats">
        <Chip label="Contacts"     value={fmt(numberOfContacts)}      accent="#4d9fff" />
        <Chip label="Open rate"    value={dash(openRate, '%')}        accent="#00d4aa" />
        <Chip label="Clicks"       value={fmt(clicksByUser)}          accent="#f5a623" />
        <Chip label="Period leads" value={fmt(campaignPeriodLeads)}   accent="#a78bfa" sub={hasMetrics ? fmt(numberOfLeads) + ' all-time' : undefined} />
        <Chip label="Conv."        value={leadsDead ? '—' : (convRate == null ? '—' : convRate + '%')} accent={leadsDead || convRate == null ? 'var(--text-3)' : '#ff9d4d'} />
      </div>

      {variants.length === 0 ? (
        <div className="no-variants">No variants configured for this campaign.</div>
      ) : (
        <>
          {winnerInfo && hasMetrics && (
            <VariantComparison variants={variants} periodLeadsByTemplate={periodLeadsByTemplate} winnerInfo={winnerInfo} />
          )}
          <div className="variants-grid">
            {variants.map(v => {
              const vkey = v.id || v.name;
              const isActive = active === vkey;
              const hasCms = !!v.cms;
              const isWinner = winnerInfo?.id === vkey;
              return (
                <div key={vkey} className={`variant-card ${isActive ? 'active' : ''} ${isWinner ? 'winner' : ''}`} style={{ '--vc-accent': isWinner ? '#00d4aa' : 'var(--border-2)' }}>
                  <div className="vc-top">
                    <div className="vc-name">{v.name}{isWinner && <span className="winner-badge">WIN</span>}</div>
                    <span className="tag tag-mono">{v.template}</span>
                  </div>
                  <div className="vc-pct-bar"><div className="vc-pct-fill" style={{ width: `${v.percentage || 0}%` }} /></div>
                  <div className="vc-pct-label">{v.percentage != null ? `${v.percentage}% of audience` : 'split unknown'}</div>
                  <div className="vc-metrics">
                    {[
                      ['Contacts',       fmt(v.metrics?.numberOfContacts),                '#4d9fff'],
                      ['Open',           dash(v.metrics?.openRate, '%'),                  '#00d4aa'],
                      ['Clicks',         fmt(v.metrics?.clicksByUser),                    '#f5a623'],
                      ['All-time leads', fmt(v.metrics?.numberOfLeads),                   '#a78bfa'],
                      ['Period leads',   fmt(periodLeadsByTemplate[v.template] || 0),     '#00d4aa'],
                    ].map(([l, val, c]) => (
                      <div key={l} className="vc-metric-row">
                        <span className="vc-metric-lbl">{l}</span>
                        <span className="vc-metric-val" style={{ color: c }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="vc-actions">
                    {hasCms && (
                      <button className={`vc-btn ${isActive ? 'primary' : ''}`} onClick={() => setActive(isActive ? null : vkey)}>
                        {isActive ? '▲ Hide' : '📱 Preview'}
                      </button>
                    )}
                    <button className={`vc-btn ${isActive && !hasCms ? 'primary' : ''}`} onClick={() => setActive(isActive ? null : vkey)}>
                      {isActive ? '▲ Hide' : '📊 Analytics'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {active && (() => {
            const v = variants.find(v => (v.id || v.name) === active);
            return v ? <VariantDetail variant={v} accentColor={accent} onClose={() => setActive(null)} /> : null;
          })()}
        </>
      )}
    </>
  );
}

// ─── Campaign row (list item — click to open drawer) ────────────────────────────
function CampaignRow({ campaign, index, periodLeadsMap, periodLeadsRaw, accentColor, selected, onSelect }) {
  const {
    campaignName, dateCreated,
    numberOfContacts, openRate, clicksByUser, numberOfLeads,
    variants = [], source,
  } = campaign;
  const hasMetrics = numberOfContacts != null;

  const sparkValues = useMemo(() => {
    const m = {};
    (periodLeadsRaw || []).forEach(l => { if (l.campaign === campaignName) m[l.day] = (m[l.day] || 0) + Number(l.lead_count); });
    return Object.keys(m).sort().map(k => m[k]);
  }, [periodLeadsRaw, campaignName]);

  const convRate = (hasMetrics && numberOfContacts) ? ((numberOfLeads / numberOfContacts) * 100).toFixed(1) : null;
  const accent   = accentColor || '#4d9fff';
  const campaignPeriodLeads = periodLeadsMap?.[campaignName] || 0;
  const leadsDead = hasMetrics && (numberOfLeads || 0) === 0 && (numberOfContacts || 0) > 0;
  const cat = CAT_META[categoryOf(campaign)];

  return (
    <div className={`campaign-row ${selected ? 'selected' : ''}`} style={{ '--row-accent': accent, animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <div className="campaign-header" onClick={() => onSelect(campaign)}>
        <div className="campaign-left">
          <div className="campaign-accent-bar" />
          <div>
            <div className="campaign-name">
              <span className="cat-badge" style={{ color: cat.color, borderColor: cat.color }}>{cat.label}</span>
              <SourceBadge source={source} />
              {campaignName}
              {campaign.status && (
                <span className={`status-badge status-${campaign.status}`}>
                  {campaign.status === 'live' ? '● Live' : campaign.status === 'paused' ? '⏸ Paused' : '○ Draft'}
                </span>
              )}
            </div>
            <div className="campaign-date">{fmtDate(dateCreated)} · {variants.length} variant{variants.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="campaign-stats">
          {sparkValues.length >= 2 && (
            <div className="cstat cstat-spark">
              <Sparkline values={sparkValues} color={accent === '#5b6b7d' ? 'var(--text-3)' : accent} />
              <span className="cstat-lbl">trend</span>
            </div>
          )}
          <div className="cstat"><span className="cstat-val">{fmt(numberOfContacts)}</span><span className="cstat-lbl">contacts</span></div>
          <div className="cstat"><span className="cstat-val" style={{ color: hasMetrics ? '#00d4aa' : 'var(--text-3)' }}>{dash(openRate, '%')}</span><span className="cstat-lbl">open rate</span></div>
          <div className="cstat"><span className="cstat-val" style={{ color: hasMetrics ? '#f5a623' : 'var(--text-3)' }}>{fmt(clicksByUser)}</span><span className="cstat-lbl">clicks</span></div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: campaignPeriodLeads ? '#a78bfa' : 'var(--text-3)' }}>{fmt(campaignPeriodLeads)}</span>
            <span className="cstat-lbl">period leads</span>
            <span className="cstat-sub">{hasMetrics ? fmt(numberOfLeads) + ' all-time' : '\u00A0'}</span>
          </div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: (leadsDead || convRate == null) ? 'var(--text-3)' : '#ff9d4d' }} title={leadsDead ? 'No leads recorded — check attribution' : undefined}>
              {leadsDead ? '—' : (convRate == null ? '—' : convRate + '%')}
            </span>
            <span className="cstat-lbl">conv.</span>
          </div>
          <div className="chevron open">›</div>
        </div>
      </div>
    </div>
  );
}

// ─── Attention strip ────────────────────────────────────────────────────────────
function AttentionStrip({ campaigns, periodLeads, periodLeadsMap }) {
  const cards = useMemo(() => {
    const out = [];
    const top = Object.entries(periodLeadsMap).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) out.push({ icon: '🚀', tone: 'good', label: 'Top performer', value: top[0], sub: `${fmt(top[1])} leads this period` });

    const series = {};
    periodLeads.forEach(l => { if (!l.campaign) return; (series[l.campaign] ||= {}); series[l.campaign][l.day] = (series[l.campaign][l.day] || 0) + Number(l.lead_count); });
    let rising = null;
    Object.entries(series).forEach(([name, days]) => {
      const ks = Object.keys(days).sort();
      if (ks.length < 4) return;
      const mid = Math.floor(ks.length / 2);
      const first = ks.slice(0, mid).reduce((s, k) => s + days[k], 0);
      const second = ks.slice(mid).reduce((s, k) => s + days[k], 0);
      const change = second - first;
      if (change > 0 && (!rising || change > rising.change)) rising = { name, change };
    });
    if (rising) out.push({ icon: '📈', tone: 'good', label: 'Trending up', value: rising.name, sub: `+${fmt(rising.change)} leads vs earlier` });

    const stalled = campaigns
      .filter(c => (periodLeadsMap[c.campaignName] || 0) === 0 && (c.numberOfContacts || 0) > 1000)
      .sort((a, b) => b.numberOfContacts - a.numberOfContacts)[0];
    if (stalled) out.push({ icon: '⚠️', tone: 'warn', label: 'Needs attention', value: stalled.campaignName, sub: `${fmt(stalled.numberOfContacts)} reached · 0 leads` });

    return out.slice(0, 3);
  }, [campaigns, periodLeads, periodLeadsMap]);

  if (!cards.length) return null;
  return (
    <div className="attention-strip">
      {cards.map((c, i) => (
        <div key={i} className={`attention-card tone-${c.tone}`}>
          <span className="attention-icon">{c.icon}</span>
          <div className="attention-text">
            <span className="attention-label">{c.label}</span>
            <span className="attention-value" title={c.value}>{c.value}</span>
            <span className="attention-sub">{c.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Custom tooltip for the leads-over-time chart ───────────────────────────────
function LeadsBreakdownTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const breakdown = Object.entries(data.byCampaign || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div
      style={{
        background: 'var(--navy-3)',
        border: '1px solid var(--border-2)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--text-1)',
        maxWidth: 260,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--accent)', marginBottom: breakdown.length ? 6 : 0 }}>
        {data.count.toLocaleString()} leads
      </div>
      {breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
          {breakdown.map(([name, count]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span
                style={{
                  color: 'var(--text-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
              <span style={{ flexShrink: 0 }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leads over time chart ────────────────────────────────────────────────────
function LeadsChart({ leads, days }) {
  const chartData = useMemo(() => {
    if (!leads.length) return [];
    const map = {};
    leads.forEach(l => {
      const d = new Date(l.day);
      let key;
      if (days > 30) {
        const dow = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dow + 6) % 7));
        key = monday.toISOString().slice(0, 10);
      } else { key = d.toISOString().slice(0, 10); }

      if (!map[key]) map[key] = { total: 0, byCampaign: {} };
      const count = Number(l.lead_count);
      map[key].total += count;
      if (l.campaign) {
        map[key].byCampaign[l.campaign] = (map[key].byCampaign[l.campaign] || 0) + count;
      }
    });

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: fmtShort(date), count: v.total, byCampaign: v.byCampaign }));
  }, [leads, days]);

  if (!chartData.length) return null;
  return (
    <div className="chart-panel" style={{ marginBottom: 16 }}>
      <div className="chart-panel-title">
        Leads over time — {PERIODS.find(p => p.days === days)?.label || 'Custom range'}
        <span style={{ marginLeft: 10, fontWeight: 400, color: 'var(--accent)', fontSize: 13 }}>
          {leads.reduce((s, l) => s + Number(l.lead_count), 0).toLocaleString()} total
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,.04)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<LeadsBreakdownTooltip />} cursor={{ fill: 'rgba(255,255,255,.06)' }} />
          <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} name="Leads" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Top-level charts ─────────────────────────────────────────────────────────
function Charts({ campaigns }) {
  const topByLeads = useMemo(() =>
    [...campaigns].filter(c => c.numberOfLeads > 0).sort((a, b) => b.numberOfLeads - a.numberOfLeads).slice(0, 8)
      .map(c => ({ name: c.campaignName.length > 22 ? c.campaignName.slice(0, 22) + '…' : c.campaignName, leads: c.numberOfLeads, clicks: c.clicksByUser }))
  , [campaigns]);

  const topByOpenRate = useMemo(() =>
    [...campaigns].filter(c => c.numberOfContacts > 10 && c.openRate > 0).sort((a, b) => b.openRate - a.openRate).slice(0, 6)
      .map(c => ({ name: c.campaignName.length > 18 ? c.campaignName.slice(0, 18) + '…' : c.campaignName, openRate: round(c.openRate) }))
  , [campaigns]);

  const tooltipStyle = {
    contentStyle: { background: 'var(--navy-3)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' },
    cursor: { fill: 'rgba(255,255,255,.04)' },
  };

  return (
    <div className="charts-grid">
      <div className="chart-panel">
        <div className="chart-panel-title">Top campaigns — leads</div>
        <ResponsiveContainer width="100%" height={Math.max(200, topByLeads.length * 40 + 40)}>
          <BarChart data={topByLeads} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,.04)" />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="leads"  fill="#a78bfa" radius={[0, 4, 4, 0]} name="Leads" />
            <Bar dataKey="clicks" fill="#4d9fff" radius={[0, 4, 4, 0]} name="Clicks" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-panel">
        <div className="chart-panel-title">Top campaigns — open rate %</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={topByOpenRate} margin={{ top: 0, right: 16, left: -16, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,.04)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-2)', angle: -30, textAnchor: 'end' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip {...tooltipStyle} formatter={v => [v + '%', 'Open rate']} />
            <Bar dataKey="openRate" radius={[4, 4, 0, 0]} name="Open rate">
              {topByOpenRate.map((_, i) => <Cell key={i} fill={`hsl(${160 + i * 12}, 70%, ${55 - i * 3}%)`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [campaigns,    setCampaigns]    = useState([]);
  const [syncedAt,     setSyncedAt]     = useState(null);
  const [status,       setStatus]       = useState('loading');
  const [acCampaigns,  setAcCampaigns]  = useState([]);
  const [acStatus,     setAcStatus]     = useState('loading');
  const [search,       setSearch]       = useState('');
  const [sortBy,       setSortBy]       = useState('date');
  const [filterStatus, setFilterStatus] = useState('live');
  const [category,     setCategory]     = useState('all');
  const [source,       setSource]       = useState('all');
  const [tier,         setTier]         = useState('all');
  const [onlyLeads,    setOnlyLeads]    = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [periodDays,   setPeriodDays]   = useState(30);
  const [periodLeads,  setPeriodLeads]  = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [showCustom,   setShowCustom]   = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [displayCampaign, setDisplayCampaign] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { campaigns: data, syncedAt: ts } = await fetchLatestSnapshot();
      setCampaigns(data); setSyncedAt(ts); setStatus('success');
    } catch (e) { console.error(e); setStatus('error'); }
  }, []);

  const loadActiveCampaigns = useCallback(async () => {
    setAcStatus('loading');
    try {
      const [rows, templates] = await Promise.all([
        fetchActiveCampaigns(),
        fetchActiveCampaignTemplates(),
      ]);
      const templateMap = Object.fromEntries(templates.map(t => [t.template_name, t]));
      setAcCampaigns(normalizeActiveCampaigns(rows, templateMap));
      setAcStatus('success');
    } catch (e) { console.error(e); setAcStatus('error'); }
  }, []);

  const loadLeads = useCallback(async (days, from, to) => {
    setLeadsLoading(true);
    try { setPeriodLeads(await fetchLeadsByPeriod(days, from, to)); }
    catch (e) { console.error(e); }
    finally { setLeadsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadActiveCampaigns(); }, [loadActiveCampaigns]);
  useEffect(() => { loadLeads(periodDays, customFrom, customTo); }, [loadLeads, periodDays, customFrom, customTo]);

  // keep drawer content during slide-out, and wire Esc + scroll lock
  useEffect(() => { if (selected) setDisplayCampaign(selected); }, [selected]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected]);

  // Engage CMS campaigns carry their own status (live/paused/draft); AC
  // campaigns have none, so tag them 'live' here purely so the default
  // status filter doesn't hide them. This is a display convenience only —
  // it isn't written back anywhere.
  const allCampaigns = useMemo(() => {
    const acWithStatus = acCampaigns.map(c => ({ ...c, status: c.status ?? 'live' }));
    return [...campaigns, ...acWithStatus];
  }, [campaigns, acCampaigns]);

  const periodLeadsMap = useMemo(() => {
    const map = {};
    periodLeads.forEach(l => { if (l.campaign) map[l.campaign] = (map[l.campaign] || 0) + Number(l.lead_count); });
    return map;
  }, [periodLeads]);

  // relative performance colour (top / mid / low / no-signal) per campaign
  // AC campaigns have no clicks/openRate, so they're scored on period leads only.
  const colorByName = useMemo(() => {
    const scored = allCampaigns
      .map(c => ({ name: c.campaignName, score: (periodLeadsMap[c.campaignName] || 0) * 1e6 + (c.clicksByUser || 0) * 1e3 + (c.openRate || 0) }))
      .sort((a, b) => b.score - a.score);
    const withSignal = scored.filter(s => s.score > 0);
    const n = withSignal.length;
    const map = {};
    scored.forEach(s => { if (s.score === 0) map[s.name] = '#5b6b7d'; });
    withSignal.forEach((s, i) => {
      const p = n <= 1 ? 0 : i / (n - 1);
      map[s.name] = p < 0.3 ? '#00d4aa' : p < 0.7 ? '#f5a623' : '#ff6b6b';
    });
    return map;
  }, [allCampaigns, periodLeadsMap]);

  const catCounts = useMemo(() => {
    const m = { all: allCampaigns.length, reheat: 0, refer: 0, retain: 0, other: 0 };
    allCampaigns.forEach(c => { m[categoryOf(c)]++; });
    return m;
  }, [allCampaigns]);

  const sourceCounts = useMemo(() => ({
    all: allCampaigns.length,
    engage: campaigns.length,
    activecampaign: acCampaigns.length,
  }), [allCampaigns, campaigns, acCampaigns]);

  const filtered = useMemo(() => {
    let list = [...allCampaigns];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.campaignName?.toLowerCase().includes(q) || c.variants?.some(v => v.template?.toLowerCase().includes(q)));
    }
    if (source !== 'all')       list = list.filter(c => (c.source || 'engage') === source);
    if (category !== 'all')     list = list.filter(c => categoryOf(c) === category);
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    if (tier !== 'all')         list = list.filter(c => tierOf(colorByName[c.campaignName]) === tier);
    if (onlyLeads)              list = list.filter(c => (periodLeadsMap[c.campaignName] || 0) > 0);

    if (sortBy === 'leads')       list.sort((a, b) => (b.numberOfLeads || 0)    - (a.numberOfLeads || 0));
    if (sortBy === 'contacts')    list.sort((a, b) => (b.numberOfContacts || 0) - (a.numberOfContacts || 0));
    if (sortBy === 'openrate')    list.sort((a, b) => (b.openRate || 0)         - (a.openRate || 0));
    if (sortBy === 'date')        list.sort((a, b) => new Date(b.dateCreated)   - new Date(a.dateCreated));
    if (sortBy === 'periodleads') list.sort((a, b) => (periodLeadsMap[b.campaignName] || 0) - (periodLeadsMap[a.campaignName] || 0));
    return list;
  }, [allCampaigns, search, category, source, sortBy, filterStatus, tier, onlyLeads, periodLeadsMap, colorByName]);

  const totals = useMemo(() => ({
    campaigns: allCampaigns.length,
    contacts:  campaigns.reduce((s, c) => s + (c.numberOfContacts || 0), 0),
    leads:     campaigns.reduce((s, c) => s + (c.numberOfLeads    || 0), 0),
    clicks:    campaigns.reduce((s, c) => s + (c.clicksByUser     || 0), 0),
    avgOpen:   campaigns.length ? round(campaigns.reduce((s, c) => s + (c.openRate || 0), 0) / campaigns.length) : 0,
  }), [campaigns, allCampaigns]);

  const activeFilterCount = (filterStatus !== 'all' ? 1 : 0) + (tier !== 'all' ? 1 : 0) + (onlyLeads ? 1 : 0) + (source !== 'all' ? 1 : 0);
  const isLoading = status === 'loading' || acStatus === 'loading';
  const combinedStatus = (status === 'error' || acStatus === 'error') ? 'error' : isLoading ? 'loading' : 'success';
  const syncDotColor = { loading: '#378ADD', success: '#00d4aa', error: '#ff4d4d' }[combinedStatus] || '#888';
  const drawerCat = displayCampaign ? CAT_META[categoryOf(displayCampaign)] : null;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark" />
          <div>
            <h1 className="app-title">Campaign Intelligence</h1>
            <p className="app-sub">Engage CMS + ActiveCampaign · synced to Supabase · refreshes hourly</p>
          </div>
        </div>
        <div className="header-right">
          <div className={`sync-pill ${combinedStatus}`}>
            <span className="sync-dot" style={{ background: syncDotColor }} />
            {combinedStatus === 'loading' && 'Syncing…'}
            {combinedStatus === 'success' && `Synced · ${fmtDate(syncedAt)}`}
            {combinedStatus === 'error'   && 'Sync failed'}
          </div>
          <button className="refresh-btn" onClick={() => { load(); loadActiveCampaigns(); }} disabled={isLoading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      {/* ── KPI strip ── */}
      <div className="kpi-strip">
        {[
          { label: 'Campaigns',      value: totals.campaigns,             accent: 'var(--text-1)', sub: `${sourceCounts.engage} Engage · ${sourceCounts.activecampaign} AC` },
          { label: 'Total contacts', value: fmt(totals.contacts),         accent: '#4d9fff' },
          { label: 'Avg open rate',  value: totals.avgOpen + '%',         accent: '#00d4aa' },
          { label: 'Total clicks',   value: fmt(totals.clicks),           accent: '#f5a623' },
          { label: 'Leads', value: leadsLoading ? '…' : fmt(periodLeads.reduce((s, l) => s + Number(l.lead_count), 0)), accent: '#a78bfa', sub: fmt(totals.leads) + ' all-time (Engage)' },
          { label: 'Conv. rate',     value: totals.contacts ? ((totals.leads / totals.contacts) * 100).toFixed(2) + '%' : '—', accent: '#ff9d4d' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.accent }}>{k.value}</div>
            {k.sub && <div className="kpi-sub">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Attention strip ── */}
      {combinedStatus === 'success' && <AttentionStrip campaigns={allCampaigns} periodLeads={periodLeads} periodLeadsMap={periodLeadsMap} />}

      {/* ── Source segmentation (Engage CMS / ActiveCampaign) ── */}
      <div className="cat-bar">
        {SOURCES.map(s => (
          <button
            key={s.key}
            className={`cat-pill ${source === s.key ? 'active' : ''}`}
            style={source === s.key ? { '--cat-color': '#4d9fff' } : undefined}
            onClick={() => setSource(s.key)}
          >
            {s.label}
            <span className="cat-count">{sourceCounts[s.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* ── Category segmentation (Reheat / Refer / Retain) ── */}
      <div className="cat-bar">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`cat-pill ${category === c.key ? 'active' : ''}`}
            style={category === c.key ? { '--cat-color': c.color } : undefined}
            onClick={() => setCategory(c.key)}
          >
            {c.key !== 'all' && <span className="cat-dot" style={{ background: c.color }} />}
            {c.label}
            <span className="cat-count">{catCounts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* ── Period selector ── */}
      <div className="period-bar">
        <span className="sort-label">Period</span>
        {PERIODS.map(p => (
          <button key={p.days} className={`sort-btn ${!showCustom && periodDays === p.days ? 'active' : ''}`}
            onClick={() => { setPeriodDays(p.days); setShowCustom(false); setCustomFrom(''); setCustomTo(''); }}>{p.label}</button>
        ))}
        <button className={`sort-btn ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom(s => !s)}>Custom range</button>
        {leadsLoading && <span className="period-loading">loading…</span>}
      </div>
      {showCustom && (
        <div className="custom-range-bar">
          <span className="sort-label">From</span>
          <input type="date" className="date-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="sort-label">To</span>
          <input type="date" className="date-input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          <button className="sort-btn active" onClick={() => { if (customFrom && customTo) loadLeads(0, customFrom, customTo); }} disabled={!customFrom || !customTo}>Apply</button>
          <button className="sort-btn" onClick={() => { setCustomFrom(''); setCustomTo(''); setShowCustom(false); setPeriodDays(30); }}>Clear</button>
        </div>
      )}

      {/* ── Toolbar: search · filters · overview ── */}
      <div className="toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" type="text" placeholder="Search campaigns or templates…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className={`sort-btn ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(s => !s)}>
            ⚲ Filters{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
          </button>
          <button className={`sort-btn ${showOverview ? 'active' : ''}`} onClick={() => setShowOverview(s => !s)}>
            {showOverview ? '▾ Hide overview' : '▸ Show overview'}
          </button>
          <span className="results-count">{filtered.length} / {allCampaigns.length}</span>
        </div>
      </div>

      {/* ── Expandable filters ── */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <span className="sort-label">Sort</span>
            {[['date','Date'],['leads','All-time leads'],['periodleads','Period leads'],['contacts','Contacts'],['openrate','Open rate']].map(([v,l]) => (
              <button key={v} className={`sort-btn ${sortBy === v ? 'active' : ''}`} onClick={() => setSortBy(v)}>{l}</button>
            ))}
          </div>
          <div className="filter-group">
            <span className="sort-label">Status</span>
            {[['all','All'],['live','● Live'],['paused','⏸ Paused'],['draft','○ Draft']].map(([v,l]) => (
              <button key={v} className={`sort-btn status-btn-${v} ${filterStatus === v ? 'active' : ''}`} onClick={() => setFilterStatus(v)}>{l}</button>
            ))}
          </div>
          <div className="filter-group">
            <span className="sort-label">Performance</span>
            {TIERS.map(([v,l]) => (
              <button key={v} className={`sort-btn ${tier === v ? 'active' : ''}`} onClick={() => setTier(v)}>{l}</button>
            ))}
          </div>
          <div className="filter-group">
            <button className={`sort-btn ${onlyLeads ? 'active' : ''}`} onClick={() => setOnlyLeads(o => !o)}>
              {onlyLeads ? '☑' : '☐'} Has leads this period
            </button>
            {(activeFilterCount > 0 || category !== 'all') && (
              <button className="sort-btn" onClick={() => { setFilterStatus('all'); setTier('all'); setOnlyLeads(false); setCategory('all'); setSource('all'); }}>Reset all</button>
            )}
          </div>
        </div>
      )}

      {/* ── Collapsible overview (charts) ── */}
      {showOverview && campaigns.length > 0 && (
        <div className="overview-panel">
          {periodLeads.length > 0 && <LeadsChart leads={periodLeads} days={periodDays} />}
          <Charts campaigns={campaigns} />
        </div>
      )}

      {/* ── Campaign list ── */}
      <div className="campaign-list">
        {combinedStatus === 'loading' && allCampaigns.length === 0 && (
          <div className="state-screen"><div className="spinner" /><span>Loading campaigns from Supabase…</span></div>
        )}
        {combinedStatus === 'error' && allCampaigns.length === 0 && (
          <div className="state-screen error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>Could not load data from Supabase.</span>
            <button className="refresh-btn" onClick={() => { load(); loadActiveCampaigns(); }}>Try again</button>
          </div>
        )}
        {combinedStatus !== 'loading' && filtered.length === 0 && allCampaigns.length > 0 && (
          <div className="state-screen"><span>No campaigns match your filters.</span></div>
        )}
        {filtered.map((c, i) => (
          <CampaignRow
            key={c._id}
            campaign={c}
            index={i}
            periodLeadsMap={periodLeadsMap}
            periodLeadsRaw={periodLeads}
            accentColor={colorByName[c.campaignName]}
            selected={selected?._id === c._id}
            onSelect={setSelected}
          />
        ))}
      </div>

      {/* ── Detail drawer ── */}
      <div className={`drawer-backdrop ${selected ? 'show' : ''}`} onClick={() => setSelected(null)} />
      <aside className={`drawer ${selected ? 'open' : ''}`} aria-hidden={!selected}>
        {displayCampaign && (
          <>
            <div className="drawer-head">
              <div className="drawer-head-text">
                <div className="drawer-title">
                  {drawerCat && <span className="cat-badge" style={{ color: drawerCat.color, borderColor: drawerCat.color }}>{drawerCat.label}</span>}
                  <SourceBadge source={displayCampaign.source} />
                  {displayCampaign.campaignName}
                  {displayCampaign.status && (
                    <span className={`status-badge status-${displayCampaign.status}`}>
                      {displayCampaign.status === 'live' ? '● Live' : displayCampaign.status === 'paused' ? '⏸ Paused' : '○ Draft'}
                    </span>
                  )}
                </div>
                <div className="drawer-sub">{fmtDate(displayCampaign.dateCreated)} · {displayCampaign.variants?.length || 0} variant{(displayCampaign.variants?.length || 0) !== 1 ? 's' : ''}</div>
              </div>
              <button className="drawer-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="drawer-body">
              <CampaignDetail
                key={displayCampaign._id}
                campaign={displayCampaign}
                periodLeadsRaw={periodLeads}
                periodLeadsMap={periodLeadsMap}
                accent={colorByName[displayCampaign.campaignName]}
              />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
