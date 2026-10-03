export default function ThemeToggle({ dark, toggleDark }) {
  return (
    <button
      onClick={toggleDark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors
        border border-slate-200 dark:border-zinc-700
        bg-white dark:bg-zinc-800
        text-slate-500 dark:text-zinc-400
        hover:bg-slate-100 dark:hover:bg-zinc-700"
    >
      {dark ? (
        // Sun icon
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        // Moon icon
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}
