import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import socket from "./socket";
import Login from "./pages/Login";
import Register from "./pages/Register";
import User from "./pages/UserDashboard";
import Provider from "./pages/ProviderDashboard";
import Admin from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import ProviderLocationManager from "./components/ProviderLocationManager";
import Navbar from "./components/Navbar";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import ToastContainer from "./components/ToastContainer";

export default function App() {
  const [role, setRole] = useState("");
  const [user, setUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const navigate = useNavigate();

useEffect(() => {
  const token = localStorage.getItem("token");
  const registerSocket = () => {
    if (!token) return;
    try {
      const decoded = JSON.parse(atob(token.split(".")[1]));
      setRole(decoded.role);
      socket.emit("register", { token });
    } catch (err) {
      localStorage.removeItem("token");
    }
  };

  registerSocket();
  socket.on("connect", registerSocket);
  socket.on("booking-update", (data) => {
    console.log("booking-update", data);
  });

  return () => {
    socket.off("connect", registerSocket);
    socket.off("booking-update");
  };
}, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setRole("");
    setUser(null);
    setShowRegister(false);
    navigate("/login");
  };

  if (showRegister) {
    return <Register setShowRegister={setShowRegister} />;
  }

  if (!role) {
    return <Login setRole={setRole} setShowRegister={setShowRegister} />;
  }

  return (
    <ToastProvider>
      <CartProvider>
        <Navbar onLogout={handleLogout} />
        {role === 'provider' && <ProviderLocationManager />}
        <Routes>
          {/* Customer Routes */}
          {role === "user" && (
            <>
              <Route path="/" element={<User />} />
              <Route path="/bookings" element={<User />} />
              <Route path="/cart" element={<User />} />
              <Route path="/profile" element={<ProfilePage />} />
            </>
          )}
          
          {/* Provider Routes */}
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
          
          {/* Admin Routes */}
          {role === "admin" && (
            <>
              <Route path="/" element={<Admin />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/users" element={<Admin />} />
              <Route path="/admin/services" element={<Admin />} />
              <Route path="/admin/bookings" element={<Admin />} />
              <Route path="/admin/payments" element={<Admin />} />
              <Route path="/profile" element={<ProfilePage />} />
            </>
          )}

          {/* Fallback */}
          <Route path="*" element={role === "user" ? <User /> : role === "provider" ? <Provider /> : <Admin />} />
        </Routes>
      </CartProvider>
      <ToastContainer />
    </ToastProvider>
  );
}
