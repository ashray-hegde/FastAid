import { useEffect, useState } from "react";
import api from "../api";
import getSocket from "../socket";

export default function ProviderStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await api.get("/auth/provider-stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch provider stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    const socket = getSocket();
    const refreshHandler = () => {
      fetchStats();
    };

    socket.on("booking-update", refreshHandler);
    socket.on("booking-created", refreshHandler);

    return () => {
      socket.off("booking-update", refreshHandler);
      socket.off("booking-created", refreshHandler);
    };
  }, []);

  if (loading) {
    return (
      <div className="provider-stats loading">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="stat-card-skeleton" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = [
    { icon: "✅", label: "Completed", value: stats.completedOrders || 0, color: "primary" },
    { icon: "⏳", label: "Pending", value: stats.pendingOrders || 0, color: "secondary" },
    { icon: "❌", label: "Cancelled", value: stats.cancelledOrders || 0, color: "warning" },
    { icon: "💰", label: "Total Earnings", value: `₹${stats.totalEarnings || 0}`, color: "success" },
    { icon: "📅", label: "Today Earnings", value: `₹${stats.todayEarnings || 0}`, color: "primary" },
    { icon: "🗓️", label: "Weekly Earnings", value: `₹${stats.weeklyEarnings || 0}`, color: "secondary" },
    { icon: "🎁", label: "Total Tips", value: `₹${stats.totalTips || 0}`, color: "success" },
    { icon: "🏆", label: "Highest Tip", value: `₹${stats.highestTip || 0}`, color: "warning" },
    { icon: "⭐", label: "Avg Rating", value: Number(stats.averageRating || 0).toFixed(1), color: "primary" },
    { icon: "🌟", label: "Highest Rating", value: Number(stats.highestRating || 0).toFixed(1), color: "secondary" },
    { icon: "🚦", label: "Active Bookings", value: stats.activeBookings || 0, color: "primary" },
    { icon: "📦", label: "Total Orders", value: stats.totalOrders || 0, color: "secondary" }
  ];

  return (
    <div className="provider-stats">
      {cards.map((card, idx) => (
        <div key={idx} className={`stat-card stat-${card.color}`}>
          <div className="stat-icon">{card.icon}</div>
          <div className="stat-content">
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
