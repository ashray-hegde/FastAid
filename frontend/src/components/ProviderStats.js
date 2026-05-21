import { useEffect, useState } from "react";
import api from "../api";

export default function ProviderStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

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

  if (loading) {
    return (
      <div className="provider-stats loading">
        <div className="stat-card-skeleton"></div>
        <div className="stat-card-skeleton"></div>
        <div className="stat-card-skeleton"></div>
        <div className="stat-card-skeleton"></div>
        <div className="stat-card-skeleton"></div>
        <div className="stat-card-skeleton"></div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const statCards = [
    {
      icon: "✅",
      label: "Total Orders",
      value: stats.totalOrdersCompleted,
      color: "primary"
    },
    {
      icon: "💰",
      label: "Total Tips",
      value: `₹${stats.totalTipsReceived}`,
      color: "success"
    },
    {
      icon: "🎁",
      label: "Highest Tip",
      value: `₹${stats.highestTipReceived}`,
      color: "warning"
    },
    {
      icon: "⭐",
      label: "Highest Rating",
      value: stats.highestRatingReceived.toFixed(1),
      color: "secondary"
    },
    {
      icon: "📊",
      label: "Avg Rating",
      value: stats.averageRating.toFixed(1),
      color: "primary"
    }
  ];

  return (
    <div className="provider-stats">
      {statCards.map((card, idx) => (
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
