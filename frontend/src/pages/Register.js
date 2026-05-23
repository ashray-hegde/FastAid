import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import AuthOtp from "../components/AuthOtp";
import { normalizePhoneInput } from "../firebase";

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "user",
    age: "",
    mobileNumber: "",
    secondaryMobileNumber: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    otp: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((count) => count - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    setError("");

    if (!formData.fullName || !formData.email || !formData.password) {
      setError("Please fill all basic fields.");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setStep(2);
  };

  const passwordStrength = (pwd = "") => {
    if (pwd.length >= 12) return "Strong";
    if (pwd.length >= 8) return "Good";
    if (pwd.length > 0) return "Weak";
    return "";
  };

  const handleRequestOtp = async () => {
    setError("");
    setLoading(true);

    try {
      const normalizedPhone = normalizePhoneInput(formData.mobileNumber);
      if (!normalizedPhone.startsWith("+")) {
        throw new Error("Enter a phone number with country code, e.g. +91 98765 43210.");
      }

      await sendPhoneOtp(normalizedPhone);
      setOtpRequested(true);
      setOtpSentMessage("OTP sent to your mobile number. Enter it below to continue.");
      setResendSeconds(60);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Unable to send OTP.");
      console.error("Send OTP failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedPhone = normalizePhoneInput(formData.mobileNumber);
      if (!normalizedPhone.startsWith("+")) throw new Error("Enter a phone number with country code.");

      // Verify OTP with backend - this will create or return a user and provide tokens
      const authResp = await verifyPhoneOtp(normalizedPhone, formData.otp);
      if (authResp?.token) {
        localStorage.setItem("token", authResp.token);
        if (authResp.refreshToken) localStorage.setItem("refreshToken", authResp.refreshToken);

        // Complete profile for the logged-in user
        const submit = {
          fullName: formData.fullName,
          age: formData.age ? Number(formData.age) : undefined,
          mobileNumber: normalizedPhone,
          secondaryMobileNumber: normalizePhoneInput(formData.secondaryMobileNumber) || undefined,
          role: formData.role,
          email: formData.email
        };

        const completeResp = await api.post("/auth/complete-profile", submit);
        const tokenAfter = completeResp.data?.token || authResp.token;
        if (tokenAfter) {
          localStorage.setItem("token", tokenAfter);
        }

        if (completeResp.data?.role === "provider") {
          navigate("/provider-verification");
        } else if (!completeResp.data?.profileComplete) {
          navigate("/complete-profile");
        } else {
          navigate("/");
        }
        return;
      }
      setError("Registration failed during verification.");
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Registration failed.";
      setError(message);
      console.error("Registration error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackStep = () => {
    setError("");
    setStep(1);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🚀 FastAid</div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Signup with secure mobile OTP and password.</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleNextStep}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your full name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }} className="u-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="form-input"
                  placeholder="Create a strong password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="tab-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  style={{ position: 'absolute', right: 12, top: 8 }}
                  aria-pressed={showPassword}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="u-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <small className="form-help-text">Use 8+ characters, mix letters and numbers for best security.</small>
                <span className="strength-badge">{passwordStrength(formData.password)}</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">I want to register as</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="form-select"
              >
                <option value="user">👤 Customer</option>
                <option value="provider">🔧 Provider</option>
              </select>
            </div>

            <button type="submit" className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={!formData.fullName || !formData.email || formData.password.length < 8 || loading}>
              {loading ? 'Processing...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                min="18"
                max="100"
                className="form-input"
                placeholder="Enter your age"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input
                type="tel"
                name="mobileNumber"
                value={formData.mobileNumber}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Secondary Mobile Number</label>
              <input
                type="tel"
                name="secondaryMobileNumber"
                value={formData.secondaryMobileNumber}
                onChange={handleChange}
                className="form-input"
                placeholder="Optional secondary number"
              />
            </div>

            {formData.role === "user" && (
              <>
                <h3 className="form-section-title">Delivery Address</h3>
                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
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
                      value={formData.city}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="City"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="State"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Pincode"
                  />
                </div>
              </>
            )}

            <AuthOtp
              initialPhone={formData.mobileNumber}
              onVerified={async (authResp) => {
                try {
                  if (authResp?.token) {
                    localStorage.setItem("token", authResp.token);
                    if (authResp.refreshToken) localStorage.setItem("refreshToken", authResp.refreshToken);
                  }

                  const submit = {
                    fullName: formData.fullName,
                    age: formData.age ? Number(formData.age) : undefined,
                    mobileNumber: normalizePhoneInput(formData.mobileNumber),
                    secondaryMobileNumber: normalizePhoneInput(formData.secondaryMobileNumber) || undefined,
                    role: formData.role,
                    email: formData.email
                  };

                  const completeResp = await api.post("/auth/complete-profile", submit);
                  const tokenAfter = completeResp.data?.token || authResp.token;
                  if (tokenAfter) localStorage.setItem("token", tokenAfter);

                  if (completeResp.data?.role === "provider") {
                    navigate("/provider-verification");
                  } else if (!completeResp.data?.profileComplete) {
                    navigate("/complete-profile");
                  } else {
                    navigate("/");
                  }
                } catch (err) {
                  console.error(err);
                }
              }}
              onCancel={handleBackStep}
            />

            <div className="button-group" style={{ marginTop: "18px" }}>
              <button type="button" className="btn btn-secondary" onClick={handleBackStep}>
                Back
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: 18 }}>
          <div className="text-muted">Already have an account?</div>
          <div>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate("/login"); }} className="btn btn-secondary">
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
