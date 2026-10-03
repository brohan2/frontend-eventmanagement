import { useState, useEffect, useCallback, useRef } from "react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";
import ThemeToggle from "./ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const LIMIT = 50;

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function Badge({ on, onLabel, offLabel }) {
  return on ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{onLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-600" />{offLabel}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4">
      <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value ?? "—"}</p>
    </div>
  );
}

// Server-side filter keys
const FILTER_OPTIONS = [
  { key: "all",          label: "All",           query: {} },
  { key: "checkedIn",    label: "Checked In",    query: { checkedIn: "true" } },
  { key: "notCheckedIn", label: "Not Checked In", query: { checkedIn: "false" } },
  { key: "blocked",      label: "Blocked",        query: { blocked: "true" } },
];

const TABS = ["Attendees", "QR Scanner", "Import CSV"];

// ── Import CSV Tab ────────────────────────────────────────────────────────────
function ImportTab({ token, event }) {
  const [file,    setFile]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setResult(null); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch(`${API_URL}/admin/import?eventId=${encodeURIComponent(event.slug)}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
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
          onClick={() => document.getElementById("csv-input-ed").click()}>
          <svg className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
          </svg>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{file ? file.name : "Click to select CSV file"}</p>
          <input id="csv-input-ed" type="file" accept=".csv" className="hidden" onChange={(e) => { setFile(e.target.files[0]); setResult(null); }}/>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
        {result && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-xl px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Import complete</p>
            <p className="text-slate-600 dark:text-zinc-300">Inserted: <strong>{result.inserted}</strong> · Skipped: <strong>{result.skipped}</strong> · Failed: <strong>{result.failed}</strong></p>
          </div>
        )}
        <button onClick={handleUpload} disabled={!file || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl py-2.5 flex items-center justify-center gap-2">
          {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
          {loading ? "Importing…" : "Import CSV"}
        </button>
      </div>
    </div>
  );
}

// ── QR Scanner Tab ────────────────────────────────────────────────────────────
function QrScannerTab({ token, event }) {
  const scannerRef   = useRef(null);
  const instanceRef  = useRef(null);
  const [scanning,   setScanning]   = useState(false);
  const [result,     setResult]     = useState(null);   // { user, action }
  const [error,      setError]      = useState("");
  const [actionMsg,  setActionMsg]  = useState("");
  const [processing, setProcessing] = useState(false);

  // Mount / unmount scanner
  useEffect(() => {
    return () => {
      if (instanceRef.current) {
        instanceRef.current.clear().catch(() => {});
        instanceRef.current = null;
      }
    };
  }, []);

  const startScanner = () => {
    setError(""); setResult(null); setActionMsg("");
    if (!scannerRef.current) return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        rememberLastUsedCamera: true,
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        // Stop scanning immediately after first decode
        await scanner.clear().catch(() => {});
        instanceRef.current = null;
        setScanning(false);
        await handleScan(decodedText);
      },
      (err) => {
        // Ignore per-frame errors (camera looking for QR)
        if (!err?.toString().includes("No MultiFormat")) {
          console.debug("[QR]", err);
        }
      }
    );

    instanceRef.current = scanner;
    setScanning(true);
  };

  const stopScanner = async () => {
    if (instanceRef.current) {
      await instanceRef.current.clear().catch(() => {});
      instanceRef.current = null;
    }
    setScanning(false);
  };

  const handleScan = async (rawValue) => {
    setProcessing(true); setError(""); setResult(null); setActionMsg("");
    try {
      // The QR payload is a JWT — look it up via the server
      // First decode the JWT to extract ticketId (it's a public lookup, not sensitive)
      let ticketId = rawValue;
      try {
        const parts = rawValue.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (payload.ticketId) ticketId = payload.ticketId;
        }
      } catch { /* rawValue might already be a plain ticketId */ }

      // Look up the user
      const lookupRes  = await fetch(`${API_URL}/admin/checkin/${encodeURIComponent(ticketId)}`, {
        headers: authHeaders(token),
      });
      const lookupData = await lookupRes.json();

      if (!lookupRes.ok || !lookupData.success) {
        setError(lookupData.message || "Ticket not found");
        setProcessing(false);
        return;
      }

      const user = lookupData.data;

      if (user.blocked) {
        setError(`⛔ ${user.name} is blocked and cannot check in.`);
        setProcessing(false);
        return;
      }

      // Make sure this is the right event
      if (user.eventId !== event.slug) {
        setError(`⚠️ This ticket belongs to a different event (${user.eventId}).`);
        setProcessing(false);
        return;
      }

      setResult({ user, alreadyCheckedIn: user.checkedIn });

      if (!user.checkedIn) {
        // Auto check-in
        await performCheckIn(user.ticketId, true);
      }
    } catch {
      setError("Unable to reach server. Check your connection.");
    } finally {
      setProcessing(false);
    }
  };

  const performCheckIn = async (ticketId, checkedIn) => {
    setProcessing(true); setActionMsg("");
    try {
      const res  = await fetch(`${API_URL}/admin/checkin`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ ticketId, checkedIn }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Check-in failed");
        return;
      }
      setResult((prev) => prev ? { ...prev, user: data.data, alreadyCheckedIn: !checkedIn } : null);
      setActionMsg(checkedIn ? "✅ Checked in!" : "↩️ Check-in reversed.");
    } catch {
      setError("Unable to reach server.");
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setResult(null); setError(""); setActionMsg(""); setScanning(false);
    if (instanceRef.current) {
      instanceRef.current.clear().catch(() => {});
      instanceRef.current = null;
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-zinc-100">QR Check-in Scanner</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Scan a ticket QR code to check in attendees for <strong className="text-slate-700 dark:text-zinc-200">{event.name}</strong>.
          </p>
        </div>

        {/* Scanner viewport */}
        {!result && !error && (
          <div>
            <div id="qr-reader" className={scanning ? "rounded-xl overflow-hidden" : "hidden"} />
            {!scanning && (
              <div className="border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-xl p-10 text-center">
                <svg className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 18.75h.75v.75h-.75v-.75zM18.75 13.5h.75v.75h-.75v-.75zM18.75 18.75h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"/>
                </svg>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Camera is off. Click Start to scan a ticket.</p>
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        {processing && (
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
            Looking up ticket…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Success result card */}
        {result && (
          <div className={`rounded-xl border px-5 py-4 space-y-3 ${
            result.alreadyCheckedIn
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900"
              : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                result.alreadyCheckedIn ? "bg-amber-100 dark:bg-amber-900/40" : "bg-emerald-100 dark:bg-emerald-900/40"
              }`}>
                {result.alreadyCheckedIn
                  ? <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  : <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                }
              </div>
              <div>
                <p className={`font-semibold text-sm ${result.alreadyCheckedIn ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
                  {result.alreadyCheckedIn ? "Already checked in" : "Checked in!"}
                </p>
                {actionMsg && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{actionMsg}</p>}
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p className="font-medium text-slate-800 dark:text-zinc-100">{result.user.name}</p>
              <p className="text-slate-500 dark:text-zinc-400">{result.user.email}</p>
              {result.user.phone && <p className="text-slate-500 dark:text-zinc-400">{result.user.phone}</p>}
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-mono mt-1">{result.user.ticketId}</p>
            </div>
            {/* Undo check-in if already checked in, or reverse if just done */}
            {result.alreadyCheckedIn && (
              <button
                onClick={() => performCheckIn(result.user.ticketId, !result.user.checkedIn)}
                disabled={processing}
                className="text-xs px-3 py-1.5 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50">
                {result.user.checkedIn ? "Reverse check-in" : "Mark checked in"}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {!scanning && !result && !processing && (
            <button onClick={startScanner}
              className="px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
              </svg>
              Start Scanner
            </button>
          )}
          {scanning && (
            <button onClick={stopScanner}
              className="px-5 py-2.5 text-sm border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors font-medium">
              Stop Camera
            </button>
          )}
          {(result || error) && (
            <button onClick={reset}
              className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9"/>
              </svg>
              Scan Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Attendees Tab ─────────────────────────────────────────────────────────────
function AttendeesTab({ token, event, onLogout }) {
  const [users,       setUsers]       = useState([]);
  const [stats,       setStats]       = useState({ total: 0, checkedIn: 0, blocked: 0 });
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, totalPages: 1 });
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [actionError, setActionError] = useState(""); // inline error for block/delete
  const [blockingId,  setBlockingId]  = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const searchTimeout = useRef(null);

  const fetchUsers = useCallback(async (pg, q, activeFilter) => {
    setLoading(true); setError(""); setActionError("");
    try {
      const filterOption = FILTER_OPTIONS.find((f) => f.key === activeFilter) || FILTER_OPTIONS[0];
      const params = new URLSearchParams({ page: pg, limit: LIMIT, eventId: event.slug, ...filterOption.query });
      if (q) params.set("search", q);
      const res  = await fetch(`${API_URL}/admin/users?${params}`, { headers: authHeaders(token) });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to load attendees"); return; }
      setUsers(data.data);
      setStats(data.stats || { total: 0, checkedIn: 0, blocked: 0 });
      setPagination(data.pagination);
    } catch { setError("Unable to reach server"); }
    finally { setLoading(false); }
  }, [token, event.slug, onLogout]);

  useEffect(() => { fetchUsers(1, "", "all"); }, [fetchUsers]);

  const handleSearchChange = (e) => {
    const val = e.target.value; setSearch(val); setPage(1);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchUsers(1, val, filter), 350);
  };

  const handleFilterChange = (key) => {
    setFilter(key); setPage(1);
    fetchUsers(1, search, key);
  };

  const toggleBlock = async (user) => {
    setBlockingId(user.ticketId); setActionError("");
    try {
      const res  = await fetch(`${API_URL}/admin/block`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ ticketId: user.ticketId, blocked: !user.blocked }),
      });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setActionError(data.message || "Action failed"); return; }
      setUsers((prev) => prev.map((u) => u.ticketId === user.ticketId ? { ...u, blocked: !u.blocked } : u));
    } catch { setActionError("Unable to reach server"); }
    finally { setBlockingId(null); }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete ${user.name}? This will remove the user and all their logs.`)) return;
    setDeletingId(user.ticketId); setActionError("");
    try {
      const res  = await fetch(`${API_URL}/admin/users/${encodeURIComponent(user.ticketId)}`, {
        method: "DELETE", headers: authHeaders(token),
      });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setActionError(data.message || "Delete failed"); return; }
      setUsers((prev) => prev.filter((u) => u.ticketId !== user.ticketId));
      setStats((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch { setActionError("Unable to reach server"); }
    finally { setDeletingId(null); }
  };

  const checkedInPct = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Registered"  value={stats.total}                          accent="text-slate-800 dark:text-zinc-100" />
        <StatCard label="Checked In"        value={stats.checkedIn}                      accent="text-emerald-600" />
        <StatCard label="Not Checked In"    value={stats.total - stats.checkedIn}        accent="text-amber-500" />
        <StatCard label="Blocked"           value={stats.blocked}                        accent="text-red-500" />
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-100 dark:border-zinc-800 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Check-in Progress</span>
            <span className="text-sm font-semibold text-emerald-600">{checkedInPct}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2.5">
            <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${checkedInPct}%` }}/>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input type="text" placeholder="Search name, email, phone…" value={search} onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 placeholder-slate-300 dark:placeholder-zinc-600 transition-colors"/>
        </div>
        <button onClick={() => fetchUsers(page, search, filter)} disabled={loading}
          className="px-4 py-2.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 disabled:opacity-50 flex items-center gap-2 transition-colors">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Server-side filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 w-fit">
        {FILTER_OPTIONS.map((f) => (
          <button key={f.key} onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Inline errors */}
      {error       && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3">{error}</div>}
      {actionError && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3">{actionError}</div>}

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Check-in</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800">
              {loading && users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-400 dark:text-zinc-600 text-sm">
                  <svg className="w-5 h-5 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Loading…
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-400 dark:text-zinc-600 text-sm">No attendees found</td></tr>
              ) : users.map((user) => (
                <tr key={user.ticketId} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-zinc-100 whitespace-nowrap">{user.name}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{user.email}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap hidden sm:table-cell">{user.phone}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap hidden md:table-cell">{user.location || "—"}</td>
                  <td className="px-4 py-3.5"><Badge on={user.checkedIn} onLabel="Checked In" offLabel="Pending"/></td>
                  <td className="px-4 py-3.5">
                    {user.blocked
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Blocked</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Active</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggleBlock(user)} disabled={blockingId === user.ticketId || deletingId === user.ticketId}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${user.blocked ? "border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"}`}>
                        {blockingId === user.ticketId ? "…" : user.blocked ? "Unblock" : "Block"}
                      </button>
                      <button onClick={() => handleDelete(user)} disabled={deletingId === user.ticketId || blockingId === user.ticketId}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50">
                        {deletingId === user.ticketId ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 px-5 py-3.5 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-zinc-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</p>
            <div className="flex gap-2">
              <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchUsers(p, search, filter); }} disabled={page === 1 || loading}
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Previous</button>
              <button onClick={() => { const p = Math.min(pagination.totalPages, page + 1); setPage(p); fetchUsers(p, search, filter); }} disabled={page === pagination.totalPages || loading}
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main EventDayDashboard ─────────────────────────────────────────────────────
export default function EventDayDashboard({ token, event, onBack, onLogout, dark, toggleDark }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 transition-colors">
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
            <svg className="w-4 h-4 text-slate-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">{event.name}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">Event Day</span>
            </div>
            {event.location && <p className="text-xs text-slate-400 dark:text-zinc-500">{event.location}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle dark={dark} toggleDark={toggleDark} />
          <button onClick={onLogout} className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">Sign out</button>
        </div>
      </header>

      <div className="border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6">
        <div className="flex gap-1 max-w-7xl mx-auto">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === i ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 0 && <AttendeesTab token={token} event={event} onLogout={onLogout} />}
        {activeTab === 1 && <QrScannerTab token={token} event={event} />}
        {activeTab === 2 && <ImportTab   token={token} event={event} />}
      </main>
    </div>
  );
}
