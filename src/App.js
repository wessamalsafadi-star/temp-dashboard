import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { fetchLatestSnapshot } from './supabase';
import './App.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n) => (n || 0).toLocaleString();
const pct   = (n, d) => d ? Math.round((n / d) * 100) + '%' : '—';
const round = (n) => Math.round((n || 0) * 10) / 10;

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function interpolate(text) {
  if (!text) return '';
  return text
    .replace(/\{\{customer_first_name\}\}/g, 'Sarah')
    .replace(/\{\{first_name\}\}/g, 'Sarah')
    .replace(/\{\{[^}]+\}\}/g, '…');
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

// ─── Variant analytics panel ──────────────────────────────────────────────────
function VariantDetail({ variant, accentColor, onClose }) {
  const [tab, setTab] = useState(variant.cms ? 'preview' : 'analytics');
  const { name, template, metrics = {}, cms } = variant;
  const { numberOfContacts: sent = 0, openRate = 0, clicksByUser: clicks = 0, numberOfLeads: leads = 0 } = metrics;

  const openCount    = Math.round((openRate / 100) * sent);
  const healthScore  = Math.round(openRate * 0.5 + (sent ? (clicks / sent) * 100 * 0.3 : 0) + (sent ? (leads / sent) * 100 * 0.2 : 0));
  const healthColor  = healthScore >= 60 ? '#00d4aa' : healthScore >= 30 ? '#f5a623' : '#ff4d4d';

  const funnelData = [
    { stage: 'Sent',    count: sent,      fill: '#4d9fff' },
    { stage: 'Opened',  count: openCount,  fill: '#00d4aa' },
    { stage: 'Clicked', count: clicks,     fill: '#f5a623' },
    { stage: 'Leads',   count: leads,      fill: '#a78bfa' },
  ];

  return (
    <div className="variant-detail" style={{ '--vd-accent': accentColor }}>
      <div className="vd-header">
        <div>
          <div className="vd-name">{name} — <span className="vd-template">{template}</span></div>
        </div>
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
                {[['Sent', fmt(sent), '#4d9fff'], ['Open rate', round(openRate) + '%', '#00d4aa'], ['Clicks', fmt(clicks), '#f5a623'], ['Leads', fmt(leads), '#a78bfa']].map(([l, v, c]) => (
                  <div key={l} className="vd-stat-row">
                    <span>{l}</span><span style={{ color: c, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <>
            <div className="vd-kpis">
              <Chip label="Sent"        value={fmt(sent)}            accent="#4d9fff" />
              <Chip label="Open rate"   value={round(openRate) + '%'} accent="#00d4aa" sub={fmt(openCount) + ' opened'} />
              <Chip label="Clicks"      value={fmt(clicks)}           accent="#f5a623" sub={pct(clicks, sent) + ' of sent'} />
              <Chip label="Leads"       value={fmt(leads)}            accent="#a78bfa" sub={pct(leads, sent) + ' conversion'} />
              <Chip label="Health"      value={healthScore}           accent={healthColor} sub="out of 100" />
            </div>

            <div className="vd-charts">
              <div className="chart-card">
                <div className="chart-title">Funnel</div>
                {funnelData.map((f, i) => (
                  <div key={f.stage} style={{ marginBottom: i < funnelData.length - 1 ? 12 : 0 }}>
                    <div className="funnel-row">
                      <span>{f.stage}</span>
                      <span style={{ color: f.fill }}>{fmt(f.count)} <span className="funnel-pct">({pct(f.count, sent)})</span></span>
                    </div>
                    <div className="funnel-track">
                      <div className="funnel-bar" style={{ width: pct(f.count, sent), background: f.fill }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="chart-card">
                <div className="chart-title">Breakdown</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={funnelData.filter(f => f.count > 0)} dataKey="count" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                      {funnelData.map(f => <Cell key={f.stage} fill={f.fill} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--navy-3)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 12 }}
                      formatter={v => fmt(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-legend">
                  {funnelData.map(f => (
                    <span key={f.stage} className="legend-item">
                      <span className="legend-dot" style={{ background: f.fill }} />
                      {f.stage}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Campaign row ─────────────────────────────────────────────────────────────
function CampaignRow({ campaign, index }) {
  const [open, setOpen]       = useState(false);
  const [active, setActive]   = useState(null);

  const {
    campaignName, dateCreated,
    numberOfContacts, openRate, clicksByUser, numberOfLeads,
    variants = [],
  } = campaign;

  const convRate = numberOfContacts ? ((numberOfLeads / numberOfContacts) * 100).toFixed(1) : 0;
  const accent   = ['#00d4aa', '#4d9fff', '#f5a623', '#a78bfa', '#ff6b6b', '#34d399'][index % 6];

  return (
    <div className={`campaign-row ${open ? 'open' : ''}`} style={{ '--row-accent': accent, animationDelay: `${index * 40}ms` }}>
      <div className="campaign-header" onClick={() => setOpen(o => !o)}>
        <div className="campaign-left">
          <div className="campaign-accent-bar" />
          <div>
            <div className="campaign-name">{campaignName}</div>
            <div className="campaign-date">{fmtDate(dateCreated)} · {variants.length} variant{variants.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="campaign-stats">
          <div className="cstat">
            <span className="cstat-val">{fmt(numberOfContacts)}</span>
            <span className="cstat-lbl">contacts</span>
          </div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: '#00d4aa' }}>{round(openRate)}%</span>
            <span className="cstat-lbl">open rate</span>
          </div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: '#f5a623' }}>{fmt(clicksByUser)}</span>
            <span className="cstat-lbl">clicks</span>
          </div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: '#a78bfa' }}>{fmt(numberOfLeads)}</span>
            <span className="cstat-lbl">leads</span>
          </div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: '#ff9d4d' }}>{convRate}%</span>
            <span className="cstat-lbl">conv.</span>
          </div>
          <div className={`chevron ${open ? 'open' : ''}`}>›</div>
        </div>
      </div>

      {open && (
        <div className="campaign-body">
          {variants.length === 0 ? (
            <div className="no-variants">No variants configured for this campaign.</div>
          ) : (
            <div className="variants-grid">
              {variants.map(v => {
                const vkey = v.id || v.name;
                const isActive = active === vkey;
                const hasCms   = !!v.cms;
                return (
                  <div key={vkey} className={`variant-card ${isActive ? 'active' : ''}`} style={{ '--vc-accent': accent }}>
                    <div className="vc-top">
                      <div className="vc-name">{v.name}</div>
                      <span className="tag tag-mono">{v.template}</span>
                    </div>
                    <div className="vc-pct-bar">
                      <div className="vc-pct-fill" style={{ width: `${v.percentage || 0}%` }} />
                    </div>
                    <div className="vc-pct-label">{v.percentage || 0}% of audience</div>
                    <div className="vc-metrics">
                      {[
                        ['Contacts', fmt(v.metrics?.numberOfContacts), '#4d9fff'],
                        ['Open',     round(v.metrics?.openRate) + '%',  '#00d4aa'],
                        ['Clicks',   fmt(v.metrics?.clicksByUser),      '#f5a623'],
                        ['Leads',    fmt(v.metrics?.numberOfLeads),     '#a78bfa'],
                      ].map(([l, val, c]) => (
                        <div key={l} className="vc-metric-row">
                          <span className="vc-metric-lbl">{l}</span>
                          <span className="vc-metric-val" style={{ color: c }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="vc-actions">
                      {hasCms && (
                        <button
                          className={`vc-btn ${isActive ? 'primary' : ''}`}
                          onClick={() => setActive(isActive ? null : vkey)}
                        >
                          {isActive ? '▲ Hide' : '📱 Preview'}
                        </button>
                      )}
                      <button
                        className={`vc-btn ${isActive && !hasCms ? 'primary' : ''}`}
                        onClick={() => setActive(isActive ? null : vkey)}
                      >
                        {isActive ? '▲ Hide' : '📊 Analytics'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {active && (() => {
            const v = variants.find(v => (v.id || v.name) === active);
            return v ? (
              <VariantDetail
                variant={v}
                accentColor={accent}
                onClose={() => setActive(null)}
              />
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Top-level charts ─────────────────────────────────────────────────────────
function Charts({ campaigns }) {
  const topByLeads = useMemo(() =>
    [...campaigns]
      .filter(c => c.numberOfLeads > 0)
      .sort((a, b) => b.numberOfLeads - a.numberOfLeads)
      .slice(0, 8)
      .map(c => ({
        name: c.campaignName.length > 22 ? c.campaignName.slice(0, 22) + '…' : c.campaignName,
        leads: c.numberOfLeads,
        clicks: c.clicksByUser,
      }))
  , [campaigns]);

  const topByOpenRate = useMemo(() =>
    [...campaigns]
      .filter(c => c.numberOfContacts > 10 && c.openRate > 0)
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 6)
      .map(c => ({
        name: c.campaignName.length > 18 ? c.campaignName.slice(0, 18) + '…' : c.campaignName,
        openRate: round(c.openRate),
      }))
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
              {topByOpenRate.map((_, i) => (
                <Cell key={i} fill={`hsl(${160 + i * 12}, 70%, ${55 - i * 3}%)`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [campaigns, setCampaigns]   = useState([]);
  const [syncedAt,  setSyncedAt]    = useState(null);
  const [status,    setStatus]      = useState('loading'); // loading | success | error
  const [search,    setSearch]      = useState('');
  const [sortBy,    setSortBy]      = useState('date');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { campaigns: data, syncedAt: ts } = await fetchLatestSnapshot();
      setCampaigns(data);
      setSyncedAt(ts);
      setStatus('success');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.campaignName?.toLowerCase().includes(q) ||
        c.variants?.some(v => v.template?.toLowerCase().includes(q))
      );
    }
    if (sortBy === 'leads')    list.sort((a, b) => (b.numberOfLeads || 0)    - (a.numberOfLeads || 0));
    if (sortBy === 'contacts') list.sort((a, b) => (b.numberOfContacts || 0) - (a.numberOfContacts || 0));
    if (sortBy === 'openrate') list.sort((a, b) => (b.openRate || 0)         - (a.openRate || 0));
    if (sortBy === 'date')     list.sort((a, b) => new Date(b.dateCreated)   - new Date(a.dateCreated));
    return list;
  }, [campaigns, search, sortBy]);

  const totals = useMemo(() => ({
    campaigns:  campaigns.length,
    contacts:   campaigns.reduce((s, c) => s + (c.numberOfContacts || 0), 0),
    leads:      campaigns.reduce((s, c) => s + (c.numberOfLeads    || 0), 0),
    clicks:     campaigns.reduce((s, c) => s + (c.clicksByUser     || 0), 0),
    avgOpen:    campaigns.length
      ? round(campaigns.reduce((s, c) => s + (c.openRate || 0), 0) / campaigns.length)
      : 0,
  }), [campaigns]);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark" />
          <div>
            <h1 className="app-title">Campaign Intelligence</h1>
            <p className="app-sub">Engage CMS · synced to Supabase · refreshes hourly</p>
          </div>
        </div>
        <div className="header-right">
          <div className={`sync-pill ${status}`}>
            <span className="sync-dot" />
            {status === 'loading' && 'Syncing…'}
            {status === 'success' && `Synced · ${fmtDate(syncedAt)}`}
            {status === 'error'   && 'Sync failed'}
          </div>
          <button className="refresh-btn" onClick={load} disabled={status === 'loading'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      {/* ── KPI strip ── */}
      <div className="kpi-strip">
        {[
          { label: 'Campaigns',    value: totals.campaigns,             accent: 'var(--text-1)' },
          { label: 'Total contacts', value: fmt(totals.contacts),       accent: '#4d9fff' },
          { label: 'Avg open rate',  value: totals.avgOpen + '%',       accent: '#00d4aa' },
          { label: 'Total clicks',   value: fmt(totals.clicks),         accent: '#f5a623' },
          { label: 'Total leads',    value: fmt(totals.leads),          accent: '#a78bfa' },
          { label: 'Conv. rate',     value: totals.contacts ? ((totals.leads / totals.contacts) * 100).toFixed(2) + '%' : '—', accent: '#ff9d4d' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {campaigns.length > 0 && <Charts campaigns={campaigns} />}

      {/* ── Controls ── */}
      <div className="controls">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="search-input"
            type="text"
            placeholder="Search campaigns or templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="sort-wrap">
          <span className="sort-label">Sort</span>
          {[['date', 'Date'], ['leads', 'Leads'], ['contacts', 'Contacts'], ['openrate', 'Open rate']].map(([v, l]) => (
            <button key={v} className={`sort-btn ${sortBy === v ? 'active' : ''}`} onClick={() => setSortBy(v)}>{l}</button>
          ))}
        </div>
        <span className="results-count">{filtered.length} / {campaigns.length} campaigns</span>
      </div>

      {/* ── Campaign list ── */}
      <div className="campaign-list">
        {status === 'loading' && campaigns.length === 0 && (
          <div className="state-screen">
            <div className="spinner" />
            <span>Loading campaigns from Supabase…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="state-screen error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            <span>Could not load data from Supabase.</span>
            <button className="refresh-btn" onClick={load}>Try again</button>
          </div>
        )}
        {status === 'success' && filtered.length === 0 && (
          <div className="state-screen">
            <span>No campaigns match your search.</span>
          </div>
        )}
        {filtered.map((c, i) => <CampaignRow key={c._id} campaign={c} index={i} />)}
      </div>
    </div>
  );
}
