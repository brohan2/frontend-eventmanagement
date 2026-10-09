import { useState, useEffect, useCallback, useRef } from "react";
import ThemeToggle from "./ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// Connection state of a linked WhatsApp account, as shown in dropdowns
const WA_STATE_LABEL = { ready: "connected", starting: "starting", qr: "scan QR", authenticated: "connecting", closing: "disconnecting", disconnected: "offline" };

const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
// For multipart uploads the browser must set Content-Type itself (it adds the boundary)
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Limits mirror the server (which enforces them): PDF/PNG/JPG, 5 MB each, 5 files and 10 MB per template
const ATT = { maxFile: 5 * 1048576, maxTotal: 10 * 1048576, maxFiles: 5, exts: ["pdf", "png", "jpg", "jpeg"] };

// Read-only list of the files a template sends with every email
function AttachmentsNote({ files }) {
  if (!files?.length) return null;
  return (
    <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl px-4 py-3 border border-slate-100 dark:border-zinc-700">
      <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">📎 Sent with every email ({files.length})</p>
      <ul className="space-y-0.5">
        {files.map((f) => (
          <li key={f._id} className="text-sm text-slate-700 dark:text-zinc-200 flex justify-between gap-3">
            <span className="truncate">{f.filename}</span><span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0">{fmtSize(f.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
    </svg>
  );
}

// ── Email Compose Modal ──────────────────────────────────────────────────────
function EmailModal({ token, event, ticketIds, onClose, onDone }) {
  const [templates, setTemplates]        = useState([]);
  const [selectedTemplate, setSelected] = useState("");
  const [phase, setPhase]               = useState("select"); // "select" | "sending" | "done"
  const [job, setJob]                   = useState(null);
  const [error, setError]               = useState("");
  const pollRef                         = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/mail/templates?eventId=${event.slug}`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => {
        const list = d.data || [];
        setTemplates(list);
        const def = list.find((t) => t.isDefault);
        if (def) setSelected(def._id);
      });
    return () => clearInterval(pollRef.current);
  }, [token, event.slug]);

  const chosen = templates.find((t) => t._id === selectedTemplate);

  const pollStatus = (templateId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_URL}/admin/mail/send-all/status?eventId=${event.slug}&templateId=${templateId}`, { headers: authHeaders(token) });
        const data = await res.json();
        if (data.job) {
          setJob(data.job);
          if (data.job.status === "completed") {
            clearInterval(pollRef.current);
            setPhase("done");
            onDone();
          }
        }
      } catch { /* ignore poll errors */ }
    }, 1500);
  };

  const handleSend = async (ids) => {
    if (!selectedTemplate) return;
    setError(""); setPhase("sending");
    try {
      const res  = await fetch(`${API_URL}/admin/mail/send`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ templateId: selectedTemplate, ticketIds: ids, eventId: event.slug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Send failed"); setPhase("select"); return; }
      setJob(data.job);
      pollStatus(selectedTemplate);
    } catch { setError("Unable to reach server"); setPhase("select"); }
  };

  const handleRetryFailed = () => {
    if (!job?.results?.length) return;
    const failedIds = job.results.filter((r) => r.status === "failed").map((r) => r.ticketId).filter(Boolean);
    if (!failedIds.length) return;
    setJob(null); setPhase("select");
    // small delay so state resets before re-sending
    setTimeout(() => handleSend(failedIds), 50);
  };

  const pct        = job && job.total > 0 ? Math.round(((job.sent + job.failed) / job.total) * 100) : 0;
  const failedList = (job?.results || []).filter((r) => r.status === "failed");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <h2 className="font-semibold text-slate-800 dark:text-zinc-100">Send Email</h2>
          </div>
          {phase !== "sending" && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── Phase: select template ── */}
          {phase === "select" && (
            <>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Sending to <strong>{ticketIds.length}</strong> user(s)</p>
              {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Email Template <span className="text-red-500">*</span></label>
                {templates.length === 0
                  ? <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-2">No email templates found. Create one in Email Templates tab.</p>
                  : <select value={selectedTemplate} onChange={(e) => setSelected(e.target.value)}
                      className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Select template —</option>
                      {templates.map((t) => <option key={t._id} value={t._id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
                    </select>}
              </div>
              {chosen && (
                <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl px-4 py-3 border border-slate-100 dark:border-zinc-700">
                  <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Subject preview</p>
                  <p className="text-sm text-slate-700 dark:text-zinc-200">{chosen.subject}</p>
                </div>
              )}
              <AttachmentsNote files={chosen?.attachments}/>
              <div className="flex gap-3 justify-end pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
                <button onClick={() => handleSend(ticketIds)} disabled={!selectedTemplate}
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl">
                  Send Email
                </button>
              </div>
            </>
          )}

          {/* ── Phase: sending — live progress ── */}
          {phase === "sending" && job && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Sending emails…</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Do not close this window</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1.5">
                  <span>✓ {job.sent} sent · ✗ {job.failed} failed</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{pct}% of {job.total}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
                </div>
              </div>

              {/* Per-user status as they come in */}
              {job.results?.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {[...(job.results || [])].reverse().slice(0, 10).map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${r.status === "sent" ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"}`}>
                      <span>{r.status === "sent" ? "✓" : "✗"}</span>
                      <span className="truncate">{r.email}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-400 dark:text-zinc-500 text-center">You can switch tabs — sending continues in background</p>
            </div>
          )}

          {/* ── Phase: sending but job not loaded yet ── */}
          {phase === "sending" && !job && (
            <div className="flex items-center gap-3 py-4">
              <Spinner/>
              <p className="text-sm text-slate-600 dark:text-zinc-300">Starting…</p>
            </div>
          )}

          {/* ── Phase: done ── */}
          {phase === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${job.failed > 0 ? "bg-amber-100 dark:bg-amber-950/40" : "bg-emerald-100 dark:bg-emerald-950/40"}`}>
                  {job.failed > 0
                    ? <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    : <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                    {job.failed > 0 ? "Done — with some failures" : "All emails sent!"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">✓ {job.sent} sent · ✗ {job.failed} failed / {job.total}</p>
                </div>
              </div>

              {failedList.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3 max-h-36 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-1.5">Failed addresses</p>
                  {failedList.map((r, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">{r.email}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Close</button>
                {failedList.length > 0 && (
                  <button onClick={handleRetryFailed}
                    className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center gap-2">
                    ↺ Retry failed ({failedList.length})
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── WhatsApp Compose Modal ───────────────────────────────────────────────────
function WhatsAppModal({ token, event, ticketIds, onClose, onDone }) {
  const [templates, setTemplates]        = useState([]);
  const [selectedTemplate, setSelected] = useState("");
  const [eventDate, setEventDate]        = useState("");
  const [sending, setSending]            = useState(false);
  const [result, setResult]              = useState(null);
  const [error, setError]                = useState("");

  useEffect(() => {
    fetch(`${API_URL}/admin/wa/templates?eventId=${event.slug}`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => {
        const list = (d.data || []).filter((t) => t.isActive);
        setTemplates(list);
        if (list.length > 0) setSelected(list[0]._id);
      });
  }, [token, event.slug]);

  const chosen = templates.find((t) => t._id === selectedTemplate);

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setSending(true); setError("");
    try {
      const res  = await fetch(`${API_URL}/admin/wa/send`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ waTemplateId: selectedTemplate, ticketIds, eventId: event.slug, eventDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Send failed"); setSending(false); return; }
      setResult(data.message || "Done"); onDone();
    } catch { setError("Unable to reach server"); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            <h2 className="font-semibold text-slate-800 dark:text-zinc-100">Send WhatsApp</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {result ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-slate-700 dark:text-zinc-200 font-medium">{result}</p>
              <button onClick={onClose} className="mt-4 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm">Close</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Sending to <strong>{ticketIds.length}</strong> user(s)</p>
              {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">WA Template <span className="text-red-500">*</span></label>
                {templates.length === 0
                  ? <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-2">No WA templates found. Create one in WA Templates tab.</p>
                  : <select value={selectedTemplate} onChange={(e) => setSelected(e.target.value)} className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">— Select template —</option>
                      {templates.map((t) => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                    </select>}
              </div>
              {chosen && (
                <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl px-4 py-3 border border-slate-100 dark:border-zinc-700 space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Message preview</p>
                  <p className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap line-clamp-4">{chosen.body || "No message body set — edit this template in WA Templates tab."}</p>
                </div>
              )}
              <div className="flex gap-3 justify-end pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
                <button onClick={handleSend} disabled={sending || !selectedTemplate} className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl flex items-center gap-2">
                  {sending && <Spinner/>}{sending ? "Sending…" : "Send WhatsApp"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WA Web Modal ─────────────────────────────────────────────────────────────
function WaWebModal({ token, event, ticketIds, onClose, onDone }) {
  const [templates, setTemplates]        = useState([]);
  const [selectedTemplate, setSelected] = useState("");
  const [eventDate, setEventDate]        = useState("");
  const [accounts, setAccounts]          = useState(null); // null while loading
  const [accountId, setAccountId]        = useState("");
  const [sending, setSending]            = useState(false); // start-request in flight
  const [error, setError]                = useState("");
  const LAST_KEY = `wa:lastAccount:${event.slug}`;

  const loadAccounts = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts`, { headers: authHeaders(token) });
      const data = await res.json();
      if (res.ok) { setAccounts(data.data || []); return data.data || []; }
    } catch { /* ignore */ }
    return null;
  }, [token, event._id]);

  useEffect(() => {
    fetch(`${API_URL}/admin/wa/templates?eventId=${event.slug}`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => {
        const list = (d.data || []).filter((t) => t.isActive);
        setTemplates(list);
        if (list.length > 0) setSelected(list[0]._id);
      });
    loadAccounts().then((list) => {
      if (!list || list.length === 0) return;
      let last = "";
      try { last = localStorage.getItem(LAST_KEY) || ""; } catch { /* ignore */ }
      // Reopening mid-send → show that account; otherwise the last one used, then any connected one
      const pick =
        list.find((a) => a.job?.status === "running") ||
        list.find((a) => a._id === last && a.state === "ready") ||
        list.find((a) => a.state === "ready") ||
        list[0];
      setAccountId(pick._id);
    });
  }, [token, event.slug, loadAccounts, LAST_KEY]);

  const sel        = accounts?.find((a) => a._id === accountId) || null;
  const job        = sel?.job;
  const isReady    = sel?.state === "ready";
  const jobRunning = job?.status === "running";
  const jobDone    = job?.status === "completed" || job?.status === "stopped";
  const progress   = jobRunning ? Math.round(((job.sent + job.failed) / job.total) * 100) : null;
  const anyReady   = !!accounts?.some((a) => a.state === "ready");
  const acctBase   = `${API_URL}/admin/events/${event._id}/wa-web/accounts/${accountId}`;

  // Poll while a send is running so progress (and completion) shows up live
  useEffect(() => {
    if (!jobRunning) return;
    const t = setInterval(loadAccounts, 3000);
    return () => clearInterval(t);
  }, [jobRunning, loadAccounts]);

  const handleSend = async () => {
    if (!selectedTemplate || !accountId) return;
    setSending(true); setError("");
    try {
      const res  = await fetch(`${acctBase}/send`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ ticketIds, waTemplateId: selectedTemplate, eventDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to start"); return; }
      if (!data.job) { setError(data.message || "Nothing to send"); return; }
      try { localStorage.setItem(LAST_KEY, accountId); } catch { /* ignore */ }
      await loadAccounts();
    } catch { setError("Unable to reach server"); }
    finally { setSending(false); }
  };

  const handleStop = async () => {
    await fetch(`${acctBase}/stop`, { method: "POST", headers: authHeaders(token) });
    loadAccounts();
  };

  const chosen = templates.find((t) => t._id === selectedTemplate);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </div>
            <h2 className="font-semibold text-slate-800 dark:text-zinc-100">WA Personal Send</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {accounts === null && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400 dark:text-zinc-500"><Spinner/> Loading accounts…</div>
          )}

          {accounts !== null && accounts.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <p className="text-sm text-slate-700 dark:text-zinc-200 font-medium">No WhatsApp account linked</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">Go to the Settings tab, add an account and scan its QR code.</p>
              <button onClick={onClose} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">Close</button>
            </div>
          )}

          {accounts !== null && accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Send from <span className="text-red-500">*</span></label>
              <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setError(""); }} disabled={sending || jobRunning}
                className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60">
                {accounts.map((a) => (
                  <option key={a._id} value={a._id} disabled={a.state !== "ready" && !a.job}>
                    {a.label}{a.phone ? ` · +${a.phone}` : ""}{a.state !== "ready" ? ` — ${WA_STATE_LABEL[a.state] || "offline"}` : ""}{a.job?.status === "running" ? " (sending)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sel && !isReady && !jobRunning && !jobDone && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-slate-700 dark:text-zinc-200 font-medium">&ldquo;{sel.label}&rdquo; is not connected</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                {anyReady ? "Pick a connected account above, or connect this one in the Settings tab." : "Go to the Settings tab to connect a WhatsApp account."}
              </p>
              <button onClick={onClose} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">Close</button>
            </div>
          )}
          {sel && isReady && !jobRunning && !jobDone && (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>Connected
              </div>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Sending to <strong>{ticketIds.length}</strong> user(s) from <strong>{sel.label}</strong></p>
              {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">WA Template <span className="text-red-500">*</span></label>
                <select value={selectedTemplate} onChange={(e) => setSelected(e.target.value)}
                  className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">— Select —</option>
                  {templates.map((t) => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                </select>
              </div>
              {chosen?.parameterKeys?.includes("eventDate") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Event Date</label>
                  <input type="text" value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="e.g. May 20, 2026"
                    className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-green-500"/>
                </div>
              )}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ Messages sent with 20-35s delays. {ticketIds.length} users ≈ {Math.round(ticketIds.length * 27 / 60)} min.
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
                <button onClick={handleSend} disabled={sending || !selectedTemplate} className="px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl flex items-center gap-2">
                  {sending && <Spinner/>}{sending ? "Starting…" : "Start Sending"}
                </button>
              </div>
            </>
          )}
          {jobRunning && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-zinc-200 font-medium">Sending from {sel.label}…</span>
                <span className="text-slate-500 dark:text-zinc-400">{job.sent + job.failed} / {job.total}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}/>
              </div>
              <div className="flex justify-between text-xs text-slate-400 dark:text-zinc-500">
                <span>✓ {job.sent} sent · ✗ {job.failed} failed</span>
                <span>~{Math.round((job.total - job.sent - job.failed) * 27 / 60)} min left</span>
              </div>
              <div className="flex justify-end">
                <button onClick={handleStop} className="px-4 py-2 text-sm border border-red-200 dark:border-red-900 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">Stop</button>
              </div>
            </div>
          )}
          {jobDone && (
            <div className="py-2 space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${job.failed > 0 ? "bg-amber-100 dark:bg-amber-950/40" : "bg-emerald-100 dark:bg-emerald-950/40"}`}>
                  {job.failed > 0
                    ? <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    : <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                    {job.status === "stopped" ? "Stopped" : job.failed > 0 ? "Done — with some failures" : "All sent!"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">✓ {job.sent} sent · ✗ {job.failed} failed / {job.total} · from {sel.label}</p>
                </div>
              </div>

              {/* Failed list */}
              {job.failed > 0 && job.errors?.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3 space-y-1.5 max-h-36 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Failed numbers</p>
                  {job.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      <span className="font-medium">{e.name}</span> · {e.phone}
                      {e.error && <span className="text-red-400 dark:text-red-500"> — {e.error}</span>}
                    </p>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}

              <div className="flex gap-2 justify-end flex-wrap">
                <button onClick={onDone} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">Close</button>
                {/* Retry failed (same account): clear job, resolve failed phones→ticketIds, start fresh send */}
                {job.failed > 0 && job.errors?.length > 0 && (
                  <button disabled={sending} onClick={async () => {
                    setSending(true); setError("");
                    try {
                      // Resolve phone numbers back to ticketIds
                      const failedPhones = job.errors.map((e) => e.phone.replace(/\D/g, ""));
                      const res = await fetch(
                        `${API_URL}/admin/users?eventId=${encodeURIComponent(event.slug)}&limit=1000`,
                        { headers: authHeaders(token) }
                      );
                      const data = await res.json();
                      const retryIds = (data.data || [])
                        .filter((u) => {
                          const d = u.phone.replace(/\D/g, "");
                          return failedPhones.some((fp) => d.endsWith(fp.slice(-10)) || fp.endsWith(d.slice(-10)));
                        })
                        .map((u) => u.ticketId);

                      if (retryIds.length === 0) { setError("Could not match failed numbers to users"); return; }

                      // Clear the finished job and restart with only failed users
                      await fetch(`${acctBase}/clear`, { method: "POST", headers: authHeaders(token) });
                      const sendRes = await fetch(`${acctBase}/send`, {
                        method: "POST", headers: authHeaders(token),
                        body: JSON.stringify({ ticketIds: retryIds, waTemplateId: selectedTemplate, eventDate }),
                      });
                      const sendData = await sendRes.json();
                      if (!sendRes.ok) { setError(sendData.message || "Failed to start retry"); await loadAccounts(); return; }
                      await loadAccounts();
                    } catch { setError("Unable to reach server"); }
                    finally { setSending(false); }
                  }}
                    className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-xl flex items-center gap-2">
                    {sending && <Spinner/>}
                    {sending ? "Starting…" : `↺ Retry failed (${job.failed})`}
                  </button>
                )}
                <button onClick={async () => {
                  await fetch(`${acctBase}/clear`, { method: "POST", headers: authHeaders(token) });
                  loadAccounts();
                }} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800">Send More</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bulk Send-All Modal (task 17) ─────────────────────────────────────────────
// Replaces the expensive log-fetching approach with a server-driven send-all + status poll.
function SendAllModal({ token, event, type, onClose }) {
  const [templates, setTemplates]        = useState([]);
  const [selectedTemplate, setSelected] = useState("");
  const [filter, setFilter]              = useState("all");
  const [sendLimit, setSendLimit]        = useState("");
  const [eventDate, setEventDate]        = useState("");
  const [job, setJob]                    = useState(null);
  const [starting, setStarting]          = useState(false);
  const [error, setError]                = useState("");
  const pollRef = useRef(null);

  const isEmail = type === "email";

  useEffect(() => {
    const url = `${API_URL}/admin/${isEmail ? "mail" : "wa"}/templates?eventId=${event.slug}`;
    fetch(url, { headers: authHeaders(token) }).then((r) => r.json()).then((d) => {
      const list = isEmail ? (d.data || []) : (d.data || []).filter((t) => t.isActive);
      setTemplates(list);
      const def = isEmail ? list.find((t) => t.isDefault) : list[0];
      if (def) setSelected(def._id);
    });
    return () => clearInterval(pollRef.current);
  }, [token, isEmail, event.slug]);

  const pollStatus = (tplId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const param = isEmail ? `templateId=${tplId}` : `waTemplateId=${tplId}`;
      const endpoint = isEmail ? "mail/send-all/status" : "wa/send-all/status";
      const res  = await fetch(`${API_URL}/admin/${endpoint}?eventId=${event.slug}&${param}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (data.job) {
        setJob(data.job);
        if (data.job.status === "completed") clearInterval(pollRef.current);
      }
    }, 2000);
  };

  const handleStart = async () => {
    if (!selectedTemplate) return;
    setStarting(true); setError("");
    try {
      const url  = isEmail ? `${API_URL}/admin/mail/send-all` : `${API_URL}/admin/wa/send-all`;
      const body = isEmail
        ? { templateId: selectedTemplate, filter, eventId: event.slug, ...(sendLimit ? { limit: parseInt(sendLimit, 10) } : {}) }
        : { waTemplateId: selectedTemplate, filter, eventId: event.slug, eventDate };
      const res  = await fetch(url, { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to start"); return; }
      setJob(data.job || { total: data.total, sent: 0, failed: 0, status: "running" });
      pollStatus(selectedTemplate);
    } catch { setError("Unable to reach server"); }
    finally { setStarting(false); }
  };

  const chosen   = templates.find((t) => t._id === selectedTemplate);
  const progress = job && job.total > 0 ? Math.round(((job.sent + job.failed) / job.total) * 100) : 0;
  const isDone   = job?.status === "completed";

  const FILTERS = [
    { key: "all",          label: "All non-blocked" },
    { key: "notMailedTemplate", label: isEmail ? "Not sent (this template)" : undefined },
    { key: "notSentTemplate",   label: !isEmail ? "Not sent (this template)" : undefined },
    { key: "checkedIn",    label: "Checked in only" },
    { key: "notCheckedIn", label: "Not checked in only" },
  ].filter((f) => f.label);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-zinc-100">
            {isEmail ? "✉ Bulk Email — Send All" : "💬 Bulk WhatsApp — Send All"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!job && (
            <>
              {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Template <span className="text-red-500">*</span></label>
                <select value={selectedTemplate} onChange={(e) => setSelected(e.target.value)}
                  className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select —</option>
                  {templates.map((t) => <option key={t._id} value={t._id}>{isEmail ? t.name : t.displayName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Send to</label>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${filter === f.key ? (isEmail ? "bg-blue-600 text-white border-blue-600" : "bg-emerald-600 text-white border-emerald-600") : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {isEmail && <AttachmentsNote files={chosen?.attachments}/>}
              {isEmail && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    Limit <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">— optional, leave blank to send to all matching</span>
                  </label>
                  <input
                    type="number" min="1" value={sendLimit}
                    onChange={(e) => setSendLimit(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 300"
                    className="w-32 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {sendLimit && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Will send to first {sendLimit} matching users. Use <strong>Not sent (this template)</strong> tomorrow for the rest.</p>}
                </div>
              )}
              {!isEmail && chosen?.parameterKeys?.includes("eventDate") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Event Date</label>
                  <input type="text" value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="e.g. May 20, 2026"
                    className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500"/>
                </div>
              )}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ This sends to all matching attendees. Progress is tracked below.
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
                <button onClick={handleStart} disabled={starting || !selectedTemplate}
                  className={`px-5 py-2 text-sm disabled:opacity-50 text-white rounded-xl flex items-center gap-2 ${isEmail ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                  {starting && <Spinner/>}{starting ? "Starting…" : "Start Bulk Send"}
                </button>
              </div>
            </>
          )}
          {job && !isDone && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-zinc-200 font-medium flex items-center gap-2"><Spinner/> Sending…</span>
                <span className="text-slate-500 dark:text-zinc-400">{job.sent + job.failed} / {job.total}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all duration-500 ${isEmail ? "bg-blue-500" : "bg-emerald-500"}`} style={{ width: `${progress}%` }}/>
              </div>
              <p className="text-xs text-slate-400 dark:text-zinc-500">✓ {job.sent} sent · ✗ {job.failed} failed · Running in background — you can close this.</p>
              <div className="flex justify-end">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800">Close (runs in background)</button>
              </div>
            </div>
          )}
          {isDone && (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="font-medium text-slate-700 dark:text-zinc-200">Bulk send complete</p>
              <p className="text-sm text-slate-500 dark:text-zinc-400">✓ {job.sent} sent · ✗ {job.failed} failed / {job.total} total</p>
              <button onClick={onClose} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Send Tab ─────────────────────────────────────────────────────────────────
// FIX #7: No longer fetches 2000 log entries to build sent-status sets.
// Instead, mailSent/waSent status comes directly from each user object in the
// SendTab — per-template email status + WA status columns
function SendTab({ token, event }) {
  const [emailTemplates, setEmailTemplates]     = useState([]);
  const [waTemplates, setWaTemplates]           = useState([]);
  // Which email template to show status for (drives ✉ column + filter)
  const [filterEmailTpl, setFilterEmailTpl]     = useState("");
  const [emailSentIds, setEmailSentIds]         = useState(new Set());
  const [emailSentLoading, setEmailSentLoading] = useState(false);
  // Which WA template to show status for (drives 💬 column + filter)
  const [filterWaTpl, setFilterWaTpl]           = useState("");
  const [waAnySentIds, setWaAnySentIds]         = useState(new Set()); // any WA message sent
  const [waTplSentIds, setWaTplSentIds]         = useState(new Set()); // sent with the chosen WA template
  const [waSentLoading, setWaSentLoading]       = useState(false);
  const waReq = useRef(0); // guards against a stale per-template fetch overwriting a newer one
  const waSentIds = filterWaTpl ? waTplSentIds : waAnySentIds;
  const [users, setUsers]                       = useState([]);
  const [pagination, setPagination]             = useState({ total: 0, page: 1, totalPages: 1 });
  const [search, setSearch]                     = useState("");
  const [page, setPage]                         = useState(1);
  const [loading, setLoading]                   = useState(false);
  const [selected, setSelected]                 = useState(new Set());
  // "all" | "emailSent" | "emailNotSent" | "waSent" | "waNotSent" | "neither"
  const [filter, setFilter]                     = useState("all");
  const [modal, setModal]                       = useState(null);
  const searchTimeout = useRef(null);

  // Load template lists once
  useEffect(() => {
    fetch(`${API_URL}/admin/mail/templates?eventId=${event.slug}`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => setEmailTemplates(d.data || []));
    fetch(`${API_URL}/admin/wa/templates?eventId=${event.slug}`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => setWaTemplates(d.data || []));
  }, [token, event.slug]);

  // When template filter changes → fetch all mail logs for that specific template (paginated)
  const fetchEmailSent = useCallback(async (tplId) => {
    if (!tplId) { setEmailSentIds(new Set()); return; }
    setEmailSentLoading(true);
    try {
      const ids = new Set();
      let pg = 1, totalPages = 1;
      do {
        const res  = await fetch(`${API_URL}/admin/mail/logs?eventId=${event.slug}&templateId=${tplId}&status=sent&limit=100&page=${pg}`, { headers: authHeaders(token) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load mail logs");
        (data.data || []).forEach((l) => ids.add(l.ticketId));
        totalPages = data.pagination?.totalPages || 1;
        pg++;
      } while (pg <= totalPages);
      setEmailSentIds(ids);
    } catch { /* ignore */ }
    finally { setEmailSentLoading(false); }
  }, [token, event.slug]);

  useEffect(() => { fetchEmailSent(filterEmailTpl); }, [filterEmailTpl, fetchEmailSent]);

  // WA sent set for a specific template — the logs API caps page size at 100, so walk every page
  const fetchWaSentForTpl = useCallback(async (tplId) => {
    const req = ++waReq.current;
    setWaSentLoading(true);
    try {
      const ids = new Set();
      let pg = 1, totalPages = 1;
      do {
        const res  = await fetch(`${API_URL}/admin/wa/logs?eventId=${event.slug}&waTemplateId=${tplId}&status=sent&limit=100&page=${pg}`, { headers: authHeaders(token) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load WA logs");
        (data.data || []).forEach((l) => ids.add(l.ticketId));
        totalPages = data.pagination?.totalPages || 1;
        pg++;
      } while (pg <= totalPages);
      if (req === waReq.current) setWaTplSentIds(ids);
    } catch { /* ignore */ }
    finally { if (req === waReq.current) setWaSentLoading(false); }
  }, [token, event.slug]);

  // WA sent set — any WA log for this event's users
  const fetchWaSentAny = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/admin/wa/logs?eventId=${event.slug}&status=sent&limit=2000`, { headers: authHeaders(token) });
      const data = await res.json();
      const eventTicketIds = new Set(users.map((u) => u.ticketId));
      setWaAnySentIds(new Set((data.data || []).map((l) => l.ticketId).filter((id) => eventTicketIds.has(id))));
    } catch { /* ignore */ }
  }, [token, event.slug, users]);

  useEffect(() => { if (users.length > 0) fetchWaSentAny(); }, [users, fetchWaSentAny]);

  // Refresh after a send: the "any" set always, plus the per-template set when one is chosen
  const refreshWaSent = () => {
    fetchWaSentAny();
    if (filterWaTpl) fetchWaSentForTpl(filterWaTpl);
  };

  const changeWaTpl = (tplId) => {
    waReq.current++;            // drop any in-flight per-template fetch
    setWaSentLoading(false);
    setWaTplSentIds(new Set());
    setFilterWaTpl(tplId);
    setFilter("all");
    setSelected(new Set());
    if (tplId) fetchWaSentForTpl(tplId);
  };

  const fetchUsers = useCallback(async (pg, q) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: 50, eventId: event.slug });
      if (q) params.set("search", q);
      const res  = await fetch(`${API_URL}/admin/users?${params}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) return;
      setUsers(data.data);
      setPagination(data.pagination);
      setSelected(new Set());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, event.slug]);

  useEffect(() => { fetchUsers(1, ""); }, [fetchUsers]);

  const handleSearchChange = (e) => {
    const val = e.target.value; setSearch(val); setPage(1);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchUsers(1, val), 350);
  };

  // Client-side filter using per-template status when a template is selected
  const filteredUsers = users.filter((u) => {
    const eSent = filterEmailTpl ? emailSentIds.has(u.ticketId) : u.mailSent;
    const wSent = waSentIds.has(u.ticketId);
    if (filter === "emailSent")    return eSent;
    if (filter === "emailNotSent") return !eSent;
    if (filter === "waSent")       return wSent;
    if (filter === "waNotSent")    return !wSent;
    if (filter === "neither")      return !eSent && !wSent;
    return true;
  });

  const allSelected     = filteredUsers.length > 0 && filteredUsers.every((u) => selected.has(u.ticketId));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredUsers.map((u) => u.ticketId)));
  };
  const toggleSelect = (id) => setSelected((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });

  const chosenTpl   = emailTemplates.find((t) => t._id === filterEmailTpl);
  const chosenWaTpl = waTemplates.find((t) => t._id === filterWaTpl);

  const FILTER_PILLS = [
    { key: "all",          label: "All" },
    { key: "emailSent",    label: "Email sent" },
    { key: "emailNotSent", label: "Email not sent" },
    { key: "waSent",       label: "WA sent" },
    { key: "waNotSent",    label: "WA not sent" },
    { key: "neither",      label: "Neither sent" },
  ];

  return (
    <div className="space-y-5">
      {/* Bulk send-all buttons */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl shadow-sm px-5 py-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mr-2">Bulk Send All</span>
        <button onClick={() => setModal({ type: "send-all-email" })}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          Email Everyone
        </button>
        <button onClick={() => setModal({ type: "send-all-wa" })}
          className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          WA Everyone
        </button>
      </div>

      {/* Template filters — email drives the ✉ column, WA drives the 💬 column */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl shadow-sm px-5 py-4 grid gap-5 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
            ✉ Show email status for template
          </label>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={filterEmailTpl}
              onChange={(e) => { setFilterEmailTpl(e.target.value); setFilter("all"); setSelected(new Set()); }}
              className="flex-1 min-w-52 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Any email (global mailSent flag) —</option>
              {emailTemplates.map((t) => (
                <option key={t._id} value={t._id}>{t.name}{t.isDefault ? " (default)" : ""}</option>
              ))}
            </select>
            {filterEmailTpl && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                {emailSentLoading
                  ? <><Spinner/> loading…</>
                  : <><span className="font-semibold text-blue-600 dark:text-blue-400">{emailSentIds.size}</span> sent with this template</>}
                <button onClick={() => { setFilterEmailTpl(""); setFilter("all"); }}
                  className="ml-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">✕ clear</button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
            💬 Show WA status for template
          </label>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={filterWaTpl}
              onChange={(e) => changeWaTpl(e.target.value)}
              className="flex-1 min-w-52 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-green-500">
              <option value="">— Any WA message —</option>
              {waTemplates.map((t) => (
                <option key={t._id} value={t._id}>{t.displayName}{t.isActive === false ? " (inactive)" : ""}</option>
              ))}
            </select>
            {filterWaTpl && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                {waSentLoading
                  ? <><Spinner/> loading…</>
                  : <><span className="font-semibold text-green-600 dark:text-green-400">{waSentIds.size}</span> sent with this template</>}
                <button onClick={() => changeWaTpl("")}
                  className="ml-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">✕ clear</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search + filter pills + bulk action */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input type="text" placeholder="Search name, email…" value={search} onChange={handleSearchChange}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 w-52"/>
          </div>
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 flex-wrap">
            {FILTER_PILLS.map((f) => (
              <button key={f.key} onClick={() => { setFilter(f.key); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filter === f.key ? "bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-slate-400 dark:text-zinc-500">
            {filteredUsers.length}{filter !== "all" ? ` / ${users.length}` : ""} user{users.length !== 1 ? "s" : ""}
          </span>
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button onClick={() => setModal({ type: "email", ticketIds: [...selected] })}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              Email {selected.size}
            </button>
            <button onClick={() => setModal({ type: "wa-web", ticketIds: [...selected] })}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              WA {selected.size}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
                <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded"/></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide whitespace-nowrap">
                  ✉ {chosenTpl ? chosenTpl.name : "Email"}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-green-600 dark:text-green-500 uppercase tracking-wide whitespace-nowrap">
                  💬 {chosenWaTpl ? chosenWaTpl.displayName : "WA"}
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Send</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800">
              {loading && filteredUsers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-slate-400 dark:text-zinc-600 text-sm">
                  <svg className="w-5 h-5 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Loading…
                </td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-slate-400 dark:text-zinc-600 text-sm">No users found</td></tr>
              ) : filteredUsers.map((user) => {
                const emailSent = filterEmailTpl ? emailSentIds.has(user.ticketId) : user.mailSent;
                const waSent    = waSentIds.has(user.ticketId);
                return (
                  <tr key={user.ticketId} className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors ${selected.has(user.ticketId) ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""}`}>
                    <td className="px-4 py-3.5"><input type="checkbox" checked={selected.has(user.ticketId)} onChange={() => toggleSelect(user.ticketId)} className="rounded"/></td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-zinc-100 whitespace-nowrap">{user.name}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{user.email}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap hidden sm:table-cell">{user.phone}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap hidden md:table-cell">{user.location || "—"}</td>
                    {/* Per-template email status */}
                    <td className="px-4 py-3.5">
                      {emailSentLoading && filterEmailTpl
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-zinc-800 text-slate-400"><Spinner/></span>
                        : emailSent
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>Sent</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>Pending</span>}
                    </td>
                    {/* WA status (per-template when a WA template is selected) */}
                    <td className="px-4 py-3.5">
                      {waSentLoading && filterWaTpl
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-zinc-800 text-slate-400"><Spinner/></span>
                        : waSent
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500"/>Sent</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>Pending</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setModal({ type: "email",  ticketIds: [user.ticketId] })} title="Send email" className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">✉</button>
                        <button onClick={() => setModal({ type: "wa-web", ticketIds: [user.ticketId] })} title="Send WA" className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 dark:border-green-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40">📱</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 px-5 py-3.5 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-zinc-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</p>
            <div className="flex gap-2">
              <button onClick={() => { const p = Math.max(1, page-1); setPage(p); fetchUsers(p, search); }} disabled={page===1||loading} className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Previous</button>
              <button onClick={() => { const p = Math.min(pagination.totalPages, page+1); setPage(p); fetchUsers(p, search); }} disabled={page===pagination.totalPages||loading} className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {modal?.type === "email"          && <EmailModal  token={token} event={event} ticketIds={modal.ticketIds} onClose={() => setModal(null)} onDone={() => { setModal(null); fetchUsers(page, search); fetchEmailSent(filterEmailTpl); }}/>}
      {modal?.type === "wa-web"         && <WaWebModal  token={token} event={event} ticketIds={modal.ticketIds} onClose={() => setModal(null)} onDone={() => { setModal(null); fetchUsers(page, search); refreshWaSent(); }}/>}
      {modal?.type === "send-all-email" && <SendAllModal token={token} event={event} type="email" onClose={() => { setModal(null); fetchUsers(page, search); fetchEmailSent(filterEmailTpl); }}/>}
      {modal?.type === "send-all-wa"    && <SendAllModal token={token} event={event} type="wa"    onClose={() => { setModal(null); fetchUsers(page, search); refreshWaSent(); }}/>}
    </div>
  );
}
// ── WhatsApp Accounts Panel ──────────────────────────────────────────────────
// An event can link several WhatsApp numbers; each has its own QR login and send job.
function WaAccountsPanel({ token, event }) {
  const [accounts, setAccounts] = useState(null); // null while loading
  const [max, setMax]           = useState(5);
  const [adding, setAdding]     = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy]         = useState("");   // account id (or "new") with a request in flight
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts`, { headers: authHeaders(token) });
      const data = await res.json();
      if (res.ok) { setAccounts(data.data || []); setMax(data.max || 5); }
    } catch { /* ignore */ }
  }, [token, event._id]);

  // Poll fast while any account is starting up, waiting on a QR scan or closing; slowly otherwise
  const connecting = (accounts || []).some((a) => ["starting", "qr", "authenticated", "closing"].includes(a.state));
  useEffect(() => {
    load();
    const t = setInterval(load, connecting ? 3000 : 12000);
    return () => clearInterval(t);
  }, [load, connecting]);

  // One request; returns an error message or "" on success
  const request = async (id, method, tail = "", body) => {
    try {
      const res  = await fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts${id ? `/${id}` : ""}${tail}`, {
        method, headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? "" : (data.message || "Request failed");
    } catch { return "Unable to reach server"; }
  };

  const run = async (id, steps) => {
    setBusy(id); setError("");
    for (const [method, tail, body] of steps) {
      const err = await request(id, method, tail, body);
      if (err) { setError(err); break; }
    }
    setBusy(""); await load();
  };

  const addAccount = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setBusy("new"); setError("");
    const err = await request("", "POST", "", { label });
    setBusy("");
    if (err) { setError(err); return; }
    setNewLabel(""); setAdding(false); await load();
  };

  const rename = (a) => {
    const label = window.prompt("Rename account", a.label);
    if (label && label.trim() && label.trim() !== a.label) run(a._id, [["PUT", "", { label: label.trim() }]]);
  };

  const remove = (a) => {
    if (!confirm(`Remove "${a.label}"? It will be disconnected and its saved WhatsApp login deleted. Past message logs are kept.`)) return;
    run(a._id, [["DELETE", ""]]);
  };

  const list    = accounts || [];
  const atLimit = list.length >= max;

  const badge = (a) => {
    if (a.state === "ready")         return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>Connected</span>;
    if (a.state === "starting")      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"><Spinner/> Starting…</span>;
    if (a.state === "closing")       return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"><Spinner/> Disconnecting…</span>;
    if (a.state === "qr" || a.state === "authenticated") return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"><Spinner/> {a.state === "qr" ? "Scan QR" : "Connecting…"}</span>;
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"><span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-600"/>Disconnected</span>;
  };

  const btn = "px-4 py-2 text-sm rounded-xl disabled:opacity-50";
  const ghost = `${btn} border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800`;
  const danger = `${btn} border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
            WhatsApp Accounts (Personal)
            <span className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">{list.length} / {max}</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Link one or more WhatsApp numbers for <strong className="text-slate-700 dark:text-zinc-300">{event.name}</strong> and choose which one to send from.
          </p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setError(""); }} disabled={atLimit}
            title={atLimit ? `Limit of ${max} accounts per event reached` : undefined}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white rounded-xl font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add account
          </button>
        )}
      </div>

      {adding && (
        <div className="flex gap-2 flex-wrap items-center bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 rounded-xl p-3">
          <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60}
            onKeyDown={(e) => { if (e.key === "Enter") addAccount(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); } }}
            placeholder="Account name, e.g. Priya's phone"
            className="flex-1 min-w-48 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-green-500"/>
          <button onClick={addAccount} disabled={!newLabel.trim() || busy === "new"} className={`${btn} bg-green-600 hover:bg-green-700 text-white flex items-center gap-2`}>
            {busy === "new" && <Spinner/>}Add &amp; show QR
          </button>
          <button onClick={() => { setAdding(false); setNewLabel(""); setError(""); }} className={ghost}>Cancel</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}

      {accounts === null && <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-zinc-500"><Spinner/> Loading accounts…</div>}

      {accounts !== null && list.length === 0 && !adding && (
        <div className="text-center py-8 border border-dashed border-slate-200 dark:border-zinc-700 rounded-xl">
          <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">No WhatsApp accounts yet</p>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Add an account, then scan its QR code with WhatsApp → Linked Devices.</p>
        </div>
      )}

      <div className="space-y-3">
        {list.map((a) => {
          const sending = a.job?.status === "running";
          const working = busy === a._id;
          return (
            <div key={a._id} className="border border-slate-100 dark:border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-sm text-slate-800 dark:text-zinc-100">{a.label}</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">{a.phone ? `+${a.phone}` : "Not linked yet"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sending && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>Sending {a.job.sent + a.job.failed}/{a.job.total}</span>}
                  {badge(a)}
                </div>
              </div>

              {a.error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{a.error}</p>}

              {a.state === "starting" && (
                <div className="text-center py-5 border border-slate-100 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-800/50 space-y-2">
                  <div className="flex justify-center"><Spinner/></div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">Starting WhatsApp…</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">This can take up to 30 seconds. A QR code appears here if a scan is needed.</p>
                </div>
              )}
              {a.state === "qr" && a.qrDataUrl && (
                <div className="text-center py-4 space-y-3 border border-slate-100 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-800/50">
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">Scan with the WhatsApp of &ldquo;{a.label}&rdquo;</p>
                  <img src={a.qrDataUrl} alt={`QR code for ${a.label}`} className="mx-auto w-56 h-56 rounded-xl"/>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">Open WhatsApp → Linked Devices → Link a Device</p>
                </div>
              )}
              {a.state === "qr" && !a.qrDataUrl && (
                <div className="text-center py-5 border border-slate-100 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-800/50 space-y-2">
                  <div className="flex justify-center"><Spinner/></div>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">Generating QR code…</p>
                </div>
              )}
              {a.state === "authenticated" && (
                <div className="text-center py-3 text-sm text-slate-500 dark:text-zinc-400 flex items-center justify-center gap-2"><Spinner/> Session authenticated, waiting for ready…</div>
              )}

              <div className="flex gap-2 flex-wrap items-center">
                {a.state === "disconnected" && (
                  <button onClick={() => run(a._id, [["POST", "/init"]])} disabled={working} className={`${btn} bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2`}>
                    {working && <Spinner/>}Connect WhatsApp
                  </button>
                )}
                {a.state === "ready" && (
                  <>
                    <button onClick={() => run(a._id, [["POST", "/disconnect"]])} disabled={working || sending} className={danger}>Disconnect</button>
                    <button onClick={() => run(a._id, [["POST", "/disconnect"], ["POST", "/init"]])} disabled={working || sending} className={ghost}>Reconnect (new QR)</button>
                  </>
                )}
                {a.state === "starting" && (
                  <button onClick={() => run(a._id, [["POST", "/disconnect"]])} disabled={working} className={danger}>Cancel</button>
                )}
                {(a.state === "qr" || a.state === "authenticated") && (
                  <>
                    <button onClick={() => run(a._id, [["POST", "/disconnect"], ["POST", "/init"]])} disabled={working} className={ghost}>Reconnect (new QR)</button>
                    <button onClick={() => run(a._id, [["POST", "/disconnect"]])} disabled={working} className={danger}>Cancel</button>
                  </>
                )}
                <span className="flex-1"/>
                <button onClick={() => rename(a)} disabled={working || a.state === "closing"} className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-50">Rename</button>
                <button onClick={() => remove(a)} disabled={working || sending || a.state === "closing"} title={sending ? "Stop the send first" : undefined} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab({ token, event }) {
  const [form, setForm]           = useState({ host: "smtp.gmail.com", port: "587", secure: false, user: "", pass: "", fromName: "Event Team", fromEmail: "" });
  const [hasPassword, setHasPwd] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null);
  const [testTo, setTestTo]       = useState("");
  const [testing, setTesting]     = useState(false);
  const [testMsg, setTestMsg]     = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/events/${event._id}/smtp`, { headers: authHeaders(token) })
      .then((r) => r.json()).then((d) => {
        if (d.success) {
          const c = d.data;
          setForm({ host: c.host || "smtp.gmail.com", port: String(c.port || 587), secure: !!c.secure, user: c.user || "", pass: "", fromName: c.fromName || "Event Team", fromEmail: c.fromEmail || "" });
          setHasPwd(c.hasPassword);
          setTestTo(c.user || "");
        }
      }).catch(() => {}).finally(() => setLoading(false));
  }, [token, event._id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    setSaveMsg(null);
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const res  = await fetch(`${API_URL}/admin/events/${event._id}/smtp`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) setSaveMsg({ type: "error",   text: data.message || "Save failed" });
      else        { setSaveMsg({ type: "success", text: "Settings saved" }); setHasPwd(true); setForm((p) => ({ ...p, pass: "" })); }
    } catch { setSaveMsg({ type: "error", text: "Unable to reach server" }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testTo) return;
    setTesting(true); setTestMsg(null);
    try {
      const res  = await fetch(`${API_URL}/admin/events/${event._id}/smtp/test`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ to: testTo }) });
      const data = await res.json();
      setTestMsg({ type: res.ok ? "success" : "error", text: data.message });
    } catch { setTestMsg({ type: "error", text: "Unable to reach server" }); }
    finally { setTesting(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 dark:text-zinc-500 text-sm py-8"><Spinner/> Loading settings…</div>;

  const msgCls = (type) => type === "success"
    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900"
    : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-zinc-100">Email (SMTP) Configuration</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Configure the sender email for <strong>{event.name}</strong>. For Gmail, use an App Password.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">SMTP Host <span className="text-red-500">*</span></label>
            <input name="host" value={form.host} onChange={handleChange} placeholder="smtp.gmail.com" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Port</label>
            <select name="port" value={form.port} onChange={handleChange} className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="587">587 (TLS — recommended)</option>
              <option value="465">465 (SSL)</option>
              <option value="25">25 (plain)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Gmail / SMTP Email <span className="text-red-500">*</span></label>
          <input name="user" type="email" value={form.user} onChange={handleChange} placeholder="yourname@gmail.com" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">App Password {hasPassword && <span className="text-xs font-normal text-emerald-600 ml-1">✓ saved</span>}</label>
          <input name="pass" type="password" value={form.pass} onChange={handleChange} autoComplete="new-password"
            placeholder={hasPassword ? "Leave blank to keep existing" : "Enter Gmail App Password"}
            className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">From Name</label>
            <input name="fromName" value={form.fromName} onChange={handleChange} placeholder="Event Team" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">From Email</label>
            <input name="fromEmail" type="email" value={form.fromEmail} onChange={handleChange} placeholder="Same as SMTP email" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
        </div>
        {saveMsg && <div className={`text-sm rounded-xl px-4 py-2.5 ${msgCls(saveMsg.type)}`}>{saveMsg.text}</div>}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl flex items-center gap-2 font-medium">
            {saving && <Spinner/>}{saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-zinc-100">Test Email</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Send a test to verify SMTP settings are working.</p>
        </div>
        <div className="flex gap-3">
          <input type="email" value={testTo} onChange={(e) => { setTestTo(e.target.value); setTestMsg(null); }} placeholder="recipient@example.com"
            className="flex-1 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/>
          <button onClick={handleTest} disabled={testing || !testTo} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl flex items-center gap-2 font-medium shrink-0">
            {testing && <Spinner/>}{testing ? "Sending…" : "Send Test"}
          </button>
        </div>
        {testMsg && <div className={`text-sm rounded-xl px-4 py-2.5 ${msgCls(testMsg.type)}`}>{testMsg.text}</div>}
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-5">
        <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-2">How to get a Gmail App Password</h3>
        <ol className="text-sm text-indigo-700 dark:text-indigo-400 space-y-1 list-decimal list-inside">
          <li>Go to <strong>myaccount.google.com</strong></li>
          <li>Navigate to <strong>Security → 2-Step Verification</strong> (must be enabled)</li>
          <li>Scroll down to <strong>App Passwords</strong></li>
          <li>Select app: <em>Mail</em>, device: <em>Other</em> → name it "KP Events"</li>
          <li>Copy the 16-character password and paste it above</li>
        </ol>
      </div>

      <WaAccountsPanel token={token} event={event}/>
    </div>
  );
}

// ── Import CSV Tab ────────────────────────────────────────────────────────────
function ImportTab({ token, event }) {
  const [file, setFile]       = useState(null);
  const [sendMail, setSendMail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setResult(null); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch(`${API_URL}/admin/import?sendMail=${sendMail}&eventId=${encodeURIComponent(event.slug)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Import failed"); return; }
      setResult(data.data);
    } catch { setError("Unable to reach server"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-zinc-100">Upload CSV File</h3>
        <div className="text-sm text-slate-500 dark:text-zinc-400 space-y-1">
          <p>Supports two formats:</p>
          <p>• <strong className="text-slate-700 dark:text-zinc-300">Google Form export</strong> — <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded text-xs">Timestamp, Email Address, Name, Location, Alternate Email Id, Phone Number</code></p>
          <p>• <strong className="text-slate-700 dark:text-zinc-300">Simple CSV</strong> — <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded text-xs">name, email, phone</code></p>
        </div>
        <div className="border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors"
          onClick={() => document.getElementById("csv-comms").click()}>
          <svg className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{file ? file.name : "Click to select CSV"}</p>
          <input id="csv-comms" type="file" accept=".csv" className="hidden" onChange={(e) => { setFile(e.target.files[0]); setResult(null); }}/>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} className="rounded"/>
          <span className="text-sm text-slate-700 dark:text-zinc-200">Send QR ticket email after import</span>
        </label>
        {error  && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
        {result && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-xl px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Import complete</p>
            <p className="text-slate-600 dark:text-zinc-300">Inserted: <strong>{result.inserted}</strong> · Skipped: <strong>{result.skipped}</strong> · Failed: <strong>{result.failed}</strong></p>
          </div>
        )}
        <button onClick={handleUpload} disabled={!file || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl py-2.5 flex items-center justify-center gap-2">
          {loading && <Spinner/>}{loading ? "Importing…" : "Import CSV"}
        </button>
      </div>
    </div>
  );
}

// ── Mail Templates Tab ────────────────────────────────────────────────────────
function MailTemplatesTab({ token, event }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ name: "", subject: "", body: "", isDefault: false });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [attachments, setAttachments] = useState([]);   // files already stored on the template being edited
  const [pendingFiles, setPendingFiles] = useState([]); // files chosen for a NEW template — uploaded when it is saved
  const [attBusy, setAttBusy]     = useState(false);
  const [attError, setAttError]   = useState("");
  const HINTS = "{{name}}  {{email}}  {{ticketId}}  {{eventId}}  {{qrcode}}";

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${API_URL}/admin/mail/templates?eventId=${event.slug}`, { headers: authHeaders(token) }); const d = await r.json(); setTemplates(d.data || []); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token, event.slug]);
  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm({ name: "", subject: "", body: "", isDefault: false }); setAttachments([]); setPendingFiles([]); setAttError(""); setEditing("new"); setError(""); };
  const openEdit = (t) => { setForm({ name: t.name, subject: t.subject, body: t.body, isDefault: t.isDefault }); setAttachments(t.attachments || []); setPendingFiles([]); setAttError(""); setEditing(t); setError(""); };
  const cancel   = () => { setEditing(null); setError(""); load(); }; // reload: files may have been added/removed while editing

  // ── attachments ──
  const uploadAttachment = async (templateId, file) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_URL}/admin/mail/templates/${templateId}/attachments?eventId=${event.slug}`, { method: "POST", headers: bearer(token), body: fd });
      const d = await r.json().catch(() => ({}));
      return r.ok ? { attachments: d.data.attachments } : { error: d.message || "Upload failed" };
    } catch { return { error: "Unable to reach server" }; }
  };

  // Quick checks for instant feedback; the server enforces the same rules
  const checkFile = (file, current) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ATT.exts.includes(ext)) return `"${file.name}": only PDF, PNG or JPG files can be attached`;
    if (file.size > ATT.maxFile) return `"${file.name}" is ${fmtSize(file.size)} — the limit is ${fmtSize(ATT.maxFile)} per file`;
    if (current.length >= ATT.maxFiles) return `A template can have at most ${ATT.maxFiles} attachments`;
    if (current.reduce((n, f) => n + f.size, 0) + file.size > ATT.maxTotal) return `Attachments can total at most ${fmtSize(ATT.maxTotal)} per template`;
    if (current.some((f) => (f.filename || f.name).toLowerCase() === file.name.toLowerCase())) return `"${file.name}" is already attached`;
    return "";
  };

  const addFiles = async (list) => {
    setAttError("");
    const isNew = editing === "new";
    let current = isNew ? pendingFiles : attachments;
    for (const file of Array.from(list)) {
      const err = checkFile(file, current);
      if (err) { setAttError(err); return; }
      if (isNew) {
        current = [...current, file];
        setPendingFiles(current);
      } else {
        setAttBusy(true);
        const res = await uploadAttachment(editing._id, file);
        setAttBusy(false);
        if (res.error) { setAttError(res.error); return; }
        current = res.attachments;
        setAttachments(current);
      }
    }
  };

  const removeAttachment = async (att) => {
    setAttError("");
    if (editing === "new") { setPendingFiles((p) => p.filter((f) => f !== att)); return; }
    setAttBusy(true);
    try {
      const r = await fetch(`${API_URL}/admin/mail/templates/${editing._id}/attachments/${att._id}?eventId=${event.slug}`, { method: "DELETE", headers: bearer(token) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setAttachments(d.data.attachments); else setAttError(d.message || "Could not remove the file");
    } catch { setAttError("Unable to reach server"); }
    finally { setAttBusy(false); }
  };

  const save = async () => {
    if (!form.name || !form.subject || !form.body) { setError("All fields required"); return; }
    setSaving(true); setError("");
    try {
      const isNew = editing === "new";
      const url   = isNew ? `${API_URL}/admin/mail/templates` : `${API_URL}/admin/mail/templates/${editing._id}`;
      const r     = await fetch(url, { method: isNew ? "POST" : "PUT", headers: authHeaders(token), body: JSON.stringify({ ...form, eventId: event.slug }) });
      const d     = await r.json();
      if (!r.ok) { setError(d.message || "Save failed"); return; }
      // A new template has no id until now — upload the files chosen for it
      if (isNew && pendingFiles.length > 0) {
        let stored = d.data.attachments || [];
        for (const file of pendingFiles) {
          const res = await uploadAttachment(d.data._id, file);
          if (res.error) {
            // The template exists now; keep editing it so nothing is lost
            setAttachments(stored); setPendingFiles([]); setEditing({ ...d.data, attachments: stored });
            setError(`Template saved, but "${file.name}" couldn't be attached: ${res.error}`);
            load();
            return;
          }
          stored = res.attachments;
        }
      }
      setEditing(null); load();
    } catch { setError("Unable to reach server"); } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`${API_URL}/admin/mail/templates/${id}?eventId=${event.slug}`, { method: "DELETE", headers: authHeaders(token) });
    load();
  };

  if (editing) return (
    <div className="max-w-2xl">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-zinc-100">{editing === "new" ? "New Email Template" : `Edit: ${editing.name}`}</h3>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
        <div><label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Name</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({...p, name: e.target.value}))} placeholder="e.g. Invite Email" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/></div>
        <div><label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Subject</label>
          <input value={form.subject} onChange={(e) => setForm((p) => ({...p, subject: e.target.value}))} placeholder="Your ticket for {{eventId}}" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"/></div>
        <div><label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Body (HTML)</label>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mb-1.5">Placeholders: <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">{HINTS}</code></p>
          <textarea value={form.body} onChange={(e) => setForm((p) => ({...p, body: e.target.value}))} rows={10} placeholder="<p>Hello {{name}},</p>" className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500 resize-y"/></div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
            Attachments <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">— sent with every email from this template</span>
          </label>
          {attError && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2 mb-2">{attError}</p>}
          {(attachments.length > 0 || pendingFiles.length > 0) && (
            <ul className="space-y-1.5 mb-2">
              {attachments.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-zinc-200">📎 {a.filename}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{fmtSize(a.size)}</span>
                    <button onClick={() => removeAttachment(a)} disabled={attBusy} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                  </span>
                </li>
              ))}
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 border border-dashed border-slate-300 dark:border-zinc-600 rounded-xl px-3 py-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-zinc-200">📎 {f.name} <span className="text-xs text-slate-400 dark:text-zinc-500">· uploads when you save</span></span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{fmtSize(f.size)}</span>
                    <button onClick={() => removeAttachment(f)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-slate-300 dark:border-zinc-600 rounded-xl text-slate-600 dark:text-zinc-300 ${attBusy ? "opacity-60" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800"}`}>
            {attBusy ? <Spinner/> : <span aria-hidden>＋</span>}{attBusy ? "Uploading…" : "Attach file"}
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" disabled={attBusy} className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}/>
          </label>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5">PDF, PNG or JPG · up to {fmtSize(ATT.maxFile)} each · {ATT.maxFiles} files, {fmtSize(ATT.maxTotal)} in total</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({...p, isDefault: e.target.checked}))} className="rounded"/>
          <span className="text-sm text-slate-700 dark:text-zinc-200">Set as default</span>
        </label>
        <div className="flex gap-3 justify-end">
          <button onClick={cancel} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl flex items-center gap-2">
            {saving && <Spinner/>}{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>New Template
        </button>
      </div>
      {loading ? <p className="text-sm text-slate-400 dark:text-zinc-500">Loading…</p> : templates.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 p-10 text-center text-slate-400 dark:text-zinc-500 text-sm">No email templates yet.</div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t._id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800 dark:text-zinc-100 text-sm">{t.name}</p>
                  {t.isDefault && <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600 font-medium">Default</span>}
                  {t.attachments?.length > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-medium whitespace-nowrap">📎 {t.attachments.length}</span>}
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">{t.subject}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(t)} className="text-xs px-3 py-1.5 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">Edit</button>
                <button onClick={() => del(t._id)}  className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WA Templates Tab ──────────────────────────────────────────────────────────
const WA_VAR_HINTS = ["{{name}}", "{{email}}", "{{phone}}", "{{ticketId}}", "{{eventId}}", "{{eventDate}}"];

function WaTemplatesTab({ token, event }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ displayName: "", body: "", isActive: true });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${API_URL}/admin/wa/templates?eventId=${event.slug}`, { headers: authHeaders(token) }); const d = await r.json(); setTemplates(d.data || []); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token, event.slug]);
  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm({ displayName: "", body: "", isActive: true }); setEditing("new"); setError(""); };
  const openEdit = (t) => { setForm({ displayName: t.displayName, body: t.body || "", isActive: t.isActive ?? true }); setEditing(t); setError(""); };
  const cancel   = () => { setEditing(null); setError(""); };

  // Insert a variable at cursor position in the textarea
  const insertVar = (v) => {
    setForm((p) => ({ ...p, body: p.body + v }));
  };

  const save = async () => {
    if (!form.displayName.trim()) { setError("Display name is required"); return; }
    if (!form.body.trim())        { setError("Message body is required"); return; }
    setSaving(true); setError("");
    try {
      const isNew = editing === "new";
      const url   = isNew ? `${API_URL}/admin/wa/templates` : `${API_URL}/admin/wa/templates/${editing._id}`;
      const r     = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: authHeaders(token),
        // metaTemplateName required by model — pass displayName as placeholder; it's unused for WA Web
        body: JSON.stringify({ ...form, metaTemplateName: form.displayName, eventId: event.slug }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.message || "Save failed"); return; }
      setEditing(null); load();
    } catch { setError("Unable to reach server"); } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm("Delete this WA template?")) return;
    await fetch(`${API_URL}/admin/wa/templates/${id}?eventId=${event.slug}`, { method: "DELETE", headers: authHeaders(token) });
    load();
  };

  if (editing) return (
    <div className="max-w-2xl">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-zinc-100">{editing === "new" ? "New WA Template" : `Edit: ${editing.displayName}`}</h3>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Template Name <span className="text-red-500">*</span></label>
          <input value={form.displayName} onChange={(e) => setForm((p) => ({...p, displayName: e.target.value}))}
            placeholder="e.g. Invite Message"
            className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Message Body <span className="text-red-500">*</span></label>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mb-2">
            Write the exact message to send. Click a variable below to insert it at the end.
          </p>
          {/* Variable insertion chips */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {WA_VAR_HINTS.map((v) => (
              <button key={v} type="button" onClick={() => insertVar(v)}
                className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                {v}
              </button>
            ))}
          </div>
          <textarea value={form.body} onChange={(e) => setForm((p) => ({...p, body: e.target.value}))} rows={8}
            placeholder={"Hi {{name}},\n\nYour ticket for the event is confirmed!\nTicket ID: {{ticketId}}\n\nSee you there 🎉"}
            className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500 resize-y font-mono"/>
          {/* Live preview */}
          {form.body && (
            <div className="mt-2 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5 uppercase tracking-wide">Preview (with sample values)</p>
              <p className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">
                {form.body
                  .replace(/\{\{name\}\}/g, "Rohan")
                  .replace(/\{\{email\}\}/g, "rohan@example.com")
                  .replace(/\{\{phone\}\}/g, "9000000001")
                  .replace(/\{\{ticketId\}\}/g, "abc-123")
                  .replace(/\{\{eventId\}\}/g, "kp-event-2026")
                  .replace(/\{\{eventDate\}\}/g, "May 20, 2026")}
              </p>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({...p, isActive: e.target.checked}))} className="rounded"/>
          <span className="text-sm text-slate-700 dark:text-zinc-200">Active</span>
        </label>

        <div className="flex gap-3 justify-end">
          <button onClick={cancel} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl flex items-center gap-2">
            {saving && <Spinner/>}{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>New WA Template
        </button>
      </div>
      {loading ? <p className="text-sm text-slate-400 dark:text-zinc-500">Loading…</p> : templates.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 p-10 text-center text-slate-400 dark:text-zinc-500 text-sm">No WA templates yet. Create one to start sending messages.</div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t._id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-800 dark:text-zinc-100 text-sm">{t.displayName}</p>
                  {!t.isActive && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">Inactive</span>}
                </div>
                {t.body
                  ? <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 whitespace-pre-line">{t.body}</p>
                  : <p className="text-xs text-amber-600 dark:text-amber-400 italic">No message body — edit to add one</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(t)} className="text-xs px-3 py-1.5 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">Edit</button>
                <button onClick={() => del(t._id)}  className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status Tab ─────────────────────────────────────────────────────────────────
// Shows all active/recent send jobs — survives page refresh via polling /admin/jobs.
function StatusTab({ token, event }) {
  const [jobs, setJobs]         = useState(null); // { mailJobs, waJobs, waAccounts }
  const [todayStats, setToday]  = useState(null); // { emailSent, waSent }
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [stopping, setStopping] = useState("");   // id of the WhatsApp account being stopped
  const pollRef                 = useRef(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/admin/jobs?eventId=${event._id}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) { setError("Failed to load jobs"); return; }
      setJobs(data);
      setError("");
    } catch { setError("Unable to reach server"); }
    finally { setLoading(false); }
  }, [token, event._id]);

  const fetchTodayStats = useCallback(async () => {
    try {
      const today  = new Date(); today.setHours(0, 0, 0, 0);
      const since  = today.toISOString();
      const [mailRes, waRes] = await Promise.all([
        fetch(`${API_URL}/admin/mail/logs?status=sent&limit=1&eventId=${event.slug}`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/admin/wa/logs?status=sent&limit=1&eventId=${event.slug}`,   { headers: authHeaders(token) }),
      ]);
      const mailData = await mailRes.json();
      const waData   = await waRes.json();
      // Use pagination totals as a proxy — these are all-time, but good enough for a summary
      setToday({ emailTotal: mailData.pagination?.total ?? 0, waTotal: waData.pagination?.total ?? 0 });
    } catch { /* non-critical */ }
  }, [token, event.slug]);

  // Poll every 4s when a job is running, stop when all idle
  useEffect(() => {
    fetchJobs();
    fetchTodayStats();
    pollRef.current = setInterval(() => {
      fetchJobs();
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [fetchJobs, fetchTodayStats]);

  // Slow down polling when nothing is running
  useEffect(() => {
    if (!jobs) return;
    const anyRunning =
      jobs.waAccounts?.some((a) => a.job?.status === "running") ||
      jobs.mailJobs?.some((j) => j.status === "running") ||
      jobs.waJobs?.some((j) => j.status === "running");

    clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchJobs, anyRunning ? 3000 : 10000);
    return () => clearInterval(pollRef.current);
  }, [jobs, fetchJobs]);

  const handleStopWaWeb = async (accountId) => {
    setStopping(accountId);
    try {
      await fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts/${accountId}/stop`, { method: "POST", headers: authHeaders(token) });
      await fetchJobs();
    } catch { /* ignore */ }
    finally { setStopping(""); }
  };

  const handleClearWaWeb = async (accountId) => {
    await fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts/${accountId}/clear`, { method: "POST", headers: authHeaders(token) });
    await fetchJobs();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const pct = (j) => j.total > 0 ? Math.round(((j.sent + j.failed) / j.total) * 100) : 0;

  const duration = (startedAt, finishedAt) => {
    const ms  = new Date(finishedAt || Date.now()) - new Date(startedAt);
    const s   = Math.floor(ms / 1000);
    if (s < 60)  return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const etaWaWeb = (j) => {
    if (!j || j.status !== "running") return null;
    const remaining = j.total - j.sent - j.failed;
    const mins      = Math.round(remaining * 27 / 60);
    return mins > 0 ? `~${mins} min left` : "almost done";
  };

  const statusBadge = (status) => {
    if (status === "running")   return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>Running</span>;
    if (status === "completed") return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Done</span>;
    if (status === "stopped")   return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>Stopped</span>;
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>Idle</span>;
  };

  const progressBar = (j, color) => (
    <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 mt-2">
      <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct(j)}%` }}/>
    </div>
  );

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 dark:text-zinc-500 text-sm py-12">
      <Spinner/> Loading job status…
    </div>
  );

  if (error) return (
    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3">{error}</div>
  );

  const { mailJobs = [], waJobs = [], waAccounts = [] } = jobs || {};
  const waReady = waAccounts.filter((a) => a.state === "ready").length;
  const allJobsSorted = [
    ...mailJobs.map((j) => ({ ...j, channel: "email" })),
    ...waJobs.map((j)   => ({ ...j, channel: "wa-meta" })),
  ].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  const anyRunning =
    waAccounts.some((a) => a.job?.status === "running") ||
    allJobsSorted.some((j) => j.status === "running");

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-zinc-100">Send Status</h2>
          <p className="text-sm text-slate-400 dark:text-zinc-500 mt-0.5">
            Auto-refreshes every {anyRunning ? "3" : "10"}s
            {anyRunning && <span className="ml-2 inline-flex items-center gap-1 text-blue-500"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>Live</span>}
          </p>
        </div>
        <button onClick={() => { setLoading(true); fetchJobs(); fetchTodayStats(); }}
          className="px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9"/></svg>
          Refresh now
        </button>
      </div>

      {/* Summary cards */}
      {todayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Emails Sent",  value: todayStats.emailTotal, color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/20" },
            { label: "Total WA Sent",      value: todayStats.waTotal,    color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
            { label: "Active Jobs",        value: [...waAccounts.map((a) => a.job), ...allJobsSorted].filter((j) => j?.status === "running").length, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/20" },
            { label: "WA Accounts",        value: waAccounts.length === 0 ? "None" : `${waReady}/${waAccounts.length} connected`, color: waReady > 0 ? "text-emerald-600" : "text-amber-500", bg: "bg-slate-50 dark:bg-zinc-800" },
          ].map((c) => (
            <div key={c.label} className={`${c.bg} rounded-xl border border-slate-100 dark:border-zinc-800 px-4 py-3`}>
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium uppercase tracking-wide">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value ?? "—"}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── WA Web job cards (one per linked account) ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">WhatsApp Web (Personal)</p>
        {waAccounts.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 px-5 py-4 text-sm text-slate-400 dark:text-zinc-500">
            No WhatsApp account linked for this event. Add one in the Settings tab.
          </div>
        )}
        {waAccounts.map((acct) => { const waWebJob = acct.job; return (
        <div key={acct._id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4">
          {!waWebJob ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{acct.label} · no active job</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500">{acct.phone ? `+${acct.phone} · ` : ""}Connection: {WA_STATE_LABEL[acct.state] || "offline"}</p>
                </div>
              </div>
              {statusBadge("idle")}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${waWebJob.status === "running" ? "bg-green-100 dark:bg-green-950/40" : waWebJob.status === "completed" ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-amber-100 dark:bg-amber-950/40"}`}>
                    <svg className={`w-4 h-4 ${waWebJob.status === "running" ? "text-green-600 dark:text-green-400" : waWebJob.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">WA Bulk Send · {acct.label}{acct.phone ? ` (+${acct.phone})` : ""}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500">
                      Started {new Date(waWebJob.startedAt).toLocaleTimeString()}
                      {waWebJob.stoppedAt && ` · Ended ${new Date(waWebJob.stoppedAt).toLocaleTimeString()}`}
                      {` · Duration: ${duration(waWebJob.startedAt, waWebJob.stoppedAt)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(waWebJob.status)}
                  {waWebJob.status === "running" && (
                    <button onClick={() => handleStopWaWeb(acct._id)} disabled={stopping === acct._id}
                      className="px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50">
                      {stopping === acct._id ? "…" : "Stop"}
                    </button>
                  )}
                  {(waWebJob.status === "completed" || waWebJob.status === "stopped") && (
                    <button onClick={() => handleClearWaWeb(acct._id)}
                      className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1">
                  <span>✓ {waWebJob.sent} sent · ✗ {waWebJob.failed} failed · {waWebJob.total} total</span>
                  <span className="font-medium">{pct(waWebJob)}% {etaWaWeb(waWebJob) ? `· ${etaWaWeb(waWebJob)}` : ""}</span>
                </div>
                {progressBar(waWebJob, "bg-green-500")}
              </div>

              {/* Failed errors (collapsed by default) */}
              {waWebJob.errors?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-red-600 dark:text-red-400 font-medium select-none">
                    ✗ {waWebJob.errors.length} failed — click to expand
                  </summary>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">
                    {waWebJob.errors.map((e, i) => (
                      <p key={i} className="text-red-600 dark:text-red-400">
                        <span className="font-medium">{e.name}</span> · {e.phone}
                        {e.error && <span className="text-red-400"> — {e.error}</span>}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        ); })}
      </div>

      {/* ── Bulk email / WA Meta jobs ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Bulk Send Jobs (Email)</p>
        {allJobsSorted.filter((j) => j.channel === "email").length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 px-5 py-4 text-sm text-slate-400 dark:text-zinc-500">
            No email bulk jobs have run this session.
          </div>
        ) : (
          <div className="space-y-3">
            {allJobsSorted.filter((j) => j.channel === "email").map((job, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${job.status === "running" ? "bg-blue-100 dark:bg-blue-950/40" : "bg-slate-100 dark:bg-zinc-800"}`}>
                      <svg className={`w-4 h-4 ${job.status === "running" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">Bulk Email Send</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500">
                        {new Date(job.startedAt).toLocaleString()}
                        {job.finishedAt && ` · Duration: ${duration(job.startedAt, job.finishedAt)}`}
                      </p>
                    </div>
                  </div>
                  {statusBadge(job.status)}
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1">
                    <span>✓ {job.sent} sent · ✗ {job.failed} failed · {job.total} total</span>
                    <span className="font-medium">{pct(job)}%</span>
                  </div>
                  {progressBar(job, "bg-blue-500")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hint when no jobs at all */}
      {!waAccounts.some((a) => a.job) && allJobsSorted.length === 0 && (
        <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 px-5 py-8 text-center">
          <p className="text-sm text-slate-400 dark:text-zinc-500">No send jobs yet this session.</p>
          <p className="text-xs text-slate-300 dark:text-zinc-600 mt-1">Jobs appear here as soon as you start a send from the Send tab.</p>
        </div>
      )}
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────
function LogsTab({ token, event }) {
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [waTemplates, setWaTemplates]       = useState([]);
  const [waAccounts, setWaAccounts]         = useState([]);
  const [filterAccount, setFilterAccount]   = useState("");
  const [channel, setChannel]               = useState("email");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [logs, setLogs]                     = useState([]);
  const [loading, setLoading]               = useState(false);
  const [page, setPage]                     = useState(1);
  const [pagination, setPagination]         = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    fetch(`${API_URL}/admin/mail/templates?eventId=${event.slug}`, { headers: authHeaders(token) }).then((r) => r.json()).then((d) => setEmailTemplates(d.data || []));
    fetch(`${API_URL}/admin/wa/templates?eventId=${event.slug}`,   { headers: authHeaders(token) }).then((r) => r.json()).then((d) => setWaTemplates(d.data || []));
    fetch(`${API_URL}/admin/events/${event._id}/wa-web/accounts`,  { headers: authHeaders(token) }).then((r) => r.json()).then((d) => setWaAccounts(d.data || []));
  }, [token, event.slug, event._id]);

  const load = useCallback(async (pg) => {
    setLoading(true);
    try {
      const params   = new URLSearchParams({ page: pg, limit: 20, eventId: event.slug });
      if (filterTemplate) params.set(channel === "email" ? "templateId" : "waTemplateId", filterTemplate);
      if (filterStatus)   params.set("status", filterStatus);
      if (channel === "wa" && filterAccount) params.set("accountId", filterAccount);
      const endpoint = channel === "email" ? "mail/logs" : "wa/logs";
      const r        = await fetch(`${API_URL}/admin/${endpoint}?${params}`, { headers: authHeaders(token) });
      const d        = await r.json();
      setLogs(d.data || []);
      setPagination(d.pagination || { total: 0, totalPages: 1 });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token, event.slug, channel, filterTemplate, filterStatus, filterAccount]);

  useEffect(() => { setPage(1); load(1); }, [channel, filterTemplate, filterStatus, filterAccount]);
  useEffect(() => { load(page); }, [page]);

  const tplList     = channel === "email" ? emailTemplates : waTemplates;
  const tplLabelKey = channel === "email" ? "name" : "displayName";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Channel</label>
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1">
            <button onClick={() => { setChannel("email"); setFilterTemplate(""); setFilterAccount(""); }} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${channel === "email" ? "bg-white dark:bg-zinc-900 text-blue-700 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700"}`}>✉ Email</button>
            <button onClick={() => { setChannel("wa");    setFilterTemplate(""); setFilterAccount(""); }} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${channel === "wa"    ? "bg-white dark:bg-zinc-900 text-emerald-700 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700"}`}>💬 WhatsApp</button>
          </div>
        </div>
        <div className="min-w-44">
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Template</label>
          <select value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}
            className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100">
            <option value="">All templates</option>
            {tplList.map((t) => <option key={t._id} value={t._id}>{t[tplLabelKey]}</option>)}
          </select>
        </div>
        {channel === "wa" && (
          <div className="min-w-44">
            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Sent from</label>
            <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
              className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100">
              <option value="">All accounts</option>
              {waAccounts.map((a) => <option key={a._id} value={a._id}>{a.label}{a.phone ? ` · +${a.phone}` : ""}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Status</label>
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1">
            {[{ key: "", label: "All" }, { key: "sent", label: "Sent" }, { key: "failed", label: "Failed" }].map((f) => (
              <button key={f.key} onClick={() => setFilterStatus(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === f.key ? "bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {channel === "email" && (
          <div className="ml-auto">
            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Export</label>
            <button
              onClick={async () => {
                try {
                  const params = new URLSearchParams({ eventId: event.slug });
                  if (filterTemplate) params.set("templateId", filterTemplate);
                  const r = await fetch(`${API_URL}/admin/mail/logs/export.csv?${params}`, { headers: authHeaders(token) });
                  if (!r.ok) { alert("Export failed"); return; }
                  const blob = await r.blob();
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href     = url;
                  a.download = `mail-status-${event.slug}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch { alert("Unable to reach server"); }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors"
            >
              ⬇ Download CSV
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">{channel === "email" ? "Email" : "Phone"}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Template</th>
                {channel === "email" && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Subject</th>}
                {channel === "wa"    && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Sent from</th>}
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-zinc-600 text-sm">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 dark:text-zinc-600 text-sm">No logs found</td></tr>
              ) : logs.map((log) => (
                <tr key={log._id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3.5 text-slate-700 dark:text-zinc-200 whitespace-nowrap">{channel === "email" ? log.email : log.phone}</td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${channel === "email" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {channel === "email" ? log.templateName : log.templateDisplayName}
                    </span>
                  </td>
                  {channel === "email" && <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 hidden md:table-cell max-w-xs truncate">{log.subject}</td>}
                  {channel === "wa"    && <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 hidden md:table-cell whitespace-nowrap">{log.accountLabel ? `${log.accountLabel}${log.accountPhone ? ` · +${log.accountPhone}` : ""}` : "—"}</td>}
                  <td className="px-5 py-3.5">
                    {log.status === "sent"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Sent</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Failed</span>}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 dark:text-zinc-500 text-xs hidden md:table-cell whitespace-nowrap">{new Date(log.sentAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 px-5 py-3.5 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-zinc-500">Page {page} of {pagination.totalPages} · {pagination.total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page===1||loading} className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p+1))} disabled={page===pagination.totalPages||loading} className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main CommsDashboard ───────────────────────────────────────────────────────
const TABS = ["Send", "Import CSV", "Email Templates", "WA Templates", "Status", "Logs", "Settings"];

export default function CommsDashboard({ token, event, onBack, onLogout, dark, toggleDark }) {
  const [activeTab, setActiveTab] = useState(0);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 transition-colors">
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center hover:bg-slate-50 dark:bg-zinc-800 transition-colors">
            <svg className="w-4 h-4 text-slate-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">{event.name}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">Communications</span>
            </div>
            {event.location && <p className="text-xs text-slate-400 dark:text-zinc-500">{event.location}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle dark={dark} toggleDark={toggleDark}/>
          <button onClick={onLogout} className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">Sign out</button>
        </div>
      </header>
      <div className="border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6">
        <div className="flex gap-1 max-w-7xl mx-auto overflow-x-auto">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === i ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:text-zinc-200"}`}>
              {tab}
              {/* Live pulse dot on Status tab — always shown so user knows it exists */}
              {tab === "Status" && activeTab !== i && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 opacity-70"/>
              )}
            </button>
          ))}
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 0 && <SendTab          token={token} event={event}/>}
        {activeTab === 1 && <ImportTab        token={token} event={event}/>}
        {activeTab === 2 && <MailTemplatesTab token={token} event={event}/>}
        {activeTab === 3 && <WaTemplatesTab   token={token} event={event}/>}
        {activeTab === 4 && <StatusTab        token={token} event={event}/>}
        {activeTab === 5 && <LogsTab          token={token} event={event}/>}
        {activeTab === 6 && <SettingsTab      token={token} event={event}/>}
      </main>
    </div>
  );
}
