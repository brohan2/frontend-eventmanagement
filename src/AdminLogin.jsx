import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AdminLogin({ onLogin, dark, toggleDark }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError("Both fields are required"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Invalid credentials"); return; }
      localStorage.setItem("admin_token", data.token);
      onLogin(data.token);
    } catch {
      setError("Unable to reach server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 flex items-center justify-center px-4 transition-colors">
      {/* Theme toggle top-right */}
      <div className="fixed top-4 right-4">
        <ThemeToggle dark={dark} toggleDark={toggleDark} />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md dark:shadow-zinc-950 p-8 w-full max-w-sm border border-transparent dark:border-zinc-800">
        <div className="mb-7">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.657-1.343-3-3-3S6 9.343 6 11m6 0c0-1.657 1.343-3 3-3s3 1.343 3 3m-6 0v1m0 4h.01M5.05 19A9 9 0 1119 5.05" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-zinc-100">Admin Login</h1>
          <p className="text-slate-400 dark:text-zinc-500 text-sm mt-0.5">Event management dashboard</p>
        </div>

        {error && (
          <div className="mb-5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-xl px-4 py-2.5">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Email</label>
            <input
              name="email" type="email" autoComplete="email" placeholder="admin@example.com"
              value={form.email} onChange={handleChange} disabled={loading}
              className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-800 placeholder-slate-300 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">Password</label>
            <input
              name="password" type="password" autoComplete="current-password" placeholder="••••••••"
              value={form.password} onChange={handleChange} disabled={loading}
              className="w-full border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-800 placeholder-slate-300 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 transition-colors"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full mt-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Signing in…
              </>
            ) : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
