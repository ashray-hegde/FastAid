import React, { useState, useEffect, useRef } from "react";
import { sendPhoneOtp, verifyPhoneOtp, normalizePhoneInput } from "../firebase";
import { useToast } from "../context/ToastContext";
import "./auth-otp.css";

export default function AuthOtp({ initialPhone = "", onVerified, onCancel }) {
  const [phone, setPhone] = useState(initialPhone || "");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const otpInputRef = useRef(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    if (otpRequested && otpInputRef.current) otpInputRef.current.focus();
  }, [otpRequested]);

  useEffect(() => {
    if (otpRequested && otp.length >= 6) {
      // auto-submit when 6 digits entered
      handleVerifyOtp();
    }
    // note: auto-submit when OTP length reached
  }, [otp]);

  const handleRequestOtp = async () => {
    try {
      setLoading(true);
      setOtp("");
      const normalized = normalizePhoneInput(phone);
      if (!normalized.startsWith("+")) throw new Error("Please include country code, e.g. +91.");
      await sendPhoneOtp(normalized);
      setOtpRequested(true);
      setResendSeconds(60);
      addToast("OTP sent to your mobile number", "info");
    } catch (err) {
      addToast(err.message || "Unable to send OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setLoading(true);
      const normalized = normalizePhoneInput(phone);
      const resp = await verifyPhoneOtp(normalized, otp);
      addToast("Verification successful", "success");
      if (onVerified) onVerified(resp);
    } catch (err) {
      addToast(err.response?.data?.error || err.message || "OTP verification failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-otp" role="region" aria-labelledby="auth-otp-heading">
      <div className="form-group">
        <label id="auth-otp-heading" className="form-label">Mobile Number</label>
        <input
          type="tel"
          className="form-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98765 43210"
          disabled={otpRequested}
        />
      </div>

      {otpRequested && (
        <div className="form-group">
          <label className="form-label">OTP</label>
          <input
            ref={otpInputRef}
            type="text"
            className="form-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="Enter 6-digit code"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
        <button
          className={`btn btn-primary ${loading ? "loading" : ""}`}
          onClick={otpRequested ? handleVerifyOtp : handleRequestOtp}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "" : otpRequested ? "Verify OTP" : "Request OTP"}
        </button>

        {otpRequested && (
          <button className="btn btn-secondary" onClick={handleRequestOtp} disabled={resendSeconds > 0 || loading} aria-disabled={resendSeconds > 0 || loading}>
            {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend OTP"}
          </button>
        )}

        {onCancel && (
          <button className="btn btn-link" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
