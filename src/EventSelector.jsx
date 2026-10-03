import { useState, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── New / Edit Event Modal ───────────────────────────────────────────────────
function EventModal({ token, event, onClose, onSaved }) {
  const isEdit = !!event;
  const [form, setForm] = useState({
    name:     event?.name     || "",
    location: event?.location || "",
    date:     event?.date ? new Date(event.date).toISOString().split("T")[0] : "",
    isActive: event?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Event name is required"); return; }
    setSaving(true);
    try {
      const url    = isEdit ? `${API_URL}/admin/events/${event._id}` : `${API_URL}/admin/events`;
      const method = isEdit ? "PUT" : "POST";
      const body   = isEdit
        ? { name: form.name.trim(), location: form.location.trim(), date: form.date || null, isActive: form.isActive }
        : { name: form.name.trim(), slug: toSlug(form.name.trim()), location: form.location.trim(), date: form.date || null };

      const res  = await fetch(url, { method, headers: authHeaders(token), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to save event"); return; }
      onSaved(data.data, isEdit);
    } catch { setError("Unable to reach server"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-zinc-100">{isEdit ? "Edit Event" : "New Event"}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
          {[
            { name: "name",     label: "Event Name *", placeholder: "e.g. Hyderabad Event 2026", type: "text"  },
            { name: "location", label: "Location",      placeholder: "e.g. Hyderabad, Telangana",  type: "text"  },
            { name: "date",     label: "Date",          placeholder: "",                            type: "date"  },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">{f.label}</label>
              <input name={f.name} type={f.type} value={form[f.name]} onChange={handleChange} placeholder={f.placeholder}
                className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 placeholder-slate-300 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
            </div>
          ))}
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="rounded" />
              <span className="text-sm text-slate-700 dark:text-zinc-200">Active</span>
            </label>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl flex items-center gap-2">
              {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteEventModal({ token, event, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/events/${event._id}`, {
        method: "DELETE", headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Delete failed"); return; }
      onDeleted(event._id);
    } catch { setError("Unable to reach server"); }
    finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-zinc-100">Delete "{event.name}"?</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">This will permanently delete the event and all its attendees, logs, and data. This cannot be undone.</p>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={deleting}
              className="px-5 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl flex items-center gap-2">
              {deleting && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
              {deleting ? "Deleting…" : "Delete Everything"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main EventSelector ────────────────────────────────────────────────────────
export default function EventSelector({ token, onSelect, onLogout, dark, toggleDark }) {
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [modal,      setModal]      = useState(null); // null | { type:"new"|"edit"|"delete", event? }

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/admin/events`, { headers: authHeaders(token) });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setEvents(data.data || []);
    } catch { setError("Unable to reach server"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadEvents(); }, []);

  const handleSaved = (savedEvent, isEdit) => {
    if (isEdit) {
      setEvents((prev) => prev.map((e) => e._id === savedEvent._id ? savedEvent : e));
    } else {
      setEvents((prev) => [savedEvent, ...prev]);
    }
    setModal(null);
  };

  const handleDeleted = (deletedId) => {
    setEvents((prev) => prev.filter((e) => e._id !== deletedId));
    setModal(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 transition-colors">
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <span className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">KP Communications</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle dark={dark} toggleDark={toggleDark} />
          <button onClick={onLogout} className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors">Sign out</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100">Select an Event</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">Choose an event to manage, then pick your dashboard.</p>
          </div>
          <button onClick={() => setModal({ type: "new" })}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            New Event
          </button>
        </div>

        {error && <div className="mb-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl px-4 py-3">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <svg className="w-6 h-6 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24 text-slate-400 dark:text-zinc-600">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p className="text-sm">No events yet. Create your first event to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <div key={event._id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm p-6 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-md transition-all">
                {/* Header row with edit/delete */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-slate-800 dark:text-zinc-100 text-base">{event.name}</h2>
                      {!event.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-zinc-500">
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                          </svg>
                          {event.location}
                        </span>
                      )}
                      {event.date && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                          {new Date(event.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Edit / Delete buttons */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => setModal({ type: "edit", event })}
                      title="Edit event"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button onClick={() => setModal({ type: "delete", event })}
                      title="Delete event"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Dashboard buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onSelect(event, "eventday")}
                    className="flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors">
                    <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Event Day</span>
                    <span className="text-xs text-emerald-500 dark:text-emerald-600 text-center leading-tight">Check-in &amp; attendance</span>
                  </button>
                  <button onClick={() => onSelect(event, "comms")}
                    className="flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 border-indigo-100 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors">
                    <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Communications</span>
                    <span className="text-xs text-indigo-500 dark:text-indigo-600 text-center leading-tight">Email &amp; WhatsApp</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal?.type === "new" && (
        <EventModal token={token} event={null} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === "edit" && (
        <EventModal token={token} event={modal.event} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === "delete" && (
        <DeleteEventModal token={token} event={modal.event} onClose={() => setModal(null)} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
