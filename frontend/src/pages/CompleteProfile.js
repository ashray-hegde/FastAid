import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function CompleteProfile({ setRole }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    age: "",
    mobileNumber: "",
    secondaryMobileNumber: "",
    role: "user"
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/auth/profile");
        const user = res.data;
        setFormData({
          fullName: user.fullName || user.name || "",
          email: user.email || "",
          age: user.age || "",
          mobileNumber: user.mobileNumber || "",
          secondaryMobileNumber: user.secondaryMobileNumber || "",
          role: user.role || "user"
        });
        if (user.profileComplete && user.role !== "provider") {
          navigate("/");
        }
      } catch (err) {
        addToast("Unable to load profile", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate, addToast]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/auth/complete-profile", {
        ...formData,
        age: Number(formData.age) || undefined
      });

      if (res.data.token) {
        localStorage.setItem("token", res.data.token);
        if (res.data.role) setRole(res.data.role);
      }

      if (formData.role === "provider") {
        navigate("/provider-verification");
      } else {
        navigate("/");
      }
    } catch (err) {
      addToast(err.response?.data?.error || "Failed to complete profile", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Loading profile...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🚀 FastAid</div>
          <h1 className="auth-title">Complete Your Account</h1>
          <p className="auth-subtitle">Finish your profile to access the platform.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="form-input"
              placeholder="Optional email for notifications"
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
                required
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
                required
                className="form-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Secondary Mobile</label>
            <input
              type="tel"
              name="secondaryMobileNumber"
              value={formData.secondaryMobileNumber}
              onChange={handleChange}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Register As</label>
            <select name="role" value={formData.role} onChange={handleChange} className="form-select">
              <option value="user">Customer</option>
              <option value="provider">Provider</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving profile..." : "Complete Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
