import { useEffect, useState } from "react";
import api from "../api";
import ToastContainer, { showToast } from "../components/ToastContainer";

export default function ProfilePage() {
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
      showToast("Failed to load profile", "error");
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
      showToast("Profile updated successfully!", "success");
      setEditing(false);
      fetchProfile();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update profile", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = async (id) => {
    try {
      setLoading(true);
      const coordinates = { lat: 0, lng: 0 }; // Can be updated with geolocation later
      if (editingAddressId && editingAddressId !== "new") {
        // Update existing address by id
        await api.put(`/auth/addresses/${editingAddressId}`, {
          ...addressForm,
          coordinates
        });
        showToast("Address updated successfully!", "success");
      } else {
        // Add new address
        await api.post("/auth/addresses", {
          ...addressForm,
          coordinates
        });
        showToast("Address added successfully!", "success");
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
      showToast(err.response?.data?.error || "Failed to save address", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    try {
      setLoading(true);
      await api.delete(`/auth/addresses/${id}`);
      showToast("Address deleted successfully!", "success");
      fetchAddresses();
    } catch (err) {
      showToast("Failed to delete address", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditAddress = (id) => {
    const addr = addresses.find(a => a.id === id);
    setAddressForm({
      label: addr.label || "",
      street: addr.street || "",
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.postalCode || ""
    });
    setEditingAddressId(id);
  };

  if (loading && !user) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <div className="dashboard-container">
      <ToastContainer />
      <div className="main-content profile-page">
        <h1 className="page-title">👤 My Profile</h1>

        {/* Profile Section */}
        <div className="profile-section">
          <div className="profile-header">
            <div className="profile-avatar">
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="Profile" />
              ) : (
                <div className="avatar-placeholder">👤</div>
              )}
            </div>
            <div className="profile-info">
              <h2>{user?.fullName || user?.name}</h2>
              <p className="profile-role">{user?.role === "user" ? "👤 Customer" : "🔧 Provider"}</p>
              <p className="profile-email">{user?.email}</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setEditing(!editing)}
            >
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

              <button
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}

          <div className="profile-details">
            <h3>Account Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">📧 Email</span>
                <span className="detail-value">{user?.email}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">📞 Mobile</span>
                <span className="detail-value">{user?.mobileNumber || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">📱 Secondary Mobile</span>
                <span className="detail-value">{user?.secondaryMobileNumber || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">🎂 Age</span>
                <span className="detail-value">{user?.age || "Not set"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">💰 Wallet Balance</span>
                <span className="detail-value">₹{user?.walletBalance || 0}</span>
              </div>
              {user?.role === "provider" && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">⭐ Rating</span>
                    <span className="detail-value">{user?.rating || 4.5}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">✅ Completed Bookings</span>
                    <span className="detail-value">{user?.completedBookings || 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Addresses Section - Only for Customers */}
        {user?.role === "user" && (
          <div className="addresses-section">
            <div className="section-header">
              <h2>📍 Saved Addresses</h2>
              {editingAddressId === null && (
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => setEditingAddressId("new")}
                >
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
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => handleEditAddress(addr.id)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleDeleteAddress(addr.id)}
                      >
                        🗑️ Delete
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
      </div>
    </div>
  );
}
