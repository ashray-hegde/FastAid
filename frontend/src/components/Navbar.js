import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function Navbar({ onLogout }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
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
        decodedToken = JSON.parse(atob(token.split(".")[1]));
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
        { label: "Payments", path: "/admin/payments", icon: "💳" }
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

  return (
    <nav className="navbar animate-slide-in-left">
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => navigate("/")} title="Go to Home">
          ⚡ FastAid
        </div>

        <ul className="navbar-menu">
          {navLinks.map((link) => (
            <li key={link.path} className="navbar-item">
              <a
                href={link.path}
                className="navbar-link"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(link.path);
                }}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="navbar-right">
        {user ? (
          <>
            <div className="navbar-user" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }} title="View profile">
              <div className="user-avatar">{getUserInitial()}</div>
              <div className="user-info">
                <div className="user-name">{user?.name || "User"}</div>
                <div className="user-role">{getRoleLabel()}</div>
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

