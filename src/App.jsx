import { useState, useEffect } from "react";
import AdminLogin from "./AdminLogin";
import EventSelector from "./EventSelector";
import EventDayDashboard from "./EventDayDashboard";
import CommsDashboard from "./CommsDashboard";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token") || "");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dashboardMode, setDashboardMode] = useState(null);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken(""); setSelectedEvent(null); setDashboardMode(null);
  };

  const handleSelectEvent = (event, mode) => { setSelectedEvent(event); setDashboardMode(mode); };
  const handleBack = () => { setSelectedEvent(null); setDashboardMode(null); };

  if (!token) return <AdminLogin onLogin={(t) => setToken(t)} dark={dark} toggleDark={toggleDark} />;

  if (!selectedEvent || !dashboardMode) {
    return <EventSelector token={token} onSelect={handleSelectEvent} onLogout={handleLogout} dark={dark} toggleDark={toggleDark} />;
  }

  if (dashboardMode === "eventday") {
    return <EventDayDashboard token={token} event={selectedEvent} onBack={handleBack} onLogout={handleLogout} dark={dark} toggleDark={toggleDark} />;
  }

  return <CommsDashboard token={token} event={selectedEvent} onBack={handleBack} onLogout={handleLogout} dark={dark} toggleDark={toggleDark} />;
}
