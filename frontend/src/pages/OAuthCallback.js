import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { decodeJwt } from "../utils/token";

export default function OAuthCallback({ setRole }) {
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");
    const refreshToken = params.get("refreshToken");

    if (!token) {
      navigate("/login");
      return;
    }

    localStorage.setItem("token", token);
    if (refreshToken) {
      localStorage.setItem("refreshToken", refreshToken);
    }

    const decoded = decodeJwt(token);
    if (!decoded) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      navigate("/login");
      return;
    }

    if (decoded?.role) {
      setRole(decoded.role);
    }
    if (!decoded?.profileComplete) {
      navigate("/complete-profile");
      return;
    }

    navigate("/");
  }, [navigate, search, setRole]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Signing you in...</h1>
        <p className="auth-subtitle">Please wait while we complete your login.</p>
      </div>
    </div>
  );
}
