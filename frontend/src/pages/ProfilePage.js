import { useEffect, useState } from "react";
import api from "../api";
import ToastContainer from "../components/ToastContainer";
import { useToast } from "../context/ToastContext";
import PaymentPage from "./PaymentPage";

export default function ProfilePage() {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    age: "",
    mobileNumber: "",
    secondaryMobileNumber: "",
    profilePicture: ""
  });
  const [addresses, setAddresses] = useState([]);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressForm, setAddressForm] = useState({
    label: "",
    street: "",
    city: "",
    state: "",
    postalCode: ""
  });

  // Wallet payment state
  const [showWalletTopup, setShowWalletTopup] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  const [walletError, setWalletError] = useState("");
  const [currentPaymentType, setCurrentPaymentType] = useState("booking");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    fetchProfile();
    fetchAddresses();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/auth/profile");
      setUser(res.data);
      setFormData({
        fullName: res.data.fullName || res.data.name || "",
        age: res.data.age || "",
        mobileNumber: res.data.mobileNumber || "",
        secondaryMobileNumber: res.data.secondaryMobileNumber || "",
        profilePicture: res.data.profilePicture || ""
      });
    } catch (err) {
      addToast("Failed to load profile", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAddresses = async () => {
    try {
      if (user?.role === "user") {
        const res = await api.get("/auth/addresses");
        setAddresses(res.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch addresses");
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddressChange = (e) => {
    setAddressForm({ ...addressForm, [e.target.name]: e.target.value });
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      await api.put("/auth/profile", formData);
      addToast("Profile updated successfully!", "success");
      setEditing(false);
      fetchProfile();
    } catch (err) {
      addToast(err.response?.data?.error || "Failed to update profile", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = async (id) => {
    try {
      setLoading(true);
      const coordinates = { lat: 0, lng: 0 }; // Can be updated with geolocation later
      if (editingAddressId && editingAddressId !== "new") {
        await api.put(`/auth/addresses/${editingAddressId}`, {
          ...addressForm,
          coordinates
        });
        addToast("Address updated successfully!", "success");
      } else {
        await api.post("/auth/addresses", {
          ...addressForm,
          coordinates
        });
        addToast("Address added successfully!", "success");
      }

      setAddressForm({
        label: "",
        street: "",
        city: "",
        state: "",
        postalCode: ""
      });
      setEditingAddressId(null);
      fetchAddresses();
    } catch (err) {
      addToast(err.response?.data?.error || "Failed to save address", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    try {
      setLoading(true);
      await api.delete(`/auth/addresses/${id}`);
      addToast("Address deleted successfully!", "success");
      fetchAddresses();
    } catch (err) {
      addToast("Failed to delete address", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditAddress = (id) => {
    const addr = addresses.find((a) => a.id === id);
    setAddressForm({
      label: addr.label || "",
      street: addr.street || "",
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.postalCode || ""
    });
    setEditingAddressId(id);
  };

  // Wallet payment functions
  const fetchWallet = async () => {
    try {
      const res = await api.get("/payment/wallet-balance");
      setWalletBalance(res.data.wallet || 0);
    } catch (err) {
      if (err.response?.status !== 401) {
        setWalletError("Failed to fetch wallet");
      }
    }
  };

  const openWalletTopup = () => {
    setWalletAmount(0);
    setWalletError("");
    setShowWalletTopup(true);
    fetchWallet();
  };

  const handleRazorpayWalletSuccess = () => {
    setShowPayment(false);
    setShowWalletTopup(false); // Close wallet modal too
    setCurrentPaymentType("booking"); // Reset payment type
    setWalletAmount(0);
    setWalletError("");
    fetchWallet();
    addToast("✅ Wallet topped up successfully!", "success");
  };

  const handlePaymentSuccess = async () => {
    if (currentPaymentType === "wallet") {
      handleRazorpayWalletSuccess();
    }
  };

  if (loading && !user) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <div className="dashboard-container">
      <ToastContainer />
      <div className="main-content profile-page">
        <h1 className="page-title">My Profile</h1>

        {/* Profile Section */}
        <div className="profile-section">
          <div className="profile-header">
            <div className="profile-avatar">
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="Profile" />
              ) : (
                <div className="avatar-placeholder">Profile</div>
              )}
            </div>
            <div className="profile-info">
              <h2>{user?.fullName || user?.name}</h2>
              <p className="profile-role">
                {user?.role === "user" ? "Customer" : "Provider"}
              </p>
              <p className="profile-email">{user?.email}</p>
            </div>
            <button className="btn btn-primary" onClick={() => setEditing(!editing)}>
              {editing ? "Cancel" : "Edit Profile"}
            </button>
          </div>

          {editing && (
            <div className="profile-edit-form">
              <h3>Edit Profile Information</h3>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    className="form-input"
                    min="18"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input
                    type="tel"
                    name="mobileNumber"
                    value={formData.mobileNumber}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Secondary Mobile Number</label>
                <input
                  type="tel"
                  name="secondaryMobileNumber"
                  value={formData.secondaryMobileNumber}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Profile Photo URL</label>
                <input
                  type="text"
                  name="profilePicture"
                  value={formData.profilePicture}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter image URL"
                />
              </div>

              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}

          <div className="profile-details">
            <h3>Account Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Email</span>
                <span className="detail-value">{user?.email}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Mobile</span>
                <span className="detail-value">{user?.mobileNumber || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Secondary Mobile</span>
                <span className="detail-value">{user?.secondaryMobileNumber || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Age</span>
                <span className="detail-value">{user?.age || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Wallet Balance</span>
                <span className="detail-value">₹{user?.walletBalance || 0}</span>
              </div>
              {user?.role === "provider" && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">Rating</span>
                    <span className="detail-value">{user?.rating || 4.5}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Completed Bookings</span>
                    <span className="detail-value">{user?.completedBookings || 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {user?.role === "user" && (
            <div className="wallet-section" style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '1px solid #dcfce7', marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#22c55e' }}>💳 Wallet Balance</h3>
                  <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '14px' }}>Use Razorpay to instantly add funds to your wallet and book services faster.</p>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>₹{user?.wallet || user?.walletBalance || 0}</div>
                </div>
                <button
                  onClick={openWalletTopup}
                  className="btn btn-primary"
                  style={{ padding: '12px 24px', color: 'white', cursor: 'pointer', border: 'none' }}
                >
                  Add Money
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Addresses Section - Only for Customers */}
        {user?.role === "user" && (
          <div className="addresses-section">
            <div className="section-header">
              <h2>Saved Addresses</h2>
              {editingAddressId === null && (
                <button className="btn btn-primary btn-small" onClick={() => setEditingAddressId("new")}>
                  + Add Address
                </button>
              )}
            </div>

            {editingAddressId !== null && (
              <div className="address-form-card">
                <h3>{editingAddressId === "new" ? "Add New Address" : "Edit Address"}</h3>

                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input
                    type="text"
                    name="label"
                    value={addressForm.label}
                    onChange={handleAddressChange}
                    className="form-input"
                    placeholder="e.g., Home, Work, etc."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    name="street"
                    value={addressForm.street}
                    onChange={handleAddressChange}
                    className="form-input"
                    placeholder="Enter street address"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      name="city"
                      value={addressForm.city}
                      onChange={handleAddressChange}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      name="state"
                      value={addressForm.state}
                      onChange={handleAddressChange}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Postal Code</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={addressForm.postalCode}
                    onChange={handleAddressChange}
                    className="form-input"
                  />
                </div>

                <div className="button-group">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingAddressId(null);
                      setAddressForm({
                        label: "",
                        street: "",
                        city: "",
                        state: "",
                        postalCode: ""
                      });
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSaveAddress(editingAddressId)}
                    disabled={loading}
                  >
                    {loading ? "Saving..." : "Save Address"}
                  </button>
                </div>
              </div>
            )}

            <div className="addresses-list">
              {addresses.length > 0 ? (
                addresses.map((addr) => (
                  <div key={addr.id} className="address-card">
                    <div className="address-content">
                      <h4>{addr.label || "Saved Address"}</h4>
                      <p>{addr.street}</p>
                      <p className="address-city">
                        {addr.city}
                        {addr.state ? `, ${addr.state}` : ""}
                        {addr.postalCode ? ` ${addr.postalCode}` : ""}
                      </p>
                    </div>
                    <div className="address-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => handleEditAddress(addr.id)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => handleDeleteAddress(addr.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">📍</div>
                  <h3>No saved addresses</h3>
                  <p>Add a delivery address to get started</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wallet top-up modal - Simple Razorpay flow */}
        {showWalletTopup && !showPayment && (
          <div className="payment-modal">
            <div className="payment-content modern-payment">
              <button
                className="btn btn-secondary close-payment-btn"
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
                onClick={() => {
                  setShowWalletTopup(false);
                  setWalletAmount(0);
                  setWalletError("");
                }}
              >
                ✕ Close
              </button>

              <h3 style={{ marginBottom: '8px', color: '#111', fontSize: '22px', fontWeight: '700' }}>💳 Add Money</h3>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>Current Balance: <strong style={{ color: '#22c55e', fontSize: '16px' }}>₹{walletBalance || 0}</strong></p>

              {/* Amount Input */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#111' }}>Enter Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  placeholder="Enter amount (min ₹1, max ₹1,00,000)"
                  value={walletAmount}
                  onChange={(e) => {
                    setWalletAmount(Number(e.target.value));
                    setWalletError("");
                  }}
                  disabled={paymentLoading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '8px',
                    border: walletError ? '2px solid #dc2626' : '1px solid #ddd',
                    fontSize: '16px',
                    fontWeight: '500',
                    outline: 'none',
                    transition: 'border 0.2s',
                    opacity: paymentLoading ? 0.6 : 1
                  }}
                />
              </div>

              {/* Error Message */}
              {walletError && (
                <div style={{
                  color: '#dc2626',
                  padding: '12px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '6px',
                  border: '1px solid #fca5a5',
                  fontSize: '13px',
                  marginBottom: '16px',
                  fontWeight: '500'
                }}>
                  ⚠️ {walletError}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    // Validate amount
                    if (!walletAmount || walletAmount < 1) {
                      setWalletError("Enter at least ₹1");
                      return;
                    }
                    if (walletAmount > 100000) {
                      setWalletError("Maximum ₹1,00,000 allowed");
                      return;
                    }
                    
                    // Start payment flow
                    setWalletError("");
                    setCurrentPaymentType("wallet");
                    setShowWalletTopup(false);
                    setShowPayment(true);
                  }}
                  disabled={paymentLoading || !walletAmount || walletAmount < 1 || walletAmount > 100000}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    backgroundColor: (walletAmount && walletAmount >= 1 && walletAmount <= 100000 && !paymentLoading) ? '#22c55e' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (walletAmount && walletAmount >= 1 && walletAmount <= 100000 && !paymentLoading) ? 'pointer' : 'not-allowed',
                    fontSize: '16px',
                    fontWeight: '700',
                    transition: 'all 0.2s',
                    opacity: paymentLoading ? 0.7 : 1
                  }}
                >
                  {paymentLoading ? '⏳ Processing...' : '💳 Add Money'}
                </button>

                <button
                  onClick={() => {
                    setShowWalletTopup(false);
                    setWalletAmount(0);
                    setWalletError("");
                  }}
                  disabled={paymentLoading}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    backgroundColor: '#f3f4f6',
                    color: '#111',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: paymentLoading ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    opacity: paymentLoading ? 0.6 : 1
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPayment && (
          <div className="payment-modal">
            <div className="payment-content modern-payment">
              <button
                className="btn btn-secondary close-payment-btn"
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
                onClick={() => {
                  setShowPayment(false);
                  setCurrentPaymentType("booking");
                }}
              >
                ✕ Close
              </button>
              <PaymentPage
                onSuccess={handlePaymentSuccess}
                onCancel={() => {
                  setShowPayment(false);
                  setCurrentPaymentType("booking");
                }}
                amount={walletAmount}
                bookingId={""}
                user={user}
                paymentType={currentPaymentType}
              />

              {paymentLoading && (
                <div className="payment-loader-overlay">
                  <div className="loader-spinner" />
                  <p>Verifying payment...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
