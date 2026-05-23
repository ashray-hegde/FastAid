import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import getSocket from "../socket";
import { decodeJwt } from "../utils/token";

export default function Navbar({ onLogout }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setUser(null);
        setRole(null);
        return;
      }

      let decodedToken;
      try {
        decodedToken = decodeJwt(token);
        if (decodedToken?.role) {
          setRole(decodedToken.role);
        }
      } catch (err) {
        // ignore token decode errors, continue to fetch profile
      }

      try {
        const res = await api.get("/auth/profile");
        const userData = res.data?.user || res.data;
        setUser(userData);
        setRole(userData?.role || decodedToken?.role || "user");
      } catch (err) {
        console.error("Failed to fetch user:", err);
        localStorage.removeItem("token");
        setUser(null);
        setRole(null);
        if (onLogout) onLogout();
      }
    };

    fetchUser();

    const socket = getSocket();
    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [onLogout]);

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem("token");
      setUser(null);
      setRole(null);
      if (onLogout) onLogout();
      navigate("/");
    }
  };

  const getUserInitial = () => {
    return user?.name?.charAt(0).toUpperCase() || "U";
  };

  const getRoleLabel = () => {
    const roleMap = {
      admin: "👨‍💼 Admin",
      provider: "👨‍🔧 Provider",
      user: "👤 Customer",
    };
    return roleMap[role] || "User";
  };

  const getNavLinks = () => {
    const baseLinks = [];

    if (role === "admin") {
      baseLinks.push(
        { label: "Dashboard", path: "/admin", icon: "📊" },
        { label: "Users", path: "/admin/users", icon: "👥" },
        { label: "Services", path: "/admin/services", icon: "⚙️" },
        { label: "Bookings", path: "/admin/bookings", icon: "📋" },
        { label: "Payments", path: "/admin/payments", icon: "💳" },
        { label: "Lockouts", path: "/admin/lockouts", icon: "🔐" }
      );
    } else if (role === "provider") {
      baseLinks.push(
        { label: "Dashboard", path: "/provider", icon: "🏠" },
        { label: "Bookings", path: "/provider/bookings", icon: "📋" },
        { label: "Earnings", path: "/provider/earnings", icon: "💰" },
        { label: "Profile", path: "/provider/profile", icon: "👤" }
      );
    } else {
      baseLinks.push(
        { label: "Services", path: "/", icon: "🛠️" },
        { label: "My Bookings", path: "/bookings", icon: "📋" },
        { label: "Cart", path: "/cart", icon: "🛒" },
        { label: "Profile", path: "/profile", icon: "👤" }
      );
    }

    return baseLinks;
  };

  const navLinks = getNavLinks();
  
  // Render full navbar for all roles
  return (
    <nav className="navbar animate-slide-in-left">
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => navigate("/")} title="Go to Home">
          ⚡ FastAid
        </div>
        {/* Desktop nav */}
        <div className="navbar-links">
          {navLinks.slice(0, 4).map((link) => (
            <button
              key={link.path}
              className="tab-btn"
              onClick={() => { setMobileOpen(false); navigate(link.path); }}
            >
              {link.icon} {link.label}
            </button>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="hamburger-btn"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((s) => !s)}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      <div className="navbar-right">
        {/* Mobile menu (simple stacked) */}
        {mobileOpen && (
          <div className="mobile-menu">
            {navLinks.map((l) => (
              <button key={l.path} className="mobile-link" onClick={() => { setMobileOpen(false); navigate(l.path); }}>
                {l.icon} {l.label}
              </button>
            ))}
          </div>
        )}
        {user ? (
          <>
            <div className="navbar-user" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }} title="View profile">
              <div className="user-avatar">{getUserInitial()}</div>
              <div className="user-info">
                <div className="user-name">{user?.name || "User"}</div>
                <div className="user-role">
                  {getRoleLabel()}
                  {role === "provider" && (
                    <span className={`live-pill ${socketConnected ? "online" : "offline"}`} title={socketConnected ? "Live tracking active" : "Live tracking offline"}>
                      {socketConnected ? "Live" : "Offline"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button className="navbar-logout" onClick={handleLogout}>
              🚪 Logout
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-small"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
}

