import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import getSocket from "./socket";
import Login from "./pages/Login";
import Register from "./pages/Register";
import User from "./pages/UserDashboard";
import Provider from "./pages/ProviderDashboard";
import Admin from "./pages/AdminDashboard";
import AdminLockouts from "./pages/AdminLockouts";
import ProfilePage from "./pages/ProfilePage";
import CompleteProfile from "./pages/CompleteProfile";
import ProviderVerification from "./pages/ProviderVerification";
import OAuthCallback from "./pages/OAuthCallback";
import ProviderLocationManager from "./components/ProviderLocationManager";
import Navbar from "./components/Navbar";
import { decodeJwt } from "./utils/token";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import ToastContainer from "./components/ToastContainer";

function App() {
  if (process.env.NODE_ENV !== "production") console.log("App rerender");
  const [role, setRole] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.log("[App] Startup useEffect: token/socket/role setup");
    setAuthLoading(true);
    const token = localStorage.getItem("token");
    const socket = getSocket();
    if (process.env.NODE_ENV !== "production") {
      socket.on("connect", () => console.log("[App] Socket connected", socket.id));
      socket.on("disconnect", (reason) => console.log("[App] Socket disconnected", reason));
    }

    if (!token) {
      if (process.env.NODE_ENV !== "production") console.log("[App] No token found at startup");
      setRole("");
      setAuthLoading(false);
      return;
    }
    try {
      const decoded = decodeJwt(token);
      if (!decoded?.role) throw new Error("Invalid token payload");
      setRole(decoded.role);
      if (process.env.NODE_ENV !== "production") console.log(`[App] Token found, role set to ${decoded.role}`);
      // Connect socket and register only when we have a token
      socket.connect();
      socket.emit("register", { token });
      // If provider, fetch last known location immediately
      if (decoded.role === "provider") {
        try {
          socket.emit("get-provider-location", { providerId: decoded.id }, (loc) => {
            if (loc) {
              try { localStorage.setItem("providerLastLocation", JSON.stringify(loc)); } catch (e) {}
            }
          });
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.log("[App] Invalid token, clearing");
      localStorage.removeItem("token");
      setRole("");
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.log("App useEffect: booking-update handler");
    const socket = getSocket();
    const handleBookingUpdate = (data) => {
      if (process.env.NODE_ENV !== "production") console.log("booking-update", data);
    };

    socket.on("booking-update", handleBookingUpdate);
    if (process.env.NODE_ENV !== "production") console.log("[App] Registered booking-update handler");

    return () => {
      socket.off("booking-update", handleBookingUpdate);
      if (process.env.NODE_ENV !== "production") console.log("[App] Cleaned up booking-update handler");
    };
  }, []);

  const handleLogout = () => {
    if (process.env.NODE_ENV !== "production") console.log("App handleLogout called");
    const socket = getSocket();
    localStorage.removeItem("token");
    setRole("");
    socket.disconnect();
    if (process.env.NODE_ENV !== "production") console.log("[App] Socket disconnected on logout");
    navigate("/login");
  };

  if (authLoading) {
    if (process.env.NODE_ENV !== "production") console.log("[App] Waiting for auth to finish loading...");
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Loading...</h2>
        <p>Initializing authentication...</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <CartProvider>
        {role && <Navbar onLogout={handleLogout} />}
        {role === "provider" && <ProviderLocationManager />}
        <Routes>
          <Route path="/oauth-callback" element={<OAuthCallback setRole={setRole} />} />
          <Route path="/complete-profile" element={<CompleteProfile setRole={setRole} />} />
          <Route path="/provider-verification" element={<ProviderVerification />} />
          <Route path="/login" element={<Login setRole={setRole} />} />
          <Route path="/register" element={<Register />} />

          {role === "user" && (
            <>
              <Route path="/" element={<User />} />
              <Route path="/bookings" element={<User />} />
              <Route path="/cart" element={<User />} />
              <Route path="/profile" element={<ProfilePage />} />
            </>
          )}

          {role === "provider" && (
            <>
              <Route path="/" element={<Provider />} />
              <Route path="/provider" element={<Provider />} />
              <Route path="/provider/bookings" element={<Provider />} />
              <Route path="/provider/earnings" element={<Provider />} />
              <Route path="/provider/profile" element={<ProfilePage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </>
          )}

          {role === "admin" && (
            <>
              <Route path="/" element={<Admin />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/users" element={<Admin />} />
              <Route path="/admin/services" element={<Admin />} />
              <Route path="/admin/bookings" element={<Admin />} />
              <Route path="/admin/payments" element={<Admin />} />
              <Route path="/admin/lockouts" element={<AdminLockouts />} />
              <Route path="/profile" element={<ProfilePage />} />
            </>
          )}

          <Route path="*" element={!role ? <Login setRole={setRole} /> : role === "user" ? <User /> : role === "provider" ? <Provider /> : <Admin />} />
        </Routes>
      </CartProvider>
      <ToastContainer />
    </ToastProvider>
  );
}

export default App;
