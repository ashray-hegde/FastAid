import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function ProviderVerification() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aadharFile, setAadharFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadProvider = async () => {
      try {
        const res = await api.get("/auth/provider-status");
        setProvider(res.data);
      } catch (err) {
        addToast(err.response?.data?.error || "Unable to load provider status", "error");
      } finally {
        setLoading(false);
      }
    };
    loadProvider();
  }, [addToast]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!aadharFile || !panFile) {
      addToast("Please attach both Aadhar and PAN documents", "error");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("aadhar", aadharFile);
    formData.append("pan", panFile);

    try {
      const res = await api.post("/auth/provider-documents", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setProvider(res.data.provider);
      addToast("Documents uploaded, pending admin review", "success");
    } catch (err) {
      addToast(err.response?.data?.error || "Document upload failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Loading verification status...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🚀 FastAid</div>
          <h1 className="auth-title">Provider Verification</h1>
          <p className="auth-subtitle">Upload documents to get verified and start accepting jobs.</p>
        </div>

        {provider?.verificationStatus === "approved" ? (
          <div className="status-card success">
            <h3>✅ Verified Provider</h3>
            <p>You are verified and ready to receive service requests.</p>
            <button className="btn btn-primary" onClick={handleReturn}>Go to Dashboard</button>
          </div>
        ) : (
          <>
            {provider?.verificationStatus === "pending" && (
              <div className="status-card info">
                <h3>⏳ Documents Pending Review</h3>
                <p>Your submission is under review. You will gain full provider access once approved.</p>
              </div>
            )}
            {provider?.verificationStatus === "rejected" && (
              <div className="status-card warning">
                <h3>⚠️ Verification Rejected</h3>
                <p>{provider.verificationReason || "Please upload clearer documents and try again."}</p>
              </div>
            )}

            <form onSubmit={handleUpload} className="verification-form">
              <div className="form-group">
                <label className="form-label">Aadhar Document</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setAadharFile(e.target.files?.[0] || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">PAN Document</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setPanFile(e.target.files?.[0] || null)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Uploading documents..." : "Submit Documents"}
              </button>
            </form>

            <button className="btn btn-secondary" onClick={handleReturn}>
              Return to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
