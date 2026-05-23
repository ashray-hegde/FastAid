import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import AuthOtp from "../components/AuthOtp";
import { normalizePhoneInput } from "../firebase";

export default function Login({ setRole }) {
  const [loginMode, setLoginMode] = useState("password");
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
    mobileNumber: "",
    otp: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((count) => count - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const loginSuccess = (data) => {
    localStorage.setItem("token", data.token);
    if (data.refreshToken) {
      localStorage.setItem("refreshToken", data.refreshToken);
    }
    setRole(data.role);
    if (!data.profileComplete) {
      navigate("/complete-profile");
    } else {
      navigate("/");
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        identifier: formData.identifier,
        password: formData.password
      });
      loginSuccess(response.data);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Login failed";
      setError(message);
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const normalizedPhone = normalizePhoneInput(formData.mobileNumber);
      if (!normalizedPhone.startsWith("+")) {
        throw new Error("Mobile number must begin with country code, e.g. +91 or +1.");
      }
      await sendPhoneOtp(normalizedPhone);
      setOtpRequested(true);
      setOtpSentMessage("OTP sent to your mobile number. Please enter it below.");
      setResendSeconds(60);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Unable to send OTP.");
      if (process.env.NODE_ENV !== "production") console.error("OTP request error:", err);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedPhone = normalizePhoneInput(formData.mobileNumber);
      if (!normalizedPhone.startsWith("+")) throw new Error("Mobile number must include country code.");
      const response = await verifyPhoneOtp(normalizedPhone, formData.otp);
      loginSuccess(response);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "OTP verification failed.";
      setError(message);
      if (process.env.NODE_ENV !== "production") console.error("OTP verify error:", err);
    } finally {
      setLoading(false);
    }
  };

  const canResend = resendSeconds <= 0;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🚀 FastAid</div>
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Secure access to your FastAid dashboard</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`tab ${loginMode === "password" ? "active" : ""}`}
            type="button"
            onClick={() => setLoginMode("password")}
          >
            Password
          </button>
          <button
            className={`tab ${loginMode === "otp" ? "active" : ""}`}
            type="button"
            onClick={() => setLoginMode("otp")}
          >
            Phone OTP
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loginMode === "password" ? (
          <form onSubmit={handlePasswordLogin}>
            <div className="form-group">
              <label className="form-label">Email or Mobile Number</label>
              <input
                type="text"
                name="identifier"
                value={formData.identifier}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Email or mobile number"
              />
              <div className="form-help-text">Use the email or the mobile number you registered with.</div>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Password</label>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your password"
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="tab-btn"
                style={{ position: 'absolute', right: 12, top: 36 }}
                aria-pressed={showPassword}
                aria-label="Toggle password visibility"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <button type="submit" className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <div>
            <AuthOtp
              initialPhone={formData.mobileNumber}
              onVerified={(authResp) => {
                loginSuccess(authResp);
              }}
            />
          </div>
          )}

        <div className="auth-divider">or</div>

        <div className="auth-footer">
          <div className="social-login">
            <a className="btn btn-secondary" href={`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/auth/google`}>
              Continue with Google
            </a>
          </div>

          <div className="auth-link text-muted">
            Don't have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("/register");
              }}
            >
              Create Account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
