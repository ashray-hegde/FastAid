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

export default function App() {
  const [role, setRole] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const socket = getSocket();

    // If no token, leave socket to manage connection; it will reconnect when token appears
    if (!token) {
      return;
    }
    try {
      const decoded = decodeJwt(token);
      if (!decoded?.role) throw new Error("Invalid token payload");
      setRole(decoded.role);
      
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
      localStorage.removeItem("token");
      // do not forcefully disconnect here; allow socket to retry connections
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleBookingUpdate = (data) => {
      if (process.env.NODE_ENV !== "production") console.log("booking-update", data);
    };

    socket.on("booking-update", handleBookingUpdate);

    return () => {
      socket.off("booking-update", handleBookingUpdate);
    };
  }, []);

  const handleLogout = () => {
    const socket = getSocket();
    localStorage.removeItem("token");
    setRole("");
    socket.disconnect();
    navigate("/login");
  };

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
