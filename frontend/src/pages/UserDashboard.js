import { useEffect, useState } from "react";
import api from "../api";
import socket from "../socket";
import LiveMap from "../components/LiveMap";
import LocationPickerLeaflet from "../components/LocationPickerLeaflet";
import Skeleton from "../components/Skeleton";
import "../components/skeleton.css";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import "./UserDashboard.css";

export default function UserDashboard() {
  const { cart, loading: cartLoading, error: cartError, loadCart, addToCart, updateItem, removeItem, clearCart } = useCart();
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [isCartCheckout, setIsCartCheckout] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [couponCode, setCouponCode] = useState("");
  const [paymentMethods, setPaymentMethods] = useState({ upiIds: [], qrCodes: [], bankAccounts: [], cardSupported: true, codSupported: true });
  const [addressDetails, setAddressDetails] = useState({});

  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [userReviews, setUserReviews] = useState([]);
  const [ratingBookingId, setRatingBookingId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [tipValue, setTipValue] = useState(0);
  const [bookingTip, setBookingTip] = useState(0);
  const [suggestedTip, setSuggestedTip] = useState(0);
  const [predictedPrice, setPredictedPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState("");
  
  // Live tracking state
  const [activeBooking, setActiveBooking] = useState(null);
  const [providerLocation, setProviderLocation] = useState(null);
  const [trackingProviderId, setTrackingProviderId] = useState(null);
  const [activeTab, setActiveTab] = useState("current");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = JSON.parse(atob(token.split(".")[1]));
        setUser(decoded);
      } catch (err) {
        console.error("Error decoding token:", err);
      }
    }
    loadServices();
    loadBookings();
    loadUserReviews();
    loadPaymentMethods();
    socket.on("booking-update", (data) => {
      // if the update concerns the current user's bookings, refresh and show brief alert
      try {
        if (data && data.bookingId) {
          // optimistic UX: show immediate message
          if (data.status === "on_the_way" || data.status === "accepted" || data.status === "reassigned") {
            addToast(`Booking ${data.bookingId}: ${data.status}${data.etaMinutes ? ` — ETA ${data.etaMinutes} mins` : ""}`, "info");
          } else if (data.status === "rejected" || data.status === "no_provider") {
            addToast(`Booking ${data.bookingId}: ${data.status}. We'll try to reassign.`, "warning");
          }
        }
      } catch (e) {
        console.error(e);
      }
      loadBookings();
      loadUserReviews();
      loadCart();
    });
    socket.on("providerLocationUpdate", (data) => {
      const currentProviderId = trackingProviderId ? trackingProviderId.toString() : null;
      const eventProviderId = data?.providerId ? data.providerId.toString() : null;
      if (eventProviderId && eventProviderId === currentProviderId) {
        setProviderLocation({ lat: data.lat, lng: data.lng });
      }
    });
    socket.on("payment-config-updated", () => {
      loadPaymentMethods();
      addToast("Payment channels were updated", "info");
    });
    socket.on("booking-completed", async (data) => {
      try {
        const token = localStorage.getItem('token');
        let currentUserId = null;
        if (token) {
          try { currentUserId = JSON.parse(atob(token.split('.')[1])).id; } catch(e){}
        }
        if (!data || !data.bookingId) return;
        // if this event is for me
        if (data.userId && currentUserId && data.userId.toString() === currentUserId.toString()) {
          addToast('Your service work has been marked completed. Please rate the provider.', 'info');
          const confirm = window.confirm('Work is completed. Would you like to give a rating now?');
          if (!confirm) return;
          let rating = parseInt(window.prompt('Rate the provider from 1 (worst) to 5 (best):', '5') || '5', 10);
          if (!rating || rating < 1 || rating > 5) rating = 5;
          const suggested = data.predictedTip || 0;
          let tipInput = window.prompt(`Suggested tip: ${suggested}. Enter tip amount to give (or leave blank):`, `${suggested}`);
          let tipAmount = tipInput ? Number(tipInput) : 0;
          if (isNaN(tipAmount)) tipAmount = 0;
          await api.post('/reviews', { bookingId: data.bookingId, rating, tipAmount, feedback: '' });
          addToast('Thank you for your feedback!', 'success');
          loadBookings();
        }
      } catch (err) {
        console.error('Error handling booking-completed:', err);
      }
    });
    return () => {
      socket.off("booking-update");
      socket.off("providerLocationUpdate");
      socket.off("payment-config-updated");
      socket.off("booking-completed");
    };
  }, [trackingProviderId]);
  const { addToast } = useToast();

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const response = await api.get("/services");
      setServices(response.data);
    } catch (err) {
      console.error("Error loading services:", err);
    } finally {
      setServicesLoading(false);
    }
  };

  const loadBookings = async () => {
    try {
      const response = await api.get("/bookings/my-bookings");
      setBookings(response.data);
    } catch (err) {
      console.error("Error loading bookings:", err);
    }
  };

  const loadUserReviews = async () => {
    try {
      const response = await api.get("/reviews/user");
      setUserReviews(response.data || []);
    } catch (err) {
      console.error("Error loading user reviews:", err);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const response = await api.get("/admin-payments/config");
      const methods = {
        upiIds: response.data?.upiIds || [],
        qrCodes: response.data?.qrCodes || [],
        bankAccounts: response.data?.bankAccounts || [],
        cardSupported: response.data?.cardSupported ?? true,
        codSupported: response.data?.codSupported ?? true
      };
      setPaymentMethods(methods);
      const availableMethods = [
        ...(methods.upiIds?.filter((m) => m.enabled !== false).length ? ["upi"] : []),
        ...(methods.bankAccounts?.filter((m) => m.enabled !== false).length ? ["bank"] : []),
        ...(methods.qrCodes?.filter((m) => m.enabled !== false).length ? ["qr"] : []),
        ...(methods.cardSupported ? ["card"] : []),
        ...(methods.codSupported ? ["cod"] : [])
      ];
      if (!availableMethods.includes(paymentMethod)) {
        setPaymentMethod(availableMethods[0] || "wallet");
      }
    } catch (err) {
      console.error("Error loading payment methods:", err);
    }
  };

  const fetchPredictedPrice = async (service) => {
    if (!service) return null;
    setPriceLoading(true);
    try {
      const response = await api.post("/services/recommend-price", {
        serviceName: service.name,
        serviceCategory: service.category || "",
        serviceBasePrice: Number(service.basePrice || 0),
        serviceRating: Number(service.rating || 4.5),
        providerRating: Number(service.rating || 4.5),
        customerUrgency: 5,
        servicePopularity: Number(service.popularityScore || service.popularity || 50)
      });
      return Number(response.data?.predictedPrice || service.basePrice || 0);
    } catch (err) {
      console.error("Error fetching predicted price:", err);
      return Number(service.basePrice || 0);
    } finally {
      setPriceLoading(false);
    }
  };

  const fetchTipRecommendation = async (baseAmount, serviceRating, method) => {
    if (!baseAmount) return 0;
    setTipLoading(true);
    try {
      const response = await api.get("/payments/tip-recommendation", {
        params: {
          baseAmount: Number(baseAmount || 0),
          serviceRating: Number(serviceRating || 4.5),
          paymentMethod: method || paymentMethod,
          urgencyScore: 5
        }
      });
      return Number(response.data?.recommendTip || 0);
    } catch (err) {
      console.error("Error fetching tip recommendation:", err);
      return 0;
    } finally {
      setTipLoading(false);
    }
  };

  const handleBooking = async (service) => {
    setSelectedService(service);
    setIsCartCheckout(false);
    setPaymentMethod("upi");
    setBookingTip(0);
    setSuggestedTip(0);
    setPredictedPrice(null);

    const predicted = await fetchPredictedPrice(service);
    setPredictedPrice(predicted);
    const tip = await fetchTipRecommendation(predicted || service.basePrice || 0, service.rating || 4.5, "upi");
    setSuggestedTip(tip);
    setBookingTip(tip);
    setShowPayment(true);
  };

  const handleAddToCart = async (service) => {
    try {
      await addToCart({ serviceId: service._id, quantity: 1, price: service.basePrice, description: service.name });
      addToast(`${service.name} added to cart`, "success");
    } catch (err) {
      console.error("Error adding to cart:", err);
      addToast("Could not add service to cart", "error");
    }
  };

  const [gpsLoading, setGpsLoading] = useState(false);
  const requestCurrentLocation = async () => {
    if (coordinates?.lat && coordinates?.lng) {
      return coordinates;
    }

    if (!navigator.geolocation) {
      addToast("Geolocation not supported by this browser", "error");
      throw new Error("Geolocation not available");
    }

    setGpsLoading(true);
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const nextCoordinates = { lat, lng };
          setCoordinates(nextCoordinates);

          try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (res.ok) {
              const data = await res.json();
              const addr = data.address || {};
              const full = data.display_name || `${lat}, ${lng}`;
              const details = {
                street: addr.road || addr.neighbourhood || addr.suburb || addr.village || addr.hamlet || "",
                area: addr.suburb || addr.neighbourhood || "",
                city: addr.city || addr.town || addr.village || addr.county || "",
                state: addr.state || "",
                postalCode: addr.postcode || "",
                fullAddress: full
              };
              setLocation(details.fullAddress);
              setAddressDetails(details);
            } else {
              setLocation(`${lat}, ${lng}`);
            }
          } catch (e) {
            console.warn("Reverse geocode failed:", e);
            setLocation(`${lat}, ${lng}`);
          }

          try {
            await api.put("/auth/update-location", { latitude: lat, longitude: lng, address: "" });
          } catch (e) {
            console.warn("Failed to save user location:", e?.response?.data || e.message || e);
          }

          setGpsLoading(false);
          resolve(nextCoordinates);
        },
        (err) => {
          console.warn("Geolocation error:", err);
          setGpsLoading(false);
          addToast("Location permission denied or unavailable. Choose location from suggestions.", "error");
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  };

  const handlePaymentSuccess = async () => {
    try {
      if (!coordinates) {
        addToast("Select or allow location first", "error");
        return;
      }
      const payload = {
        location,
        coordinates,
        locationDetails: addressDetails,
        paymentMethod,
        couponCode: couponCode || undefined
      };

      if (!isCartCheckout) {
        payload.serviceId = selectedService?._id;
        payload.servicePrice = Number(predictedPrice || selectedService?.basePrice || 499);
        payload.tip = Number(bookingTip || 0);
        payload.transactionId = paymentMethod !== "cod" ? `TX-${Date.now()}` : null;
      }

      const endpoint = isCartCheckout ? "/cart/checkout" : "/bookings/book";
      const response = await api.post(endpoint, payload);

      if (response.data) {
        addToast("Booking created successfully!", "success");
        setShowPayment(false);
        setSelectedService(null);
        setIsCartCheckout(false);
        setLocation("");
        setCoordinates(null);
        setShowQR(false);
        setCouponCode("");
        setPredictedPrice(null);
        setSuggestedTip(0);
        setBookingTip(0);
        loadBookings();
        loadCart();
      }
    } catch (err) {
      console.error("Error creating booking:", err);
      addToast(err.response?.data?.error || "Failed to create booking", "error");
    }
  };

  useEffect(() => {
    if (!isCartCheckout && selectedService && predictedPrice !== null) {
      fetchTipRecommendation(predictedPrice, selectedService.rating || 4.5, paymentMethod)
        .then((tip) => {
          setSuggestedTip(tip);
          setBookingTip(tip);
        })
        .catch(() => {
          setSuggestedTip(0);
        });
    }
  }, [isCartCheckout, selectedService, predictedPrice, paymentMethod]);

  const cancelBooking = async (bookingId) => {
    try {
      await api.put(`/bookings/status/${bookingId}`, { status: "cancelled" });
      loadBookings();
    } catch (err) {
      console.error("Error cancelling booking:", err);
    }
  };

  const handleTrackBooking = (booking) => {
    setActiveBooking(booking);
    setTrackingProviderId(booking.providerId?._id || booking.providerId);
    setShowMap(true);
  };

  const getServiceIcon = (serviceName) => {
    const icons = {
      'Plumber': '🔧',
      'Electrician': '⚡',
      'AC Repair': '❄️',
      'Carpenter': '🪵',
      'House Cleaning': '🧹',
      'Painting': '🎨',
      'Pest Control': '🐛',
      'Gardening': '🌱',
      'Appliance Repair': '🔌',
      'Moving & Packing': '📦'
    };
    return icons[serviceName] || '🔧';
  };

  const filteredServices = services.filter(service => 
    service.name.toLowerCase().includes(search.toLowerCase()) ||
    service.category?.toLowerCase().includes(search.toLowerCase())
  );

  const activeStatuses = ["accepted", "on_the_way", "started", "assigned"];
  const reviewedBookingIds = new Set(userReviews.map((review) => review.bookingId?.toString()));
  const currentBooking = bookings
    .filter((booking) => activeStatuses.includes(booking.status))
    .sort((a, b) => {
      const statusPriority = { started: 4, on_the_way: 3, accepted: 2, assigned: 1 };
      const priorityA = statusPriority[a.status] || 0;
      const priorityB = statusPriority[b.status] || 0;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })[0] || null;
  const historyBookings = bookings
    .filter((booking) => booking._id !== currentBooking?._id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const openReviewPrompt = (booking) => {
    setRatingBookingId(booking._id);
    setRatingValue(5);
    setTipValue(booking.tipSuggestion || 0);
    setFeedbackValue("");
  };

  const submitReview = async () => {
    if (!ratingBookingId) return;
    try {
      await api.post("/reviews", {
        bookingId: ratingBookingId,
        rating: ratingValue,
        tipAmount: tipValue,
        feedback: feedbackValue
      });
      addToast("Review submitted successfully", "success");
      setRatingBookingId(null);
      loadUserReviews();
      loadBookings();
    } catch (err) {
      console.error("Error submitting review:", err);
      addToast(err.response?.data?.error || "Failed to submit review", "error");
    }
  };

  return (
    <div className="dashboard-container">

      {/* Immediate accepted booking banner */}
      {bookings && bookings.find(b => b.status === 'accepted' || b.status === 'on_the_way') && (
        (() => {
          const active = bookings.find(b => b.status === 'accepted' || b.status === 'on_the_way');
          return (
            <div className="accepted-banner">
              <strong>Provider accepted your booking</strong>
              <div>{active.serviceName || active.serviceId?.name} • {active.providerId?.name || 'Provider'}</div>
              {active.etaMinutes ? <div>ETA: {active.etaMinutes} mins</div> : null}
              <button className="btn btn-primary" onClick={() => { setActiveBooking(active); setTrackingProviderId(active.providerId?._id || active.providerId); setShowMap(true); }}>Track</button>
            </div>
          );
        })()
      )}

      {/* Header */}
      <header className="header">
        <h1 className="logo">FASTAID</h1>
        <div className="account-info">
          <div className="welcome-group">
            <span className="welcome-text">Welcome, {user?.name || 'User'} 👋</span>
            <div className="dashboard-nav">
              <button className={`tab-btn ${activeTab === 'current' ? 'active' : ''}`} onClick={() => setActiveTab('current')}>
                Current
              </button>
              <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                History
              </button>
            </div>
          </div>
          <button className="logout-btn" onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/";
          }}>
            Logout
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <h2>Find Trusted Services Near You</h2>
        <p>
          FASTAID connects you with verified professionals for health, home,
          vehicle, tech and more — quickly and securely.
        </p>

        {/* Trust Badges */}
        <div className="badges">
          <span className="badge">✔ Verified</span>
          <span className="badge">🔒 Secure</span>
          <span className="badge">⚡ Fast Service</span>
        </div>

        {/* Search Box */}
        <div className="search-container">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search services like Plumber, Doctor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button>Search</button>
          </div>
        </div>

        <button className="category-btn">
          View All Categories
        </button>
      </section>

      {/* Popular Services */}
      <section className="services-section">
        <h3 className="section-title">Popular Services</h3>

        <div className="services-grid">
          {servicesLoading ? (
            <Skeleton count={6} height="120px" />
          ) : filteredServices.length > 0 ? (
            filteredServices.map((service) => (
              <div key={service._id} className="service-card">
                <div className="service-icon" style={{ fontSize: '40px', marginBottom: '10px' }}>
                  {getServiceIcon(service.name)}
                </div>
                <h4>{service.name}</h4>
                <p className="rating">⭐ {service.rating || '4.5'}</p>
                <p className="service-price">₹ {service.suggestedPrice || service.basePrice || 499}</p>
                <div className="service-actions">
                  <button className="btn btn-secondary" onClick={() => handleAddToCart(service)}>
                    Add to Cart
                  </button>
                  <button className="btn btn-primary" onClick={() => handleBooking(service)}>
                    Book Now
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <div className="empty-state-icon">🔍</div>
              <h3>No services found</h3>
              <p>Try a different search term</p>
            </div>
          )}
        </div>
      </section>

      {/* Cart Section */}
      <section className="cart-section">
        <h3 className="section-title">Your Cart</h3>
        {cartLoading ? (
          <Skeleton count={3} height="60px" />
        ) : cart?.items?.length > 0 ? (
          <div className="cart-grid">
            <div className="cart-items">
              {cart.items.map((item) => (
                <div key={item._id} className="cart-card">
                  <div>
                    <h4>{item.serviceName}</h4>
                    <p>Price: ₹{item.price}</p>
                    <p>Qty: {item.quantity}</p>
                    <div className="cart-actions">
                      <button className="btn btn-small" onClick={() => updateItem(item._id, { quantity: item.quantity + 1 })}>
                        +
                      </button>
                      <button className="btn btn-small" onClick={() => updateItem(item._id, { quantity: Math.max(1, item.quantity - 1) })}>
                        -
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => removeItem(item._id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <p>Item total: ₹{cart.subtotal || 0}</p>
              <p>Tax: ₹{cart.tax || 0}</p>
              <p>Platform fee: ₹{cart.platformFee || 0}</p>
              <p>Service charge: ₹{cart.serviceCharge || 0}</p>
              <p>Discount: -₹{cart.discount || 0}</p>
              <h4>Grand total: ₹{cart.total || 0}</h4>
              <button className="btn btn-primary" onClick={() => {
                if (cart.items.length) {
                  setSelectedService(null);
                  setIsCartCheckout(true);
                  setShowPayment(true);
                }
              }}>
                Checkout Cart
              </button>
              <button className="btn btn-secondary" onClick={clearCart}>
                Clear Cart
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <h3>Cart is empty</h3>
            <p>Add services to your cart from the list above.</p>
          </div>
        )}
      </section>

      {/* My Bookings Section */}
      <section className="bookings-section">
        <div className="bookings-header">
          <div>
            <h3 className="bookings-title">My Bookings</h3>
            <p className="bookings-subtitle">Only your active service is shown here. Browse history for past bookings.</p>
          </div>
          <div className="bookings-tabs">
            <button className={`tab-btn ${activeTab === 'current' ? 'active' : ''}`} onClick={() => setActiveTab('current')}>
              Current Service
            </button>
            <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
              History
            </button>
          </div>
        </div>

        {activeTab === 'current' ? (
          currentBooking ? (
            <div className="current-card">
              <div className="current-card-header">
                <div>
                  <h4>{currentBooking.serviceName || currentBooking.serviceId?.name}</h4>
                  <span className={`status-badge status-${currentBooking.status}`}>{currentBooking.status}</span>
                </div>
                <div className="current-amount">₹{currentBooking.servicePrice || currentBooking.amount || 0}</div>
              </div>

              <div className="current-details">
                <p><strong>Customer:</strong> {user?.name || 'You'}</p>
                {currentBooking.providerId && <p><strong>Provider:</strong> {currentBooking.providerId.name || currentBooking.providerId}</p>}
                <p><strong>Location:</strong> {currentBooking.location || currentBooking.locationDetails?.fullAddress || 'Not set'}</p>
                <p><strong>Payment:</strong> {currentBooking.paymentStatus}</p>
                {currentBooking.etaMinutes ? <p><strong>ETA:</strong> {currentBooking.etaMinutes} mins</p> : null}
              </div>

              <div className="current-actions">
                {currentBooking.providerId && currentBooking.status !== 'completed' && currentBooking.status !== 'cancelled' && (
                  <button className="btn btn-primary" onClick={() => handleTrackBooking(currentBooking)}>
                    Track Provider
                  </button>
                )}
                {['pending', 'assigned'].includes(currentBooking.status) && (
                  <button className="cancel-btn" onClick={() => cancelBooking(currentBooking._id)}>
                    Cancel Booking
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🚀</div>
              <h3>No active service</h3>
              <p>Book a service to get fast help. Your active booking will appear here.</p>
            </div>
          )
        ) : (
          historyBookings.length > 0 ? (
            <div className="services-grid">
              {historyBookings.map((booking) => (
                <div key={booking._id} className="booking-card history-card">
                  <div className="booking-info">
                    <h4>{booking.serviceName || booking.serviceId?.name}</h4>
                    <p>📍 {booking.location || booking.locationDetails?.fullAddress || 'Location pending'}</p>
                    <p>💰 Amount: ₹{booking.servicePrice || booking.amount || 0}</p>
                    <p>🕒 {new Date(booking.createdAt).toLocaleString()}</p>
                    <p>🧾 Status: {booking.status}</p>
                    {booking.providerId && <p>👷 Provider: {booking.providerId.name || booking.providerId}</p>}
                  </div>
                  <div className="booking-actions history-actions">
                    {booking.status === 'completed' && !reviewedBookingIds.has(booking._id?.toString()) && (
                      <button className="btn btn-primary btn-small" onClick={() => openReviewPrompt(booking)}>
                        Rate & Tip
                      </button>
                    )}
                    {booking.status === 'completed' && reviewedBookingIds.has(booking._id?.toString()) && (
                      <span className="reviewed-tag">Reviewed</span>
                    )}
                    {booking.tipSuggestion > 0 && booking.status === 'completed' && (
                      <div className="tip-suggestion">Suggested tip: ₹{booking.tipSuggestion}</div>
                    )}
                    {booking.providerId && booking.status !== 'completed' && booking.status !== 'cancelled' && (
                      <button className="btn btn-secondary btn-small" onClick={() => handleTrackBooking(booking)}>
                        Track
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <h3>Booking history is empty</h3>
              <p>All your past bookings will be stored here for easy access.</p>
            </div>
          )
        )}
      </section>

      {showMap && activeBooking && (
        <section className="tracking-section">
          <div className="tracking-card">
            <h3>Live tracking for {activeBooking.serviceName}</h3>
            <p>Status: <strong>{activeBooking.status}</strong></p>
            <LiveMap providerLocation={providerLocation} providerId={trackingProviderId} bookingId={activeBooking?._id || activeBooking?.id} />
            <button className="btn btn-secondary" onClick={() => setShowMap(false)}>
              Close Tracking
            </button>
          </div>
        </section>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="payment-modal">
          <div className="payment-content">
            <h3>{isCartCheckout ? "Cart Checkout" : `Booking: ${selectedService?.name}`}</h3>
            <p className="modal-subtitle">Pay securely with trusted checkout options</p>
            {!showQR ? (
              <>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <p className="form-help-text">
                    First detect your current location for fast accuracy, then refine the address manually if needed.
                  </p>
                  <LocationPickerLeaflet
                    value={location}
                    onChange={(val) => {
                      setLocation(typeof val === "string" ? val : val.display || location);
                      setCoordinates(null);
                    }}
                    onAddressSelect={(details) => {
                      setAddressDetails(details);
                      setLocation(`${details.street || ""} ${details.city || ""} ${details.state || ""}`.trim());
                    }}
                    coordinates={coordinates}
                    onCoordinatesChange={(coords) => {
                      setCoordinates(coords);
                    }}
                    placeholder="Enter your city or street"
                    maxSuggestions={8}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="form-select"
                  >
                    {paymentMethods.upiIds?.filter((m) => m.enabled !== false).length > 0 && <option value="upi">UPI</option>}
                    {paymentMethods.qrCodes?.filter((m) => m.enabled !== false).length > 0 && <option value="qr">QR Code</option>}
                    {paymentMethods.bankAccounts?.filter((m) => m.enabled !== false).length > 0 && <option value="bank">Bank Transfer</option>}
                    {paymentMethods.cardSupported && <option value="card">Credit/Debit Card</option>}
                    {paymentMethods.codSupported && <option value="cod">Cash on Delivery</option>}
                    <option value="wallet">Wallet</option>
                  </select>
                </div>

                {isCartCheckout && (
                  <div className="checkout-summary">
                    <h4>Order Summary</h4>
                    <div className="checkout-items">
                      {cart.items.map((item) => (
                        <div key={item._id} className="checkout-item">
                          <span>{item.serviceName} x{item.quantity}</span>
                          <span>₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <div className="checkout-total">
                      <strong>Total:</strong> ₹{cart.total || 0}
                    </div>
                  </div>
                )}

                <div className="payment-sources">
                  {paymentMethod === "upi" && (
                    <div className="payment-source">
                      <h4>UPI IDs</h4>
                      {paymentMethods.upiIds?.filter((m) => m.enabled !== false).length ? paymentMethods.upiIds.filter((m) => m.enabled !== false).map((upi, index) => (
                        <p key={index}>{upi.label || "UPI"}: {upi.value}</p>
                      )) : <p>No UPI IDs configured.</p>}
                    </div>
                  )}

                  {paymentMethod === "bank" && (
                    <div className="payment-source">
                      <h4>Bank Transfer</h4>
                      {paymentMethods.bankAccounts?.filter((m) => m.enabled !== false).length ? paymentMethods.bankAccounts.filter((m) => m.enabled !== false).map((bank, index) => (
                        <p key={index}>{bank.bankName}: {bank.accountName} / {bank.ifsc}</p>
                      )) : <p>No bank accounts configured.</p>}
                    </div>
                  )}

                  {paymentMethod === "qr" && (
                    <div className="payment-source">
                      <h4>QR Codes</h4>
                      {paymentMethods.qrCodes?.filter((m) => m.enabled !== false).length ? paymentMethods.qrCodes.filter((m) => m.enabled !== false).map((qr, index) => (
                        <img key={index} src={`http://localhost:5000${qr.url}`} alt={qr.label} className="payment-qr-image" />
                      )) : <p>No QR codes configured.</p>}
                    </div>
                  )}

                  {paymentMethod === "cod" && (
                    <div className="payment-source">
                      <h4>Cash on Delivery</h4>
                      <p>Please pay the provider in cash at the time of service.</p>
                    </div>
                  )}
                </div>

                {!isCartCheckout && selectedService && (
                  <div className="pricing-summary">
                    <div className="pricing-row">
                      <span>Predicted service price</span>
                      <strong>₹{Number(predictedPrice ?? selectedService?.basePrice ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="pricing-row">
                      <span>Recommended tip</span>
                      <strong>₹{Number(suggestedTip ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Your tip amount</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        value={bookingTip}
                        onChange={(e) => setBookingTip(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Coupon Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                </div>

                <div className="payment-buttons">
                  <button
                    className="pay-btn"
                    onClick={async () => {
                      try {
                        await requestCurrentLocation();
                        if (paymentMethod === "qr") {
                          setShowQR(true);
                          return;
                        }
                        await handlePaymentSuccess();
                      } catch (err) {
                        console.error("Payment process halted:", err);
                      }
                    }}
                    disabled={gpsLoading}
                  >
                    {gpsLoading ? "Locating..." : "Continue"}
                  </button>
                  <button className="close-btn" onClick={() => {
                    setShowPayment(false);
                    setSelectedService(null);
                    setIsCartCheckout(false);
                    setLocation("");
                    setShowQR(false);
                  }}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="payment-qr-list">
                  {paymentMethods.qrCodes
  ?.filter(
    (q) => q.enabled !== false
  )
  ?.length ? (
                    paymentMethods.qrCodes
.filter(
  (q) => q.enabled !== false
)
.map((qr, index) => (
                      <div key={index} className="payment-qr-card">
                        <img src={`http://localhost:5000${qr.url}`} alt={qr.label} className="payment-qr-image" />
                        <p>{qr.label}</p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p>No QR codes are configured yet.</p>
                    </div>
                  )}
                </div>
                <p className="qr-help-text">
                  Scan one of the merchant QR codes from your UPI app and confirm the payment.
                </p>
                <div className="payment-buttons">
                  <button className="pay-btn" onClick={handlePaymentSuccess}>
                    ✓ Payment Done
                  </button>
                  <button className="close-btn" onClick={() => setShowQR(false)}>
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {ratingBookingId && (
        <div className="payment-modal">
          <div className="payment-content">
            <h3>Rate your provider</h3>
            <p>Thank you for reviewing the completed service.</p>
            <div className="form-group">
              <label className="form-label">Rating</label>
              <select
                value={ratingValue}
                onChange={(e) => setRatingValue(Number(e.target.value))}
                className="form-select"
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>{value} Star{value > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tip Amount</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={tipValue}
                onChange={(e) => setTipValue(Number(e.target.value))}
              />
              {tipValue === 0 && <small>Tip is optional.</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Feedback</label>
              <textarea
                className="form-input"
                rows="3"
                value={feedbackValue}
                onChange={(e) => setFeedbackValue(e.target.value)}
                placeholder="Leave comments for the provider"
              />
            </div>
            <div className="payment-buttons">
              <button className="pay-btn" onClick={submitReview}>
                Submit Review
              </button>
              <button className="close-btn" onClick={() => setRatingBookingId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
