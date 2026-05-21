import { useEffect, useState } from "react";
import api from "../api";
import socket from "../socket";
import { useToast } from "../context/ToastContext";
import Skeleton from "../components/Skeleton";
import ProviderStats from "../components/ProviderStats";
import { useProviderLocation } from "../hooks/useProviderLocation";
import "../components/skeleton.css";
import "../styles/dashboard.css";

export default function ProviderDashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("current");

  const { addToast } = useToast();
  const token = localStorage.getItem("token");
  const [processing, setProcessing] = useState({});

  // Enable geolocation tracking for providers
  useProviderLocation();

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await api.get("/bookings/provider-bookings");
      const bookingsData = res.data || [];
      setBookings(bookingsData);
      const current = bookingsData.find((booking) =>
        ["accepted", "on_the_way", "started"].includes(booking.status)
      );
      if (current) {
        setActiveSession(current);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error(err);
      addToast("Unable to load bookings", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get("/bookings/provider-history");
      setHistory(res.data || []);
    } catch (err) {
      console.error("Unable to load provider history", err);
    }
  };

  useEffect(() => {
    if (token) {
      socket.emit("register", { token });
    }

    fetchBookings();
    fetchHistory();

    socket.on("booking-created", (data) => {
      addToast(`New Booking: ${data.booking?.serviceName || "Request"}`, "success");
      fetchBookings();
      fetchHistory();
    });

    socket.on("booking-update", () => {
      fetchBookings();
      fetchHistory();
    });

    return () => {
      socket.off("booking-created");
      socket.off("booking-update");
    };
  }, []);

  const providerAction = async (bookingId, action) => {
    if (!bookingId || !action) {
      addToast("Invalid booking or action", "error");
      return;
    }

    if (processing[bookingId]) return;

    setProcessing((p) => ({ ...p, [bookingId]: true }));

    try {
      const response = await api.put(`/bookings/provider-action/${bookingId}`, {
        action: action.toLowerCase()
      });

      if (!response || !response.data) {
        throw new Error("Invalid server response");
      }

      const { success, booking, error } = response.data;

      if (!success) {
        throw new Error(error || `Failed to ${action} booking`);
      }

      if (action.toLowerCase() === "reject") {
        setBookings((prev) => prev.filter((b) => b._id !== bookingId));
        if (activeSession?._id === bookingId) setActiveSession(null);
        addToast("Booking rejected successfully ✓", "success");
      } else if (action.toLowerCase() === "accept") {
        setActiveSession(booking || null);
        setBookings((prev) => prev.map((b) => (b._id === bookingId ? booking : b)));
        addToast("Booking accepted successfully ✓", "success");
      }

      await fetchBookings();
      await fetchHistory();
    } catch (err) {
      console.error("Provider action error:", err);
      const errorMsg = err.response?.data?.error || err.message || "Action failed. Please try again.";
      addToast(errorMsg, "error");
    } finally {
      setProcessing((p) => ({ ...p, [bookingId]: false }));
    }
  };

  const completeWork = async (bookingId) => {
    try {
      await api.put(`/bookings/complete/${bookingId}`);
      addToast("Marked work as completed", "success");
      setBookings((prev) => prev.filter((b) => b._id !== bookingId));
      setActiveSession(null);
      fetchHistory();
    } catch (err) {
      console.error(err);
      addToast("Unable to mark completed", "error");
    }
  };

  const requestBookings = bookings.filter(
    (booking) => booking.status === "pending" || booking.status === "assigned"
  );

  const currentSession =
    activeSession ||
    bookings.find((booking) =>
      ["accepted", "on_the_way", "started"].includes(booking.status)
    );

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <h1 className="dashboard-title">Provider Dashboard 🛠️</h1>
        <p className="dashboard-subtitle">Manage your service requests</p>

        <ProviderStats />

        <div className="provider-nav-tabs">
          {[
            { key: 'current', label: 'Current Service' },
            { key: 'requests', label: 'All Requested Services' },
            { key: 'history', label: 'History' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="section-gap">
            <Skeleton count={4} height="100px" />
          </div>
        ) : activeTab === 'current' ? (
          <div className="section-gap">
            {currentSession ? (
              <div className="booking-card current-service-card">
                <h2>Current Active Service</h2>
                <p>🛠️ {currentSession.serviceName}</p>
                <p>👤 Customer: {currentSession.userId?.name || 'Customer'}</p>
                <p>📍 Location: {currentSession.location || currentSession.locationDetails?.fullAddress}</p>
                <p>💰 Amount: ₹{currentSession.servicePrice}</p>
                <p>📌 Status: <strong>{currentSession.status}</strong></p>
                <div className="booking-actions">
                  <button onClick={() => completeWork(currentSession._id)} disabled={processing[currentSession._id]} className="btn btn-primary">
                    {processing[currentSession._id] ? "Processing..." : "Mark Work Completed"}
                  </button>
                  <button onClick={() => setActiveSession(null)} className="btn btn-secondary">
                    Close Session View
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-requests section-gap">
                <div className="no-requests-icon">📌</div>
                <div className="no-requests-text">No current active service in this session.</div>
              </div>
            )}
          </div>
        ) : activeTab === 'requests' ? (
          <div className="section-gap">
            {requestBookings.length > 0 ? (
              requestBookings.map((booking) => (
                <div key={booking._id} className="booking-card">
                  <h2>🛠️ {booking.serviceName}</h2>
                  <p>👤 Customer: {booking.userId?.name || 'Customer'}</p>
                  <p>📍 Location: {booking.location || booking.locationDetails?.fullAddress}</p>
                  <p>💰 Amount: ₹{booking.servicePrice}</p>
                  <p>📌 Status: <strong>{booking.status}</strong></p>
                  <div className="booking-actions">
                    <button type="button" onClick={() => providerAction(booking._id, 'accept')} disabled={processing[booking._id]} className="btn btn-primary">
                      {processing[booking._id] ? 'Processing...' : 'Accept'}
                    </button>
                    <button type="button" onClick={() => providerAction(booking._id, 'reject')} disabled={processing[booking._id]} className="btn btn-danger">
                      {processing[booking._id] ? 'Processing...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state section-gap">
                <div className="empty-state-icon">🔔</div>
                <h3>No requested services</h3>
                <p>New service requests will appear here when available.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="section-gap">
            <section className="provider-history-section">
              <h3>Completed Service History</h3>
              {history.length === 0 ? (
                <div className="empty-state section-gap">
                  <div className="empty-state-icon">📜</div>
                  <h3>No completed history yet</h3>
                  <p>Complete a service to see your provider history here.</p>
                </div>
              ) : (
                <div className="provider-history-list">
                  {history.map((entry) => (
                    <div key={entry._id} className="provider-history-card">
                      <div className="provider-history-row">
                        <div className="provider-history-summary">
                          <h4>{entry.serviceName || entry.bookingId?.serviceName}</h4>
                          <p>Customer: {entry.userId?.name || entry.bookingId?.userId?.name || 'Customer'}</p>
                          <p>Email: {entry.userId?.email || entry.bookingId?.userId?.email || '—'}</p>
                          <p>Amount: ₹{entry.amount || entry.bookingId?.servicePrice || '—'}</p>
                        </div>
                        <div className="provider-history-meta">
                          <p className="meta-date">Completed {new Date(entry.completedAt).toLocaleString()}</p>
                          <p>Tip: ₹{entry.tipGiven ?? 0}</p>
                          <p className={entry.rating ? 'meta-rating' : 'meta-rating none'}>{entry.rating ? `Rating: ${entry.rating} ⭐` : 'No rating yet'}</p>
                        </div>
                      </div>
                      {entry.bookingId?.location && (
                        <p className="provider-history-location">Service address: {entry.bookingId.location || entry.bookingId.locationDetails?.fullAddress}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
