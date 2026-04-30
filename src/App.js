import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────
const NAVY = "#2C537A";
const WEBHOOK = "https://engageteam.app.n8n.cloud/webhook/d339ba0a-4a9b-4913-ba33-0ce40d610629";
const STORAGE_KEY = "campaign_dashboard_v3";
const LEADS_KEY   = "campaign_dashboard_leads_v3";
const POLL_MS     = 60 * 60 * 1000;
const TTL_MS      = 24 * 60 * 60 * 1000;

const STATUS_COLORS  = { Running:"#22c55e", Paused:"#f9ab00", Stopped:"#ea4335", Draft:"#9aa0a6" };
const CHANNEL_COLORS = { WhatsApp:"#22c55e", Email:"#378ADD", SMS:"#ea4335" };
const STATUS_BADGE   = {
  Running:{ bg:"#e6f4ea", color:"#1e6b3c", dot:"#22c55e" },
  Paused: { bg:"#fff8e1", color:"#7a5800", dot:"#f9ab00" },
  Stopped:{ bg:"#fce8e6", color:"#7a1d1d", dot:"#ea4335" },
  Draft:  { bg:"#f1f3f4", color:"#444",    dot:"#9aa0a6" },
};
const CHANNEL_BADGE = {
  WhatsApp:{ bg:"#e6f4ea", color:"#1e6b3c" },
  Email:   { bg:"#e8f0fe", color:"#1a3d8f" },
  SMS:     { bg:"#fce8e6", color:"#7a1d1d" },
};

// ─── Mock data (used when webhook fails) ─────────────────────────────────────
function getMockData() {
  const d = (h) => new Date(Date.now() - h * 3600000).toISOString();
  return [
    {
      "Campaign Name": "Refer | WhatsApp Blast — July", Project: "Refer",
      Status: "Running", Channel: "WhatsApp", Engagement: 1247,
      Templates: [
        { name:"refer_welcome_v2",   sent:980, delivered:954, read:701, timestamp:d(2),
          daily:[{day:"Mon",sent:140,delivered:136,read:98},{day:"Tue",sent:210,delivered:205,read:155},{day:"Wed",sent:180,delivered:175,read:130},{day:"Thu",sent:190,delivered:185,read:142},{day:"Fri",sent:160,delivered:155,read:112},{day:"Sat",sent:100,delivered:98,read:64}] },
        { name:"refer_followup_48h", sent:445, delivered:430, read:289, timestamp:d(26),
          daily:[{day:"Mon",sent:80,delivered:78,read:50},{day:"Tue",sent:90,delivered:87,read:60},{day:"Wed",sent:75,delivered:72,read:48},{day:"Thu",sent:85,delivered:82,read:56},{day:"Fri",sent:65,delivered:62,read:40},{day:"Sat",sent:50,delivered:49,read:35}] },
      ],
    },
    {
      "Campaign Name": "Refer | Email Nurture — Q3", Project: "Refer",
      Status: "Paused", Channel: "Email", Engagement: 582,
      Templates: [
        { name:"email_intro_refer", sent:600, delivered:571, read:198, timestamp:d(48),
          daily:[{day:"Mon",sent:100,delivered:95,read:32},{day:"Tue",sent:110,delivered:105,read:36},{day:"Wed",sent:90,delivered:86,read:30},{day:"Thu",sent:120,delivered:114,read:40},{day:"Fri",sent:100,delivered:95,read:33},{day:"Sat",sent:80,delivered:76,read:27}] },
      ],
    },
    {
      "Campaign Name": "Reheat | Re-engagement SMS", Project: "Reheat",
      Status: "Running", Channel: "SMS", Engagement: 334,
      Templates: [
        { name:"reheat_sms_promo",    sent:400, delivered:388, read:212, timestamp:d(6),
          daily:[{day:"Mon",sent:70,delivered:68,read:37},{day:"Tue",sent:80,delivered:77,read:43},{day:"Wed",sent:60,delivered:58,read:32},{day:"Thu",sent:75,delivered:73,read:40},{day:"Fri",sent:65,delivered:63,read:35},{day:"Sat",sent:50,delivered:49,read:25}] },
        { name:"reheat_sms_reminder", sent:310, delivered:298, read:145, timestamp:d(30),
          daily:[{day:"Mon",sent:55,delivered:53,read:26},{day:"Tue",sent:60,delivered:58,read:28},{day:"Wed",sent:50,delivered:48,read:24},{day:"Thu",sent:55,delivered:53,read:26},{day:"Fri",sent:45,delivered:43,read:21},{day:"Sat",sent:45,delivered:43,read:20}] },
      ],
    },
    {
      "Campaign Name": "Reheat | WhatsApp Win-Back", Project: "Reheat",
      Status: "Running", Channel: "WhatsApp", Engagement: 891,
      Templates: [
        { name:"winback_offer_v1", sent:760, delivered:740, read:520, timestamp:d(12),
          daily:[{day:"Mon",sent:130,delivered:127,read:89},{day:"Tue",sent:145,delivered:141,read:99},{day:"Wed",sent:120,delivered:117,read:82},{day:"Thu",sent:135,delivered:132,read:93},{day:"Fri",sent:110,delivered:107,read:75},{day:"Sat",sent:120,delivered:116,read:82}] },
      ],
    },
    {
      "Campaign Name": "Refer | Draft Campaign — Aug", Project: "Refer",
      Status: "Draft", Channel: "WhatsApp", Engagement: 0,
      Templates: [],
    },
    {
      "Campaign Name": "Reheat | Email Cold — Segment B", Project: "Reheat",
      Status: "Stopped", Channel: "Email", Engagement: 203,
      Templates: [
        { name:"cold_email_segB", sent:220, delivered:195, read:67, timestamp:d(120),
          daily:[{day:"Mon",sent:40,delivered:36,read:12},{day:"Tue",sent:45,delivered:40,read:14},{day:"Wed",sent:35,delivered:31,read:11},{day:"Thu",sent:40,delivered:35,read:12},{day:"Fri",sent:35,delivered:31,read:10},{day:"Sat",sent:25,delivered:22,read:8}] },
      ],
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(num, denom) {
  if (!denom) return "—";
  return Math.round((num / denom) * 100) + "%";
}
function getTemplates(c) {
  if (Array.isArray(c.Templates)) return c.Templates;
  if (c.Template) return [c.Template];
  if (c.template_name) return [{ name: c.template_name, sent: c.Sent, delivered: c.Delivered, read: c.Read, timestamp: c.Timestamp || c.created_at }];
  return [];
}
function getEng(c, leads) {
  const k = c["Campaign Name"];
  if (leads[k] !== undefined && leads[k] !== "") return parseInt(leads[k]) || 0;
  return c.Engagement || 0;
}
function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" }); } catch { return iso; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  return (
    <span style={{ background:s.bg, color:s.color, fontSize:11, fontWeight:500, borderRadius:999, padding:"3px 9px", display:"inline-flex", alignItems:"center", gap:4 }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:s.dot }} />
      {status || "Unknown"}
    </span>
  );
}

function ChannelBadge({ channel }) {
  const c = CHANNEL_BADGE[channel] || { bg:"#f1f3f4", color:"#555" };
  return channel ? (
    <span style={{ background:c.bg, color:c.color, fontSize:11, fontWeight:500, borderRadius:999, padding:"3px 9px" }}>
      {channel}
    </span>
  ) : null;
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background:"#f7f9fc", border:"1px solid #e8ecf0", borderRadius:10, padding:"14px 18px" }}>
      <div style={{ fontSize:11, color:"#aaa", fontWeight:600, textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: accent || "#1a1a2e" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

// ── Template Detail Drawer ────────────────────────────────────────────────────
function TemplateDetail({ template, accentColor, onClose }) {
  const { name, sent=0, delivered=0, read=0, timestamp, daily=[] } = template;
  const delivRate = sent ? Math.round((delivered/sent)*100) : 0;
  const readRate  = delivered ? Math.round((read/delivered)*100) : 0;
  const dropRate  = sent ? Math.round(((sent-delivered)/sent)*100) : 0;

  const funnelData = [
    { stage:"Sent",      count:sent,      fill:"#378ADD" },
    { stage:"Delivered", count:delivered, fill:"#22c55e" },
    { stage:"Read",      count:read,      fill:"#f9ab00" },
  ];

  const healthScore = Math.round((delivRate * 0.4) + (readRate * 0.6));
  const healthColor = healthScore >= 70 ? "#22c55e" : healthScore >= 40 ? "#f9ab00" : "#ea4335";

  return (
    <div style={{ border:"1px solid #e8ecf0", borderRadius:14, overflow:"hidden", marginTop:8, background:"#fff" }}>
      {/* Header */}
      <div style={{ background:accentColor, color:"#fff", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700 }}>{name}</div>
          <div style={{ fontSize:11, opacity:.75, marginTop:2 }}>Last synced: {fmtTime(timestamp)}</div>
        </div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,.2)", border:"none", color:"#fff", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:600 }}>
          ✕ Close
        </button>
      </div>

      <div style={{ padding:"20px" }}>

        {/* KPI row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:20 }}>
          <MetricCard label="Sent"          value={sent.toLocaleString()} />
          <MetricCard label="Delivered"     value={delivered.toLocaleString()} sub={`${delivRate}% rate`} accent="#378ADD" />
          <MetricCard label="Read"          value={read.toLocaleString()}      sub={`${readRate}% of delivered`} accent="#f9ab00" />
          <MetricCard label="Drop-off"      value={`${dropRate}%`}             sub="undelivered" accent="#ea4335" />
          <MetricCard label="Health score"  value={`${healthScore}`}           sub="out of 100"  accent={healthColor} />
        </div>

        {/* Funnel + daily line side by side */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>

          {/* Funnel bar */}
          <div style={{ border:"1px solid #e8ecf0", borderRadius:10, padding:"16px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:12 }}>Delivery funnel</div>
            {funnelData.map((f, i) => (
              <div key={f.stage} style={{ marginBottom: i < funnelData.length-1 ? 14 : 0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ color:"#666" }}>{f.stage}</span>
                  <span style={{ fontWeight:600, color:"#1a1a2e" }}>{f.count.toLocaleString()} <span style={{ fontSize:10, color:"#aaa", fontWeight:400 }}>({pct(f.count, sent)})</span></span>
                </div>
                <div style={{ background:"#f0f0f0", borderRadius:4, height:8, overflow:"hidden" }}>
                  <div style={{ width:`${pct(f.count, sent)}`, height:"100%", background:f.fill, borderRadius:4, transition:"width .6s ease" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Doughnut */}
          <div style={{ border:"1px solid #e8ecf0", borderRadius:10, padding:"16px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:8 }}>Engagement breakdown</div>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={funnelData} dataKey="count" cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3}>
                  {funnelData.map((f) => <Cell key={f.stage} fill={f.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              {funnelData.map(f => (
                <span key={f.stage} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666" }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:f.fill, flexShrink:0 }} />
                  {f.stage} {pct(f.count, sent)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Daily trend line */}
        {daily.length > 0 && (
          <div style={{ border:"1px solid #e8ecf0", borderRadius:10, padding:"16px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:14 }}>Daily performance</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={daily} margin={{ top:4, right:8, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize:11, fill:"#aaa" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:"#aaa" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => v.toLocaleString()} />
                <Line type="monotone" dataKey="sent"      stroke="#378ADD" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="read"      stroke="#f9ab00" strokeWidth={2} dot={false} strokeDasharray="2 3" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:8 }}>
              {[["Sent","#378ADD",""],["Delivered","#22c55e","4 2"],["Read","#f9ab00","2 3"]].map(([l,c,d]) => (
                <span key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#666" }}>
                  <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2" strokeDasharray={d||"none"} /></svg>
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────
function CampaignRow({ campaign, leads, onSaveLead, accentColor }) {
  const [open, setOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const templates = getTemplates(campaign);
  const eng = getEng(campaign, leads);
  const key = campaign["Campaign Name"];

  function toggleTemplate(tname) {
    setActiveTemplate(prev => prev === tname ? null : tname);
  }

  return (
    <div style={{ background:"#fff", border:"1px solid #e8ecf0", borderRadius:14, overflow:"hidden", marginBottom:12, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
      {/* Row header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", cursor:"pointer", transition:"background .15s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
        onMouseLeave={e => e.currentTarget.style.background = "#fff"}
      >
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, color:"#1a1a2e", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{key}</div>
          <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}>
            <StatusBadge status={campaign.Status} />
            <ChannelBadge channel={campaign.Channel} />
            {campaign.Project && <span style={{ fontSize:11, color:"#aaa" }}>{campaign.Project}</span>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0, marginLeft:12 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:20, fontWeight:700, color: accentColor }}>{eng > 0 ? eng.toLocaleString() : "—"}</div>
            <div style={{ fontSize:10, color:"#bbb" }}>engagements</div>
          </div>
          <div style={{ fontSize:12, color:"#aaa", whiteSpace:"nowrap" }}>{templates.length} template{templates.length !== 1 ? "s" : ""}</div>
          <span style={{ fontSize:12, color:"#bbb", transform: open ? "rotate(90deg)" : "none", display:"inline-block", transition:"transform .2s" }}>▶</span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ borderTop:"1px solid #f0f0f0", padding:"16px 18px" }}>
          <div style={{ fontSize:11, color:"#aaa", textTransform:"uppercase", letterSpacing:.5, fontWeight:600, marginBottom:10 }}>
            Templates — cross-matched from scheduler
          </div>

          {templates.length === 0 ? (
            <div style={{ fontSize:12, color:"#bbb", padding:"10px 0" }}>No templates linked yet.</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
              {templates.map(t => {
                const tname = t.name || "Unnamed";
                const isActive = activeTemplate === tname;
                return (
                  <div key={tname} style={{ border:`1.5px solid ${isActive ? accentColor : "#e8ecf0"}`, borderRadius:10, padding:"12px", background: isActive ? "#f7f9fc" : "#fff", transition:"border .15s" }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#1a1a2e", marginBottom:6, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tname}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:8 }}>
                      {[["Sent", t.sent||0, "#378ADD"], ["Delivered", t.delivered||0, "#22c55e"], ["Read", t.read||0, "#f9ab00"]].map(([l, v, c]) => (
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                          <span style={{ color:"#aaa" }}>{l}</span>
                          <span style={{ fontWeight:600, color: c }}>{(v||0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {t.timestamp && (
                      <div style={{ fontSize:10, color:"#bbb", marginBottom:8, display:"flex", alignItems:"center", gap:3 }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#bbb" strokeWidth="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 2"/></svg>
                        {fmtTime(t.timestamp)}
                      </div>
                    )}
                    <button
                      onClick={() => toggleTemplate(tname)}
                      style={{ width:"100%", padding:"6px", borderRadius:8, border:`1.5px solid ${accentColor}`, background: isActive ? accentColor : "transparent", color: isActive ? "#fff" : accentColor, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all .15s" }}
                    >
                      {isActive ? "▲ Hide analytics" : "📊 View analytics"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active template detail */}
          {activeTemplate && (
            <TemplateDetail
              template={templates.find(t => t.name === activeTemplate)}
              accentColor={accentColor}
              onClose={() => setActiveTemplate(null)}
            />
          )}

          {/* Engagement input */}
          <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#aaa", fontWeight:600, textTransform:"uppercase", letterSpacing:.5 }}>Override engagements:</span>
            <input
              type="number" min={0}
              defaultValue={leads[key] !== undefined ? leads[key] : (campaign.Engagement ?? "")}
              onBlur={e => {
                const updated = { ...leads, [key]: e.target.value };
                try { localStorage.setItem(LEADS_KEY, JSON.stringify(updated)); } catch {}
              }}
              placeholder="Enter count..."
              style={{ width:110, padding:"5px 9px", borderRadius:8, border:"1px solid #d0d5dd", fontSize:13 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [campaigns, setCampaigns]   = useState([]);
  const [leads, setLeads]           = useState({});
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError]   = useState(null);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus]   = useState("All");
  const [filterChannel, setFilterChannel] = useState("All");
  const [filterProject, setFilterProject] = useState("All");
  const timerRef = useRef(null);

  useEffect(() => {
    try { const r = localStorage.getItem(LEADS_KEY); if (r) setLeads(JSON.parse(r)); } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setSyncStatus("loading");
    setSyncError(null);
    try {
      const res = await fetch(WEBHOOK, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.campaigns || data.data || [data];
      setCampaigns(arr);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: arr, ts: Date.now() }));
      setSyncStatus("success");
      setLastSynced(new Date());
    } catch (err) {
      setSyncError(err.message);
      setSyncStatus("error");
      // Fall back to mock data if nothing loaded yet
      setCampaigns(prev => prev.length ? prev : getMockData());
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchData, POLL_MS);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < TTL_MS && data?.length) {
          setCampaigns(data);
          setLastSynced(new Date(ts));
          setSyncStatus("success");
        }
      }
    } catch {}
    fetchData();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchData]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const projects = useMemo(() => [...new Set(campaigns.map(c => c.Project).filter(Boolean))], [campaigns]);

  const filtered = useMemo(() => campaigns.filter(c => {
    const name = (c["Campaign Name"] || "").toLowerCase();
    const tmatch = getTemplates(c).some(t => (t.name || "").toLowerCase().includes(search.toLowerCase()));
    if (search && !name.includes(search.toLowerCase()) && !tmatch) return false;
    if (filterStatus  !== "All" && c.Status  !== filterStatus)  return false;
    if (filterChannel !== "All" && c.Channel !== filterChannel) return false;
    if (filterProject !== "All" && c.Project !== filterProject) return false;
    return true;
  }), [campaigns, search, filterStatus, filterChannel, filterProject]);

  const totalEng = campaigns.reduce((s, c) => s + getEng(c, leads), 0);
  const running  = campaigns.filter(c => c.Status === "Running").length;
  const totalTpl = campaigns.reduce((s, c) => s + getTemplates(c).length, 0);

  const statusData = useMemo(() => {
    const m = {};
    campaigns.forEach(c => { const k = c.Status || "Draft"; m[k] = (m[k]||0)+1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [campaigns]);

  const channelData = useMemo(() => {
    const m = {};
    campaigns.forEach(c => { if (c.Channel) m[c.Channel] = (m[c.Channel]||0)+1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [campaigns]);

  const topEngData = useMemo(() =>
    [...campaigns]
      .sort((a, b) => getEng(b, leads) - getEng(a, leads))
      .slice(0, 6)
      .map(c => ({ name: (c["Campaign Name"]||"").split("|")[1]?.trim() || c["Campaign Name"] || "", value: getEng(c, leads) }))
  , [campaigns, leads]);

  // ── Project color helper ─────────────────────────────────────────────────
  const PROJECT_ACCENT = {};
  projects.forEach((p, i) => {
    const colors = [NAVY, "#7a5a3a", "#185FA5", "#0F6E56", "#993C1D"];
    PROJECT_ACCENT[p] = colors[i % colors.length];
  });
  function accentFor(c) { return PROJECT_ACCENT[c.Project] || NAVY; }

  // ── Sync UI helpers ──────────────────────────────────────────────────────
  const syncDotColor = { idle:"#bbb", loading:"#378ADD", success:"#22c55e", error:"#ea4335" }[syncStatus];
  const syncLabel    = { idle:"Waiting", loading:"Syncing…", success:"Synced", error:"Sync failed" }[syncStatus];

  return (
    <div style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", maxWidth:960, margin:"0 auto", padding:"32px 24px", color:"#1a1a2e" }}>

      {/* ── Title + sync bar ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:"0 0 3px" }}>Campaign Dashboard</h1>
          <p style={{ fontSize:13, color:"#aaa", margin:0 }}>Live webhook · templates cross-matched · refreshes hourly</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f7f9fc", border:"1px solid #e8ecf0", borderRadius:999, padding:"6px 14px", fontSize:12, color:"#666" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:syncDotColor, animation: syncStatus==="loading" ? "pulse 1s infinite" : "none" }} />
            {syncLabel}
            {lastSynced && syncStatus !== "loading" && (
              <span style={{ opacity:.6 }}>· {lastSynced.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</span>
            )}
          </div>
          <button
            onClick={fetchData}
            disabled={syncStatus === "loading"}
            style={{ padding:"6px 14px", borderRadius:999, border:`1px solid ${NAVY}`, background:"transparent", color:NAVY, fontSize:12, cursor:"pointer", fontWeight:600, opacity: syncStatus==="loading"?.5:1 }}
          >↻ Refresh</button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {syncError && (
        <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, padding:"10px 16px", marginBottom:18, fontSize:12, color:"#b91c1c" }}>
          ⚠ Webhook unreachable: {syncError} — showing cached / demo data.
        </div>
      )}

      {/* ── KPI metrics ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:28 }}>
        <MetricCard label="Total campaigns" value={campaigns.length || "—"} />
        <MetricCard label="Running"         value={running || "—"} accent="#22c55e" />
        <MetricCard label="Templates"       value={totalTpl || "—"} accent={NAVY} />
        <MetricCard label="Engagements"     value={totalEng > 0 ? totalEng.toLocaleString() : "—"} accent="#f9ab00" />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:28 }}>

        {/* Status pie */}
        <div style={{ background:"#fff", border:"1px solid #e8ecf0", borderRadius:14, padding:"18px 20px" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#555", marginBottom:14 }}>Status distribution</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3}>
                {statusData.map(d => <Cell key={d.name} fill={STATUS_COLORS[d.name] || "#9aa0a6"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} campaigns`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, justifyContent:"center", marginTop:6 }}>
            {statusData.map(d => (
              <span key={d.name} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666" }}>
                <span style={{ width:8, height:8, borderRadius:2, background:STATUS_COLORS[d.name]||"#9aa0a6" }} />
                {d.name} · {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* Channel pie */}
        <div style={{ background:"#fff", border:"1px solid #e8ecf0", borderRadius:14, padding:"18px 20px" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#555", marginBottom:14 }}>Channel breakdown</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={channelData} dataKey="value" cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3}>
                {channelData.map(d => <Cell key={d.name} fill={CHANNEL_COLORS[d.name] || "#9aa0a6"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} campaigns`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, justifyContent:"center", marginTop:6 }}>
            {channelData.map(d => (
              <span key={d.name} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666" }}>
                <span style={{ width:8, height:8, borderRadius:2, background:CHANNEL_COLORS[d.name]||"#9aa0a6" }} />
                {d.name} · {d.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top engagements bar ── */}
      {topEngData.some(d => d.value > 0) && (
        <div style={{ background:"#fff", border:"1px solid #e8ecf0", borderRadius:14, padding:"18px 20px", marginBottom:28 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#555", marginBottom:14 }}>Top campaigns by engagement</div>
          <ResponsiveContainer width="100%" height={Math.max(160, topEngData.length * 42 + 50)}>
            <BarChart data={topEngData} layout="vertical" margin={{ top:0, right:20, left:10, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize:11, fill:"#aaa" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize:11, fill:"#555" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [v.toLocaleString(), "Engagements"]} />
              <Bar dataKey="value" fill={NAVY} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <input
          type="text" placeholder="Search campaigns or templates…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:"1 1 200px", padding:"8px 13px", borderRadius:10, border:"1px solid #d0d5dd", fontSize:13 }}
        />
        {[
          { label:"Status", val:filterStatus, set:setFilterStatus, opts:["All","Running","Paused","Stopped","Draft"] },
          { label:"Channel", val:filterChannel, set:setFilterChannel, opts:["All","WhatsApp","Email","SMS"] },
          ...(projects.length > 1 ? [{ label:"Project", val:filterProject, set:setFilterProject, opts:["All",...projects] }] : []),
        ].map(f => (
          <select key={f.label} value={f.val} onChange={e => f.set(e.target.value)}
            style={{ padding:"8px 12px", borderRadius:10, border:"1px solid #d0d5dd", fontSize:13, background:"#fff" }}>
            {f.opts.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        <span style={{ fontSize:12, color:"#aaa", alignSelf:"center" }}>{filtered.length} / {campaigns.length}</span>
      </div>

      {/* ── Campaign list ── */}
      {campaigns.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#aaa" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📡</div>
          <div style={{ fontSize:15, fontWeight:600 }}>{syncStatus === "loading" ? "Fetching campaigns…" : "No data"}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#bbb", fontSize:13 }}>No campaigns match your filters.</div>
      ) : (
        filtered.map(c => (
          <CampaignRow
            key={c["Campaign Name"]}
            campaign={c}
            leads={leads}
            onSaveLead={(k, v) => {
              const u = { ...leads, [k]: v };
              setLeads(u);
              try { localStorage.setItem(LEADS_KEY, JSON.stringify(u)); } catch {}
            }}
            accentColor={accentFor(c)}
          />
        ))
      )}
    </div>
  );
}
