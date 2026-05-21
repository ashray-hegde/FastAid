import { useState, useEffect } from "react";
import api from "../api";
import { useToast } from "../context/ToastContext";
import Skeleton from "../components/Skeleton";
import "../components/skeleton.css";
import "../styles/dashboard.css";

export default function AdminDashboard() {
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState({ upiIds: [], qrCodes: [], bankAccounts: [], cardSupported: true, codSupported: true });
  const [qrFile, setQrFile] = useState(null);
  const [qrReplaceFiles, setQrReplaceFiles] = useState({});
  const [newService, setNewService] = useState({ name: "", category: "", rating: 0 });
  const [activeTab, setActiveTab] = useState("services");

  useEffect(() => {
    loadData();
  }, []);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const [processing, setProcessing] = useState({});

  const loadData = async () => {

  try {

    setLoading(true);

    // =====================================
    // SERVICES
    // =====================================

    try {

      const servicesRes =
        await api.get("/services");

      setServices(
        servicesRes.data || []
      );

    } catch (err) {

      console.log(
        "Services API failed"
      );

      setServices([]);

    }

    // =====================================
    // BOOKINGS
    // =====================================

    try {

      const bookingsRes =
        await api.get("/bookings");

      setBookings(
        bookingsRes.data || []
      );

    } catch (err) {

      console.log(
        "Bookings API failed"
      );

      setBookings([]);

    }

    // =====================================
    // USERS
    // =====================================

    try {

      const usersRes =
        await api.get("/auth/users");

      setUsers(
        usersRes.data || []
      );

    } catch (err) {

      console.log(
        "Users API failed"
      );

      setUsers([]);

    }

    // =====================================
    // PROVIDERS
    // =====================================

    try {

      const providersRes =
        await api.get(
          "/auth/providers"
        );

      setProviders(
        providersRes.data || []
      );

    } catch (err) {

      console.log(
        "Providers API failed"
      );

      setProviders([]);

    }

    // =====================================
    // PAYMENT CONFIG
    // =====================================

    try {

      const paymentRes =
        await api.get(
          "/admin-payments/config"
        );

      setPaymentConfig({

        upiIds:
          paymentRes.data?.upiIds || [],

        qrCodes:
          paymentRes.data?.qrCodes || [],

        bankAccounts:
          paymentRes.data?.bankAccounts || [],

        cardSupported:
          paymentRes.data?.cardSupported ?? true,

        codSupported:
          paymentRes.data?.codSupported ?? true

      });

    } catch (err) {

      console.log(
        "Payment config API failed"
      );

    }

  } catch (err) {

    console.log(err);

    addToast(
      "Failed loading admin data",
      "error"
    );

  } finally {

    setLoading(false);

  }

};

  const handleAddService = async (e) => {
    e.preventDefault();
    try {
      await api.post("/services", newService);
      addToast("Service added successfully!", "success");
      setNewService({ name: "", category: "", rating: 0 });
      loadData();
    } catch (err) {
      addToast("Failed to add service", "error");
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!serviceId) return;
    if (processing[serviceId]) return;
    setProcessing((p) => ({ ...p, [serviceId]: true }));
    try {
      await api.delete(`/services/${serviceId}`);
      addToast("Service deleted successfully!", "success");
      await loadData();
    } catch (err) {
      addToast("Failed to delete service", "error");
    } finally {
      setProcessing((p) => ({ ...p, [serviceId]: false }));
    }
  };

  const handleVerifyProvider = async (providerId) => {
    if (!providerId) return;
    if (processing[providerId]) return;
    setProcessing((p) => ({ ...p, [providerId]: true }));
    try {
      await api.put(`/auth/verify-provider/${providerId}`, { verified: true });
      addToast("Provider verified successfully!", "success");
      await loadData();
    } catch (err) {
      addToast("Failed to verify provider", "error");
    } finally {
      setProcessing((p) => ({ ...p, [providerId]: false }));
    }
  };

  const handlePaymentConfigSave = async () => {
    try {
      const response = await api.put("/admin-payments/config", paymentConfig);
      setPaymentConfig(response.data.config);
      addToast("Payment configuration saved.", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to save payment configuration.", "error");
    }
  };

  const handleUploadQr = async () => {
    if (!qrFile) return addToast("Select a QR image first.", "error");
    if (processing["uploadQr"]) return;
    setProcessing((p) => ({ ...p, uploadQr: true }));
    const formData = new FormData();
    formData.append("qrCode", qrFile);
    formData.append("label", qrFile.name);
    try {
      const response = await api.post("/admin-payments/upload-qr", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setPaymentConfig(response.data.config);
      setQrFile(null);
      addToast("QR uploaded successfully.", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to upload QR code.", "error");
    } finally {
      setProcessing((p) => ({ ...p, uploadQr: false }));
    }
  };

  const handleRemoveUpi = (index) => {
    const next = [...paymentConfig.upiIds];
    next.splice(index, 1);
    setPaymentConfig({ ...paymentConfig, upiIds: next });
  };

  const handleRemoveBank = (index) => {
    const next = [...paymentConfig.bankAccounts];
    next.splice(index, 1);
    setPaymentConfig({ ...paymentConfig, bankAccounts: next });
  };

  const handleDeleteQr = async (qrId) => {
    if (!qrId) return;
    if (processing[qrId]) return;
    setProcessing((p) => ({ ...p, [qrId]: true }));
    try {
      const resp = await api.delete(`/admin-payments/upload-qr/${qrId}`);
      setPaymentConfig(resp.data.config);
      addToast("QR deleted", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to delete QR", "error");
    } finally {
      setProcessing((p) => ({ ...p, [qrId]: false }));
    }
  };

  const handleReplaceQr = async (qrId, file) => {
    if (!file) return addToast("Select a replacement file first", "error");
    const fd = new FormData();
    fd.append("qrCode", file);
    fd.append("label", file.name);
    try {
      const resp = await api.put(`/admin-payments/upload-qr/${qrId}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPaymentConfig(resp.data.config);
      addToast("QR replaced", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to replace QR", "error");
    }
  };

  const toggleItemEnabled = (type, index) => {
    const next = { ...paymentConfig };
    if (type === 'upi') {
      next.upiIds[index].enabled = !next.upiIds[index].enabled;
    } else if (type === 'bank') {
      next.bankAccounts[index].enabled = !next.bankAccounts[index].enabled;
    } else if (type === 'qr') {
      next.qrCodes[index].enabled = !next.qrCodes[index].enabled;
    }
    setPaymentConfig(next);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-logo">🚀 FastAid</div>
        <button className="logout-btn" onClick={() => {
          localStorage.removeItem("token");
          window.location.href = "/";
        }}>
          Logout
        </button>
      </header>

      <div className="dashboard-content">
        <h1 className="dashboard-title">Admin Dashboard ⚙️</h1>
        <p className="dashboard-subtitle">Manage your platform and payment channels</p>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "services" ? "active" : ""}`}
            onClick={() => setActiveTab("services")}
          >
            🛠️ Services
          </button>
          <button
            className={`tab ${activeTab === "bookings" ? "active" : ""}`}
            onClick={() => setActiveTab("bookings")}
          >
            📋 Bookings
          </button>
          <button
            className={`tab ${activeTab === "payments" ? "active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            💳 Payments
          </button>
          <button
            className={`tab ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            👥 Users
          </button>
          <button
            className={`tab ${activeTab === "providers" ? "active" : ""}`}
            onClick={() => setActiveTab("providers")}
          >
            🔧 Providers
          </button>
        </div>

        {activeTab === "services" && (
          <div className="fade-in">
            <div className="dashboard-form">
              <h3>➕ Add New Service</h3>
              <form onSubmit={handleAddService}>
                <div className="form-row">
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Service Name"
                      value={newService.name}
                      onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                      required
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Category"
                      value={newService.category}
                      onChange={(e) => setNewService({ ...newService, category: e.target.value })}
                      required
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="number"
                      placeholder="Rating"
                      value={newService.rating || ""}
                      onChange={(e) => setNewService({ ...newService, rating: parseFloat(e.target.value) })}
                      step="0.1"
                      min="0"
                      max="5"
                      className="form-input"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Add Service
                  </button>
                </div>
              </form>
            </div>

            <div className="table-container">
              {loading ? (
                <Skeleton count={4} height="44px" />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Rating</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service) => (
                      <tr key={service._id}>
                        <td>{service.name}</td>
                        <td>{service.category}</td>
                        <td>
                          <span className="rating-star">⭐</span> {service.rating}
                        </td>
                        <td>
                          <button
                            onClick={() => handleDeleteService(service._id)}
                            className="btn btn-danger btn-small"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="table-container fade-in">
            {loading ? (
              <Skeleton count={5} height="44px" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking._id}>
                      <td>{booking.serviceName}</td>
                      <td>{booking.location}</td>
                      <td>
                        <span className={`status-badge status-${booking.status}`}>
                          {booking.status}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${booking.paymentStatus}`}>
                          {booking.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="dashboard-form fade-in">
            <h3>Payment Configuration</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Enable Card Payments</label>
                <select
                  className="form-select"
                  value={paymentConfig.cardSupported ? "yes" : "no"}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, cardSupported: e.target.value === "yes" })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Enable COD</label>
                <select
                  className="form-select"
                  value={paymentConfig.codSupported ? "yes" : "no"}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, codSupported: e.target.value === "yes" })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="payment-settings-grid">
              <div className="payment-source">
                <h4>UPI IDs</h4>
                {paymentConfig.upiIds?.map((upi, index) => (
                  <div key={index} className="payment-item-row">
                    <span>{upi.label || `UPI ${index + 1}`}</span>
                    <input
                      type="text"
                      className="form-input"
                      value={upi.value}
                      onChange={(e) => {
                        const nextUpiIds = [...paymentConfig.upiIds];
                        nextUpiIds[index] = { ...nextUpiIds[index], value: e.target.value };
                        setPaymentConfig({ ...paymentConfig, upiIds: nextUpiIds });
                      }}
                    />
                    <button className="btn btn-danger btn-small" onClick={() => handleRemoveUpi(index)}>Delete</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setPaymentConfig({ ...paymentConfig, upiIds: [...(paymentConfig.upiIds || []), { value: "", label: "UPI" }] })}
                >
                  Add UPI ID
                </button>
              </div>

              <div className="payment-source">
                <h4>Bank Accounts</h4>
                {paymentConfig.bankAccounts?.map((bank, index) => (
                  <div key={index} className="payment-item-row">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Bank Name"
                      value={bank.bankName}
                      onChange={(e) => {
                        const next = [...paymentConfig.bankAccounts];
                        next[index] = { ...next[index], bankName: e.target.value };
                        setPaymentConfig({ ...paymentConfig, bankAccounts: next });
                      }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Account Number"
                      value={bank.accountNumber}
                      onChange={(e) => {
                        const next = [...paymentConfig.bankAccounts];
                        next[index] = { ...next[index], accountNumber: e.target.value };
                        setPaymentConfig({ ...paymentConfig, bankAccounts: next });
                      }}
                    />
                    <button className="btn btn-danger btn-small" onClick={() => handleRemoveBank(index)}>Delete</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setPaymentConfig({ ...paymentConfig, bankAccounts: [...(paymentConfig.bankAccounts || []), { bankName: "", accountName: "", accountNumber: "", ifsc: "" }] })}
                >
                  Add Bank Account
                </button>
              </div>
            </div>

              <div className="upload-qr-section">
              <h4>QR Upload</h4>
              <input type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] || null)} />
              <button type="button" className="btn btn-primary btn-small" onClick={handleUploadQr}>
                Upload QR
              </button>
                <div className="qr-list">
                  {paymentConfig.qrCodes?.map((qr, idx) => (
                    <div key={qr._id || qr.url} className="qr-row">
                      <img src={`http://localhost:5000${qr.url}`} alt={qr.label} style={{ width: 80, height: 80, objectFit: 'cover' }} />
                      <div style={{ flex: 1, marginLeft: 8 }}>
                        <div>{qr.label}</div>
                        <div style={{ marginTop: 6 }}>
                          <label style={{ marginRight: 8 }}>
                            <input type="checkbox" checked={qr.enabled !== false} onChange={() => toggleItemEnabled('qr', idx)} /> Enabled
                          </label>
                          <input type="file" accept="image/*" onChange={(e) => setQrReplaceFiles({ ...qrReplaceFiles, [qr._id]: e.target.files?.[0] || null })} />
                          <button className="btn btn-secondary btn-small" onClick={() => handleReplaceQr(qr._id, qrReplaceFiles[qr._id])}>Replace</button>
                          <button className="btn btn-danger btn-small" onClick={() => handleDeleteQr(qr._id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            </div>

            <button type="button" className="btn btn-primary" onClick={handlePaymentConfigSave}>
              Save Payment Configuration
            </button>
          </div>
        )}

        {activeTab === "users" && (
          <div className="table-container fade-in">
            {loading ? (
              <Skeleton count={4} height="44px" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`status-badge ${user.role === 'admin' ? 'status-accepted' : user.role === 'provider' ? 'status-pending' : ''}`}>
                          {user.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "providers" && (
          <div className="table-container fade-in">
            {loading ? (
              <Skeleton count={4} height="44px" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Verified</th>
                    <th>Documents</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => {
                    const providerId = provider._id || provider.id || provider.userId?._id;
                    const providerName = typeof provider.userId === 'object' ? provider.userId.name : provider.userId;
                    return (
                      <tr key={providerId || providerName || provider._id || provider.id}>
                        <td>{providerName || "Unknown Provider"}</td>
                        <td>
                          {provider.verified ? (
                            <span className="status-badge status-accepted">✅ Verified</span>
                          ) : (
                            <span className="status-badge status-pending">❌ Not Verified</span>
                          )}
                        </td>
                        <td>
                          <small>
                            Aadhar: {provider.documents?.aadhar || "N/A"}<br/>
                            PAN: {provider.documents?.pan || "N/A"}
                          </small>
                        </td>
                        <td>
                          {!provider.verified ? (
                            <button
                              type="button"
                              onClick={() => providerId && handleVerifyProvider(providerId)}
                              className="btn btn-success btn-small"
                              disabled={!providerId}
                            >
                              Verify
                            </button>
                          ) : (
                            <span className="reviewed-tag">Already verified</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
