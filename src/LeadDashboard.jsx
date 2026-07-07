import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG — point this at your n8n webhook. The response is the payload you
   shared: [{ generatedAt, dateRange, count, leads: [...] }].
   The app calls it on mount and then every hour.
   ═══════════════════════════════════════════════════════════════════════════ */
const WEBHOOK_URL = "https://engageteam.app.n8n.cloud/webhook/Deal Dashboard";
const POLL_MS = 60 * 60 * 1000; // hourly

/* ── helpers ─────────────────────────────────────────────────────────────── */
const aed = (n) =>
  n == null ? "—"
  : new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
const fdate = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const ftime = (s) => (s ? new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const fdur = (ms) => {
  if (ms == null) return null;
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
};
const monthKey = (s) => { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (k) => { const [y, m] = k.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); };

const STATUS_COLOR = { Sold: "#00d4aa", Reserved: "#f5a623", Leased: "#4d9fff" };

/* Accepts the array wrapper, a payload object, or a bare leads array. */
function extractLeads(payload) {
  let p = payload;
  if (Array.isArray(p) && p[0]?.leads) p = p[0].leads;
  else if (p?.leads) p = p.leads;
  if (!Array.isArray(p)) throw new Error("Unexpected webhook response: no leads array found.");
  return p;
}

/* Normalize one lead:
   - keep only outreach sent BEFORE dealCreatedAt (pre-deal touches)
   - pair each touch with its Supabase engagement (campaigns[].created_at is
     really responded_at) matched by campaign name — earliest response on/after
     the send, consumed so repeat campaigns don't double-claim.
   Also tolerates the pre-processed shape where touches already have respondedAt. */
function normalizeLead(l) {
  const dealCreated = new Date(l.dealCreatedAt).getTime();

  const pools = {};
  (l.campaigns || []).forEach((c) => {
    const ts = c.created_at ?? c.respondedAt;
    if (!c.campaign || !ts) return;
    (pools[c.campaign] = pools[c.campaign] || []).push(new Date(ts).getTime());
  });
  Object.values(pools).forEach((a) => a.sort((x, y) => x - y));

  const touches = (l.outreachNotifications || [])
    .filter((o) => o.sentAt && new Date(o.sentAt).getTime() < dealCreated)
    .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    .map((o) => {
      const name = o.campaignName ?? o.campaign;
      const sent = new Date(o.sentAt).getTime();
      let respondedAt = o.respondedAt ?? null;
      if (!respondedAt && pools[name]?.length) {
        const idx = pools[name].findIndex((t) => t >= sent);
        if (idx !== -1) { respondedAt = new Date(pools[name][idx]).toISOString(); pools[name].splice(idx, 1); }
      }
      return {
        campaign: name, sentAt: o.sentAt, respondedAt,
        engaged: !!respondedAt,
        responseMs: respondedAt ? new Date(respondedAt).getTime() - sent : null,
      };
    });

  const d = l.deal || {};
  return {
    key: d._id || d.id || `${l.leadId}-${l.dealCreatedAt}`,
    leadId: l.leadId,
    leadID: l.leadID ?? null,
    name: l.customerDetails?.fullName || "Unknown contact",
    phone: l.customerDetails?.phoneNumber || null,
    enriched: !!l.customerDetails,
    listingType: d.listingType || "—",
    transactionType: d.transactionType || "—",
    status: d.status || "—",
    price: d.price ?? null,
    gci: d.totalCommission ?? null,
    commissions: (d.commissions || []).filter((c) => (c.gci || 0) !== 0),
    dealCreatedAt: l.dealCreatedAt,
    dealClosingDate: l.dealClosingDate ?? d.closingDate ?? null,
    touches,
    preCount: touches.length,
    engagedCount: touches.filter((t) => t.engaged).length,
  };
}

/* ── timeline ────────────────────────────────────────────────────────────── */
function Timeline({ lead }) {
  if (!lead.touches.length) return <p className="no-variants">No outreach was sent before this deal was created.</p>;
  const deal = new Date(lead.dealCreatedAt).getTime();
  const times = [deal];
  lead.touches.forEach((t) => {
    times.push(new Date(t.sentAt).getTime());
    if (t.respondedAt) times.push(new Date(t.respondedAt).getTime());
  });
  const min = Math.min(...times), max = Math.max(...times), span = max - min || 1;
  const pos = (t) => `${((t - min) / span) * 100}%`;

  return (
    <div>
      <div className="timeline">
        <div className="tl-deal" style={{ left: pos(deal) }}><span>Deal</span><i /></div>
        {lead.touches.map((t, i) => {
          const s = new Date(t.sentAt).getTime();
          const r = t.respondedAt ? new Date(t.respondedAt).getTime() : null;
          const l0 = ((s - min) / span) * 100;
          const l1 = r != null ? ((r - min) / span) * 100 : null;
          return (
            <React.Fragment key={i}>
              {r != null && <div className="tl-link" style={{ left: `${l0}%`, width: `${l1 - l0}%` }} />}
              <div className={"tl-dot " + (r != null ? "eng" : "sent")} style={{ left: pos(s) }}
                   title={`${t.campaign} · sent ${fdate(t.sentAt)} ${ftime(t.sentAt)}`} />
              {r != null && <div className="tl-resp" style={{ left: pos(r) }}
                   title={`${t.campaign} · responded ${fdate(t.respondedAt)} ${ftime(t.respondedAt)}`} />}
            </React.Fragment>
          );
        })}
      </div>
      <div className="tl-legend">
        <span><i className="d-sent" /> Sent, no response</span>
        <span><i className="d-eng" /> Sent &amp; responded</span>
        <span><i className="d-resp" /> Response</span>
        <span><i className="d-deal" /> Deal created</span>
      </div>
    </div>
  );
}

/* ── lead row ────────────────────────────────────────────────────────────── */
function LeadRow({ lead, open, onToggle }) {
  const color = STATUS_COLOR[lead.status] || "var(--text-3)";
  return (
    <div className={"campaign-row" + (open ? " open" : "")} style={{ "--row-accent": color }}>
      <div className="campaign-header" onClick={onToggle}>
        <div className="campaign-left">
          <div className="campaign-accent-bar" />
          <div style={{ minWidth: 0 }}>
            <div className="campaign-name" style={lead.enriched ? undefined : { color: "var(--text-3)", fontStyle: "italic" }}>
              {lead.name}<span className="type-pill">{lead.listingType}</span>
            </div>
            <div className="campaign-date">{lead.phone || lead.leadId.slice(0, 10) + "…"} · {fdate(lead.dealCreatedAt)}</div>
          </div>
        </div>
        <div className="campaign-stats">
          <div className="cstat"><span className="cstat-val">{aed(lead.gci)}</span><span className="cstat-lbl">GCI</span></div>
          <div className="cstat"><span className="cstat-val">{lead.preCount}</span><span className="cstat-lbl">Pre-deal</span></div>
          <div className="cstat">
            <span className="cstat-val" style={{ color: lead.engagedCount ? "var(--accent)" : "var(--text-3)" }}>{lead.engagedCount}</span>
            <span className="cstat-lbl">Engaged</span>
          </div>
          <span className="status-badge" style={{ background: color + "22", color }}>{lead.status}</span>
          <div className={"chevron" + (open ? " open" : "")}>›</div>
        </div>
      </div>

      {open && (
        <div className="campaign-body">
          <div className="lead-detail">
            <div className="detail-block">
              <h4>Deal</h4>
              <div className="dl-row"><span>Reference</span><span className="v">{lead.leadID || "—"}</span></div>
              <div className="dl-row"><span>Price</span><span className="v">{aed(lead.price)}</span></div>
              <div className="dl-row"><span>Total commission (GCI)</span><span className="v">{aed(lead.gci)}</span></div>
              <div className="dl-row"><span>Type</span><span className="v">{lead.listingType} · {lead.transactionType}</span></div>
              <div className="dl-row"><span>Deal created</span><span className="v">{fdate(lead.dealCreatedAt)}</span></div>
              <div className="dl-row"><span>Closing date</span><span className="v">{fdate(lead.dealClosingDate)}</span></div>
              <div className="dl-row"><span>Lead ID</span><span className="v" style={{ fontSize: 11 }}>{lead.leadId}</span></div>
              {lead.commissions.length > 0 && (
                <div className="detail-sub">
                  <h4>Commission split</h4>
                  {lead.commissions.map((c, i) => (
                    <div key={i} className="comm-row"><span className="k">{c.brokerType}</span><span className="v">{aed(c.gci)}</span></div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-block">
              <h4>Pre-deal outreach → response</h4>
              <Timeline lead={lead} />
              <div className="touch-list">
                {lead.touches.map((t, i) => (
                  <div key={i} className="touch-row">
                    <div className="touch-top">
                      <span className="touch-camp">{t.campaign}</span>
                      <span className="touch-sent">sent {fdate(t.sentAt)}</span>
                    </div>
                    {t.respondedAt
                      ? <div className="touch-resp">↳ responded {fdate(t.respondedAt)} · {fdur(t.responseMs)}</div>
                      : <div className="touch-none">↳ no response</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── app ─────────────────────────────────────────────────────────────────── */
export default function LeadDashboard() {
  const [rawLeads, setRawLeads] = useState(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [err, setErr] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const timerRef = useRef(null);

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("All");
  const [typeF, setTypeF] = useState("All");
  const [engagedOnly, setEngagedOnly] = useState(false);
  const [sort, setSort] = useState("created_desc");
  const [openKey, setOpenKey] = useState(null);

  async function fetchData() {
    setStatus((s) => (s === "success" ? "loading" : s === "error" ? "loading" : s));
    try {
      const res = await fetch(WEBHOOK_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
      const json = await res.json();
      setRawLeads(extractLeads(json));
      setMeta(Array.isArray(json) ? json[0] : json);
      setLastSync(new Date());
      setStatus("success");
      setErr("");
    } catch (e) {
      setErr(e.message);
      // keep showing previous data if we have any; only hard-fail on first load
      setStatus((prev) => (rawLeads ? "success" : "error"));
    }
  }

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS); // hourly
    return () => clearInterval(timerRef.current);
  }, []);

  const leads = useMemo(() => (rawLeads ? rawLeads.map(normalizeLead) : []), [rawLeads]);

  const stats = useMemo(() => {
    const gci = leads.reduce((s, l) => s + (l.gci || 0), 0);
    const touches = leads.reduce((s, l) => s + l.preCount, 0);
    const responses = leads.reduce((s, l) => s + l.engagedCount, 0);
    const durs = leads.flatMap((l) => l.touches.map((t) => t.responseMs).filter((x) => x != null));
    const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
    const withPre = leads.filter((l) => l.preCount > 0).length;
    return { gci, touches, responses, rate: touches ? Math.round((responses / touches) * 100) : 0, avg, withPre };
  }, [leads]);

  const byMonth = useMemo(() => {
    const m = {};
    leads.forEach((l) => {
      if (!l.dealCreatedAt) return;
      const k = monthKey(l.dealCreatedAt);
      (m[k] = m[k] || { count: 0, gci: 0 }).count++;
      m[k].gci += l.gci || 0;
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k, ...v }));
  }, [leads]);

  const dist = useMemo(() => {
    const d = {};
    leads.forEach((l) => (d[l.status] = (d[l.status] || 0) + 1));
    return d;
  }, [leads]);

  const filtered = useMemo(() => {
    const out = leads.filter((l) => {
      if (statusF !== "All" && l.status !== statusF) return false;
      if (typeF !== "All" && l.listingType !== typeF) return false;
      if (engagedOnly && l.engagedCount === 0) return false;
      if (q) {
        const hay = `${l.name} ${l.phone || ""} ${l.leadId} ${l.leadID || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    const by = {
      created_desc: (a, b) => new Date(b.dealCreatedAt) - new Date(a.dealCreatedAt),
      created_asc: (a, b) => new Date(a.dealCreatedAt) - new Date(b.dealCreatedAt),
      gci_desc: (a, b) => (b.gci || 0) - (a.gci || 0),
      touches_desc: (a, b) => b.preCount - a.preCount,
    };
    return [...out].sort(by[sort]);
  }, [leads, q, statusF, typeF, engagedOnly, sort]);

  const maxMonth = Math.max(1, ...byMonth.map((m) => m.count));
  const maxDist = Math.max(1, ...Object.values(dist));

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark" />
          <div>
            <div className="app-title">Lead &amp; Deal Dashboard</div>
            <div className="app-sub">
              retention pipeline{meta?.dateRange ? ` · ${fdate(meta.dateRange.from)} → ${fdate(meta.dateRange.to)}` : ""}
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className={"sync-pill " + status}>
            <span className="sync-dot" />
            {status === "loading" ? "Syncing…"
              : status === "error" ? "Webhook failed"
              : lastSync ? `Synced ${ftime(lastSync)} · hourly` : `${leads.length} leads`}
          </div>
          <button className="refresh-btn" onClick={fetchData} disabled={status === "loading"}>↻ Refresh now</button>
        </div>
      </header>

      {status === "loading" && !rawLeads && (
        <div className="state-screen"><div className="spinner" />Calling webhook…</div>
      )}
      {status === "error" && (
        <div className="state-screen error">
          Couldn&apos;t reach the webhook — {err}
          <button className="refresh-btn" onClick={fetchData}>Retry</button>
        </div>
      )}

      {leads.length > 0 && (
        <>
          <div className="kpi-strip">
            <div className="kpi-card">
              <div className="kpi-label">Leads</div>
              <div className="kpi-value">{leads.length}</div>
              <div className="kpi-sub">{stats.withPre} with pre-deal outreach</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total GCI</div>
              <div className="kpi-value pos">{aed(stats.gci)}</div>
              <div className="kpi-sub">commission booked</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Pre-deal touches</div>
              <div className="kpi-value">{stats.touches}</div>
              <div className="kpi-sub">sent before deal creation</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Engagement rate</div>
              <div className="kpi-value">{stats.rate}%</div>
              <div className="kpi-sub">{stats.responses} of {stats.touches} responded</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Avg response</div>
              <div className="kpi-value">{stats.avg != null ? fdur(stats.avg) : "—"}</div>
              <div className="kpi-sub">sent → responded</div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-panel">
              <div className="chart-panel-title">Deals by month (created)</div>
              <div className="mini-chart">
                {byMonth.map((m) => (
                  <div key={m.k} className="mini-col">
                    <span className="mini-v">{m.count}</span>
                    <div className="mini-bar" style={{ height: `${(m.count / maxMonth) * 100}%` }} title={`${m.count} deals · ${aed(m.gci)}`} />
                    <span className="mini-x">{monthLabel(m.k)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-panel">
              <div className="chart-panel-title">Status breakdown</div>
              {Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                <div key={s} className="dist-row">
                  <span className="dist-label">{s}</span>
                  <div className="dist-track">
                    <div className="dist-bar" style={{ width: `${(n / maxDist) * 100}%`, background: STATUS_COLOR[s] || "var(--text-3)" }} />
                  </div>
                  <span className="dist-val">{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="controls">
            <div className="search-wrap">
              <span>⌕</span>
              <input className="search-input" placeholder="Search name, phone, or lead ID"
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="status-filters">
              {["All", "Sold", "Reserved", "Leased"].map((s) => (
                <button key={s}
                  className={"sort-btn " +
                    (s === "All" ? "status-btn-all" : s === "Sold" ? "status-btn-live" : s === "Reserved" ? "status-btn-paused" : "status-btn-draft") +
                    (statusF === s ? " active" : "")}
                  onClick={() => setStatusF(s)}>{s}</button>
              ))}
            </div>
            <button className={"sort-btn" + (typeF !== "All" ? " active" : "")}
              onClick={() => setTypeF(typeF === "All" ? "Sale" : typeF === "Sale" ? "Rent" : "All")}>
              {typeF === "All" ? "Sale & Rent" : typeF}
            </button>
            <button className={"sort-btn" + (engagedOnly ? " active" : "")} onClick={() => setEngagedOnly((v) => !v)}>
              Engaged only
            </button>
          </div>

          <div className="controls">
            <div className="sort-wrap">
              <span className="sort-label">Sort</span>
              {[["created_desc","Newest"],["created_asc","Oldest"],["gci_desc","Highest GCI"],["touches_desc","Most touches"]].map(([v,lbl]) => (
                <button key={v} className={"sort-btn" + (sort === v ? " active" : "")} onClick={() => setSort(v)}>{lbl}</button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <span className="results-count">{filtered.length} of {leads.length}</span>
          </div>

          <div className="campaign-list">
            {filtered.map((l) => (
              <LeadRow key={l.key} lead={l} open={openKey === l.key} onToggle={() => setOpenKey(openKey === l.key ? null : l.key)} />
            ))}
            {filtered.length === 0 && <div className="state-screen">No leads match these filters.</div>}
          </div>

          <div className="footnote">
            Pre-deal = outreach sent before deal creation · engagement matched from Supabase (created_at = responded_at) by campaign name · auto-refreshes hourly.
          </div>
        </>
      )}
    </div>
  );
}
