import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const NAVY = "#2C537A";
const TAN_DARK = "#7a5a3a";
const STORAGE_KEY = "campaign_dashboard_data";
const LEADS_KEY = "campaign_dashboard_leads";
const TTL_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL = 60 * 60 * 1000;
const WEBHOOK = "https://engageteam.app.n8n.cloud/webhook/d339ba0a-4a9b-4913-ba33-0ce40d610629";

const STATUS_COLORS = {
  Running: { bg: "#e6f4ea", text: "#1e6b3c", dot: "#34a853" },
  Paused:  { bg: "#fff8e1", text: "#7a5800", dot: "#f9ab00" },
  Stopped: { bg: "#fce8e6", text: "#7a1d1d", dot: "#ea4335" },
  Draft:   { bg: "#f1f3f4", text: "#444",    dot: "#9aa0a6" },
};

const CHANNEL_COLORS = {
  WhatsApp: { bg: "#e6f4ea", text: "#1e6b3c" },
  Email:    { bg: "#e8f0fe", text: "#1a3d8f" },
  SMS:      { bg: "#fce8e6", text: "#7a1d1d" },
};

const PROJECT_COLORS = { Refer: NAVY, Reheat: TAN_DARK };
const PROJECT_ICONS  = { Refer: "", Reheat: "🔁" };

function groupCampaigns(campaigns) {
  const projects = {};
  campaigns.forEach((c) => {
    const proj = c.Project || "Unknown";
    if (!projects[proj]) projects[proj] = {};
    const name = c["Campaign Name"] || "";
const m = name.match(/^([^|–-]+?)[\s]*[|–-]/);
    const group = m ? m[1].trim() : proj;
    if (!projects[proj][group]) projects[proj][group] = [];
    projects[proj][group].push(c);
  });
  return projects;
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 12, fontWeight: 500, borderRadius: 20, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status || "Unknown"}
    </span>
  );
}

function ChannelBadge({ channel }) {
  const c = CHANNEL_COLORS[channel] || { bg: "#f1f3f4", text: "#444" };
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 12, fontWeight: 500, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>
      {channel}
    </span>
  );
}

function LeadsInput({ campaignKey, value, onSave }) {
  const [val, setVal] = useState(value ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setVal(value ?? ""); }, [value]);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="number" min={0} value={val}
        onChange={(e) => { setVal(e.target.value); setSaved(false); }}
        placeholder="Enter leads..."
        style={{ width: 120, padding: "6px 10px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
      />
      <button
        onClick={() => { onSave(campaignKey, val); setSaved(true); }}
        style={{ padding: "6px 14px", borderRadius: 8, background: NAVY, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}
      >
        {saved ? "✓ Saved" : "Save"}
      </button>
    </div>
  );
}

// ── Drop-in replacement for CampaignRow (and the helper) ──────────────────
// Everything else in your App.jsx stays the same.

// ── Drop-in replacements for CampaignCard + ProjectSection ────────────────
// Replace your existing CampaignRow and ProjectSection with these.
// getDriveEmbedUrl and all other helpers/constants stay the same.

// ── Drop-in replacements for CampaignCard + ProjectSection ────────────────
// Replace your existing CampaignRow and ProjectSection with these.
// getDriveEmbedUrl and all other helpers/constants stay the same.

// ── Drop-in replacements for CampaignCard + ProjectSection ────────────────
// Replace your existing CampaignRow and ProjectSection with these.
// All other constants/helpers in App.jsx stay the same.

function getDriveEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
}

function CampaignCard({ campaign, leads, onSaveLead, accentColor }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const key      = campaign["Campaign Name"];
  const embedUrl = getDriveEmbedUrl(campaign.Creative);

  return (
    <>
      {/* ── Lightbox modal ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.18s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(90vw, 960px)",
              height: "min(85vh, 700px)",
              borderRadius: 16,
              overflow: "hidden",
              background: "#000",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
            }}
          >
            <iframe
              src={embedUrl}
              title="Creative fullscreen"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              allow="autoplay"
            />
            {/* Close button */}
            <button
              onClick={() => setLightbox(false)}
              style={{
                position: "absolute", top: 14, right: 14,
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(0,0,0,0.6)", color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.3)",
                fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>
        </div>
      )}

      {/* ── Card ── */}
      <div
        style={{
          background: "#fff", borderRadius: 14,
          border: "1px solid #e8ecf0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          overflow: "hidden", display: "flex", flexDirection: "column",
          transition: "box-shadow 0.18s",
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.11)")}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)")}
      >
        {/* ── Creative thumbnail ── */}
        <div style={{
          position: "relative", aspectRatio: "16/9",
          background: "#f1f3f6", overflow: "hidden", flexShrink: 0,
        }}>
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title="Creative preview"
              style={{ width: "100%", height: "100%", border: "none", display: "block", pointerEvents: "none" }}
              allow="autoplay"
              loading="lazy"
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#ccc", fontSize: 13, flexDirection: "column", gap: 6,
            }}>
              <span style={{ fontSize: 28 }}>🖼️</span>
              No creative
            </div>
          )}

          {/* Status badge — top left */}
          <div style={{ position: "absolute", top: 10, left: 10 }}>
            <StatusBadge status={campaign.Status} />
          </div>

          {/* Channel badge — top right */}
          <div style={{ position: "absolute", top: 10, right: 10 }}>
            <ChannelBadge channel={campaign.Channel} />
          </div>

          {/* Expand button — bottom right, only when embed exists */}
          {embedUrl && (
            <button
              onClick={() => setLightbox(true)}
              title="Expand preview"
              style={{
                position: "absolute", bottom: 10, right: 10,
                width: 30, height: 30, borderRadius: 7,
                background: "rgba(0,0,0,0.55)", color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.35)",
                fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(4px)",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.85)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.55)")}
            >⛶</button>
          )}
        </div>

        {/* ── Card body ── */}
        <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Campaign name */}
          <div style={{
            fontSize: 13, fontWeight: 600, color: "#1a1a2e", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {key}
          </div>

          {/* Engagements stat */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f7f9fc", borderRadius: 8, padding: "8px 12px",
          }}>
            <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Engagements</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: accentColor }}>
              {leads[key] ? parseInt(leads[key]).toLocaleString() : "—"}
            </span>
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            {campaign.Creative && (
              <a
                href={campaign.Creative}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 5, padding: "7px 10px", borderRadius: 8,
                  border: `1.5px solid ${accentColor}`, color: accentColor,
                  fontSize: 12, fontWeight: 600, textDecoration: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#eef3f9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                🔗 View on Drive
              </a>
            )}
            <button
              onClick={() => setOpen(!open)}
              style={{
                flex: 1, padding: "7px 10px", borderRadius: 8,
                background: open ? accentColor : "transparent",
                color: open ? "#fff" : accentColor,
                border: `1.5px solid ${accentColor}`,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {open ? "▲ Close" : "✏️ Add engagements"}
            </button>
          </div>

          {/* Expandable engagement input */}
          {open && (
            <div style={{
              borderTop: "1px solid #f0f0f0", paddingTop: 12,
              animation: "fadeIn 0.18s ease",
            }}>
              <p style={{
                fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 8,
                textTransform: "uppercase", letterSpacing: 0.6,
              }}>Engagement count</p>
              <LeadsInput campaignKey={key} value={leads[key]} onSave={onSaveLead} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ProjectSection({ projectName, groups, leads, onSaveLead }) {
  const [expanded, setExpanded] = useState(true);
  const color = PROJECT_COLORS[projectName] || NAVY;
  const icon  = PROJECT_ICONS[projectName]  || "📋";
  const allCampaigns = Object.values(groups).flat();
  const totalEngagements = allCampaigns.reduce((s, c) => s + (parseInt(leads[c["Campaign Name"]]) || 0), 0);

  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      border: "1px solid #e8ecf0", marginBottom: 24,
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>

      {/* ── Project header ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: color, color: "#fff", padding: "20px 24px",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            background: "rgba(255,255,255,0.18)", borderRadius: 10,
            padding: "10px 12px", fontSize: 22, lineHeight: 1,
          }}>{icon}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{projectName}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
              {Object.keys(groups).length} groups · {allCampaigns.length} campaigns
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {totalEngagements > 0 ? totalEngagements.toLocaleString() : allCampaigns.length}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {totalEngagements > 0 ? "total engagements" : "total campaigns"}
            </div>
          </div>
          <span style={{
            fontSize: 18, opacity: 0.7,
            transform: expanded ? "rotate(90deg)" : "none",
            display: "inline-block", transition: "transform 0.2s",
          }}>▶</span>
        </div>
      </div>

      {/* ── Groups + campaign grid ── */}
      {expanded && Object.entries(groups).map(([groupName, campaigns]) => {
        const gEngagements = campaigns.reduce((s, c) => s + (parseInt(leads[c["Campaign Name"]]) || 0), 0);

        return (
          <div key={groupName} style={{ padding: "20px 24px", borderBottom: "1px solid #f0f0f0" }}>

            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{groupName}</span>
                <span style={{
                  fontSize: 11, color: "#fff", background: color,
                  borderRadius: 20, padding: "2px 8px", fontWeight: 600,
                }}>
                  {campaigns.length}
                </span>
              </div>
              {gEngagements > 0 && (
                <span style={{ fontSize: 13, color: color, fontWeight: 700 }}>
                  {gEngagements.toLocaleString()} engagements
                </span>
              )}
            </div>

            {/* Campaign grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}>
              {campaigns.map(c => (
                <CampaignCard
                  key={c["Campaign Name"]}
                  campaign={c}
                  leads={leads}
                  onSaveLead={onSaveLead}
                  accentColor={color}
                />
              ))}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
      {/* ── Project header ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: color, color: "#fff", padding: "20px 24px",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            background: "rgba(255,255,255,0.18)", borderRadius: 10,
            padding: "10px 12px", fontSize: 22, lineHeight: 1,
          }}>{icon}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{projectName}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
              {Object.keys(groups).length} groups · {allCampaigns.length} campaigns
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {totalLeads > 0 ? totalLeads.toLocaleString() : allCampaigns.length}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {totalLeads > 0 ? "total engagements" : "total campaigns"}
            </div>
          </div>
          <span style={{
            fontSize: 18, opacity: 0.7,
            transform: expanded ? "rotate(90deg)" : "none",
            display: "inline-block", transition: "transform 0.2s",
          }}>▶</span>
        </div>
      </div>

      {/* ── Groups + campaign grid ── */}
      {expanded && Object.entries(groups).map(([groupName, campaigns]) => {
        const gLeads = campaigns.reduce((s, c) => s + (parseInt(leads[c["Campaign Name"]]) || 0), 0);

        return (
          <div key={groupName} style={{ padding: "20px 24px", borderBottom: "1px solid #f0f0f0" }}>

            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{groupName}</span>
                <span style={{
                  fontSize: 11, color: "#fff", background: color,
                  borderRadius: 20, padding: "2px 8px", fontWeight: 600,
                }}>
                  {campaigns.length}
                </span>
              </div>
              {gLeads > 0 && (
                <span style={{ fontSize: 13, color: color, fontWeight: 700 }}>
                  {gLeads.toLocaleString()} leads
                </span>
              )}
            </div>

            {/* Campaign grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}>
              {campaigns.map(c => (
                <CampaignCard
                  key={c["Campaign Name"]}
                  campaign={c}
                  leads={leads}
                  onSaveLead={onSaveLead}
                  accentColor={color}
                />
              ))}
            </div>
          </div>
        );
      })}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}


function useCountdown(nextSyncTime) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!nextSyncTime) return;
    const tick = () => {
      const diff = nextSyncTime - Date.now();
      if (diff <= 0) { setLabel("now"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextSyncTime]);
  return label;
}

export default function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState({});
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [nextSyncTime, setNextSyncTime] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterProject, setFilterProject] = useState("All");
  const timerRef = useRef(null);
  const countdown = useCountdown(nextSyncTime);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEADS_KEY);
      if (raw) setLeads(JSON.parse(raw));
    } catch {}
  }, []);

  const fetchFromWebhook = useCallback(async () => {
    setSyncStatus("loading");
    setSyncError(null);
    try {
      const res = await fetch(WEBHOOK, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.campaigns || data.data || [data];
      setCampaigns(arr);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: arr, timestamp: Date.now() }));
      setSyncStatus("success");
      setLastSynced(new Date());
      setNextSyncTime(Date.now() + POLL_INTERVAL);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchFromWebhook, POLL_INTERVAL);
    } catch (err) {
      setSyncStatus("error");
      setSyncError(err.message);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchFromWebhook, 5 * 60 * 1000);
      setNextSyncTime(Date.now() + 5 * 60 * 1000);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < TTL_MS) {
          setCampaigns(data || []);
          setLastSynced(new Date(timestamp));
          setSyncStatus("success");
        }
      }
    } catch {}
    fetchFromWebhook();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchFromWebhook]);

  const handleSaveLead = (key, value) => {
    const updated = { ...leads, [key]: value };
    setLeads(updated);
    try { localStorage.setItem(LEADS_KEY, JSON.stringify(updated)); } catch {}
  };

  const filtered = useMemo(() => campaigns.filter((c) => {
    const name = (c["Campaign Name"] || "").toLowerCase();
    return (!search || name.includes(search.toLowerCase()))
      && (filterStatus === "All" || c.Status === filterStatus)
      && (filterProject === "All" || c.Project === filterProject);
  }), [campaigns, search, filterStatus, filterProject]);

  const grouped  = useMemo(() => groupCampaigns(filtered), [filtered]);
  const projects = useMemo(() => [...new Set(campaigns.map(c => c.Project).filter(Boolean))], [campaigns]);
  const totalLeads = Object.values(leads).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const running = campaigns.filter(c => c.Status === "Running").length;

  const syncColors = {
    idle:    { bg: "#f7f9fc", border: "#e0e7ef", dot: "#bbb",    text: "#888"    },
    loading: { bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6", text: "#1d4ed8" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e", text: "#15803d" },
    error:   { bg: "#fff1f2", border: "#fecdd3", dot: "#ef4444", text: "#b91c1c" },
  };
  const sc = syncColors[syncStatus] || syncColors.idle;
  const syncLabel = { idle: "Waiting…", loading: "Syncing with n8n…", success: "Synced", error: "Sync failed" }[syncStatus];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 900, margin: "0 auto", padding: "32px 24px", color: "#1a1a2e" }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: "#1a1a2e" }}>Campaign Dashboard</h1>
        <p style={{ fontSize: 13, color: "#aaa", margin: 0 }}>Live data from n8n · refreshes every hour</p>
      </div>

      {/* Sync status bar */}
      <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, flexShrink: 0, animation: syncStatus === "loading" ? "pulse 1s infinite" : "none" }} />
          <span style={{ fontSize: 13, color: sc.text, fontWeight: 500 }}>{syncLabel}</span>
          {lastSynced && syncStatus !== "loading" && (
            <span style={{ fontSize: 12, color: "#aaa" }}>· last at {lastSynced.toLocaleTimeString()}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {countdown && syncStatus !== "loading" && (
            <span style={{ fontSize: 12, color: "#bbb" }}>Next in {countdown}</span>
          )}
          <button
            onClick={fetchFromWebhook} disabled={syncStatus === "loading"}
            style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${NAVY}`, background: "transparent", color: NAVY, fontSize: 12, cursor: syncStatus === "loading" ? "not-allowed" : "pointer", fontWeight: 500, opacity: syncStatus === "loading" ? 0.5 : 1 }}
          >↻ Refresh now</button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

      {syncError && (
        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#b91c1c" }}>
          ⚠ Could not reach webhook: {syncError} — retrying in 5 minutes.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total campaigns", value: campaigns.length || "—" },
          { label: "Running",         value: running || "—" },
          { label: "Total leads",     value: totalLeads > 0 ? totalLeads.toLocaleString() : "—" },
        ].map(s => (
          <div key={s.label} style={{ background: "#f7f9fc", border: "1px solid #e8ecf0", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#1a1a2e" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <input type="text" placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd", fontSize: 14 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd", fontSize: 14, background: "#fff" }}>
          <option>All</option>
          {["Running","Paused","Stopped","Draft"].map(s => <option key={s}>{s}</option>)}
        </select>
        {projects.length > 1 && (
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd", fontSize: 14, background: "#fff" }}>
            <option>All</option>
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Campaign content */}
      {campaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#888" }}>{syncStatus === "loading" ? "Fetching campaigns…" : "No data yet"}</div>
          <div style={{ fontSize: 14, color: "#bbb", marginTop: 6 }}>Connecting to your n8n webhook</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#bbb", fontSize: 14 }}>No campaigns match your filters.</div>
      ) : (
        Object.entries(grouped).map(([projectName, groups]) => (
          <ProjectSection key={projectName} projectName={projectName} groups={groups} leads={leads} onSaveLead={handleSaveLead} />
        ))
      )}
    </div>
  );
}
