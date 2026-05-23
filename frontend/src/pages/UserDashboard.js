import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import getSocket from "../socket";
import { decodeJwt } from "../utils/token";
import LiveMap from "../components/LiveMap";
import LocationPickerLeaflet from "../components/LocationPickerLeaflet";
import Skeleton from "../components/Skeleton";

const API_BASE_URL = process.env.REACT_APP_API_URL;
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
  const [transactionId, setTransactionId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [paymentMethods, setPaymentMethods] = useState({ upiIds: [], qrCodes: [], bankAccounts: [], cardSupported: true, codSupported: true });
  const [addressDetails, setAddressDetails] = useState({});
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const selectedAddress = savedAddresses.find((addr) => addr.id === selectedAddressId);

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
  const [cartProcessingIds, setCartProcessingIds] = useState(new Set());

  const loadSavedAddresses = () => {
    const raw = localStorage.getItem("fastaid_saved_addresses");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSavedAddresses(parsed);
        const active = parsed.find((addr) => addr.id === selectedAddressId) || parsed[0];
        if (active) {
          setSelectedAddressId(active.id);
          setLocation(active.fullAddress || active.address || "");
          setAddressDetails(active.details || {});
          setCoordinates(active.coordinates || null);
        }
      }
    } catch (e) {
      console.warn("Failed to load saved addresses", e);
    }
  };

  const persistSavedAddresses = (addresses) => {
    localStorage.setItem("fastaid_saved_addresses", JSON.stringify(addresses));
    setSavedAddresses(addresses);
  };

  const handleSelectAddress = (id) => {
    const next = savedAddresses.find((addr) => addr.id === id);
    if (!next) return;
    setSelectedAddressId(id);
    setLocation(next.fullAddress || next.address || "");
    setAddressDetails(next.details || {});
    setCoordinates(next.coordinates || null);
    setIsAddingAddress(false);
  };

  const handleSaveAddress = () => {
    if (!location?.trim()) {
      addToast("Enter a valid address before saving.", "error");
      return;
    }
    const nextAddress = {
      id: `${Date.now()}`,
      label: newAddressLabel || "Home",
      fullAddress: location,
      details: addressDetails,
      coordinates: coordinates || null,
    };
    const nextList = [nextAddress, ...savedAddresses.filter((addr) => addr.id !== nextAddress.id)];
    persistSavedAddresses(nextList);
    setSelectedAddressId(nextAddress.id);
    setIsAddingAddress(false);
    addToast("Address saved successfully.", "success");
  };

  useEffect(() => {
    // Prevent background scroll when payment modal is open
    if (showPayment) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [showPayment]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = decodeJwt(token);
      if (decoded) {
        setUser(decoded);
      }
    }
    loadServices();
    loadBookings();
    loadUserReviews();
    loadPaymentMethods();
    loadSavedAddresses();
    getSocket().on("booking-update", (data) => {
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
    getSocket().on("providerLocationUpdate", (data) => {
      const currentProviderId = trackingProviderId ? trackingProviderId.toString() : null;
      const eventProviderId = data?.providerId ? data.providerId.toString() : null;
      if (eventProviderId && eventProviderId === currentProviderId) {
        setProviderLocation({ lat: data.lat, lng: data.lng });
      }
    });
    getSocket().on("payment-config-updated", () => {
      loadPaymentMethods();
      addToast("Payment channels were updated", "info");
    });
    getSocket().on("payment-reviewed", async (data) => {
      try {
        const token = localStorage.getItem('token');
        const decoded = decodeJwt(token);
        const currentUserId = decoded?.id || null;
        if (data?.userId && currentUserId && data.userId.toString() === currentUserId.toString()) {
          addToast(`Payment ${data.status} for booking ${data.bookingId || ''}`, data.status === 'paid' ? 'success' : 'error');
          loadBookings();
        }
      } catch (err) {
        console.error('Error handling payment-reviewed event:', err);
      }
    });
    getSocket().on("booking-completed", async (data) => {
      try {
        const token = localStorage.getItem('token');
        const decoded = decodeJwt(token);
        const currentUserId = decoded?.id || null;
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
      getSocket().off("booking-update");
      getSocket().off("providerLocationUpdate");
      getSocket().off("payment-config-updated");
      getSocket().off("booking-completed");
    };
  }, [trackingProviderId]);

  useEffect(() => {
    if (!showMap || !trackingProviderId) return;

    getSocket().emit("get-provider-location", { providerId: trackingProviderId }, (loc) => {
      if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
        setProviderLocation({ lat: loc.latitude, lng: loc.longitude, updatedAt: loc.timestamp });
      }
    });
  }, [showMap, trackingProviderId]);

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
      if (!isCartCheckout && !selectedService) {
        addToast("Select a service before checkout", "error");
        return;
      }

      const payload = {
        location,
        coordinates,
        locationDetails: addressDetails,
        paymentMethod,
        couponCode: couponCode || undefined,
        transactionId: transactionId || (paymentMethod !== "cod" ? `TX-${Date.now()}` : null),
        transactionNote: paymentNote || undefined,
        proofImage: proofUrl || undefined
      };

      if (!isCartCheckout) {
        payload.serviceId = selectedService?._id;
        payload.servicePrice = Number(predictedPrice || selectedService?.basePrice || 499);
        payload.tip = Number(bookingTip || 0);
      }

      const endpoint = isCartCheckout ? "/cart/checkout" : "/bookings/book";
      const response = await api.post(endpoint, payload);

      if (response.data) {
        let nextStatusMessage = "Booking placed successfully.";
        if (paymentMethod === "wallet") {
          nextStatusMessage = "Booking confirmed using wallet balance.";
        } else if (paymentMethod === "cod") {
          nextStatusMessage = "Booking placed for cash-on-delivery.";
        } else if (paymentMethod === "upi") {
          nextStatusMessage = "Booking placed. Complete the payment using your UPI app.";
        } else if (paymentMethod === "qr") {
          nextStatusMessage = "Booking placed. Scan the QR code and complete payment.";
        } else if (paymentMethod === "manual") {
          nextStatusMessage = "Booking placed. Your payment proof is pending admin approval.";
        } else {
          nextStatusMessage = "Booking placed and awaiting payment verification.";
        }

        addToast(nextStatusMessage, "success");
        setShowPayment(false);
        setSelectedService(null);
        setIsCartCheckout(false);
        setLocation("");
        setCoordinates(null);
        setShowQR(false);
        setCouponCode("");
        setTransactionId("");
        setPaymentNote("");
        setProofFile(null);
        setProofUrl("");
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

      {/* Header removed — navigation handled by main Navbar */}

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
              {cart.items.map((item) => {
                const itemId = item._id || item.id;
                const processing = cartProcessingIds.has(String(itemId));
                return (
                  <div key={itemId} className="cart-card">
                    <div>
                      <h4>{item.serviceName}</h4>
                      <p>Price: ₹{item.price}</p>
                      <p>Qty: {item.quantity}</p>
                      <div className="cart-actions">
                        <button
                          className="btn btn-small"
                          disabled={processing}
                          onClick={async () => {
                            try {
                              setCartProcessingIds((s) => new Set([...s, String(itemId)]));
                              await updateItem(itemId, { quantity: item.quantity + 1 });
                            } catch (e) {
                              console.error(e);
                            } finally {
                              setCartProcessingIds((s) => { const n = new Set(s); n.delete(String(itemId)); return n; });
                            }
                          }}
                        >
                          +
                        </button>

                        <button
                          className="btn btn-small"
                          disabled={processing}
                          onClick={async () => {
                            try {
                              setCartProcessingIds((s) => new Set([...s, String(itemId)]));
                              await updateItem(itemId, { quantity: Math.max(1, item.quantity - 1) });
                            } catch (e) {
                              console.error(e);
                            } finally {
                              setCartProcessingIds((s) => { const n = new Set(s); n.delete(String(itemId)); return n; });
                            }
                          }}
                        >
                          -
                        </button>

                        <button
                          className="btn btn-danger btn-small"
                          disabled={processing}
                          onClick={async () => {
                            try {
                              setCartProcessingIds((s) => new Set([...s, String(itemId)]));
                              await removeItem(itemId);
                            } catch (e) {
                              console.error(e);
                            } finally {
                              setCartProcessingIds((s) => { const n = new Set(s); n.delete(String(itemId)); return n; });
                            }
                          }}
                        >
                          {processing ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
          <div className="empty-state modern-empty">
            <div className="empty-state-icon">🛒</div>
            <h3>Your cart is waiting</h3>
            <p>Explore services and add them to your cart — checkout is fast and secure.</p>
            <button className="btn btn-primary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Browse Services</button>
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
            <LiveMap
              providerLocation={providerLocation}
              providerId={trackingProviderId}
              bookingId={activeBooking?._id || activeBooking?.id}
              customerLocation={activeBooking?.coordinates}
              provider={activeBooking?.providerId}
              serviceName={activeBooking?.serviceName}
            />
            <button className="btn btn-secondary" onClick={() => setShowMap(false)}>
              Close Tracking
            </button>
          </div>
        </section>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="payment-modal">
          <div className="payment-content modern-payment">
            <h3 className="payment-title">{isCartCheckout ? "Cart Checkout" : `Pay for: ${selectedService?.name || 'Service'}`}</h3>
            <p className="modal-subtitle">Secure payment — choose a method below to complete your order</p>
            {!showQR ? (
              <>
                <div className="payment-grid">
                  <aside className="payment-side summary-side">
                    <div className="payment-summary-card">
                      <div className="summary-top">
                        <div className="service-chip">{getServiceIcon(selectedService?.name)}</div>
                        <div>
                          <span className="summary-tag">{isCartCheckout ? "Cart Checkout" : "Order Summary"}</span>
                          <h4>{isCartCheckout ? `${cart.items.length} services selected` : selectedService?.name || "Service details"}</h4>
                          <p>{isCartCheckout ? "Confirm your cart items before checkout." : selectedService?.description || "Fast booking with secure payment."}</p>
                        </div>
                      </div>

                      <div className="summary-items">
                        {isCartCheckout ? (
                          cart.items.map((item) => (
                            <div key={item._id} className="summary-line">
                              <span>{item.serviceName} × {item.quantity}</span>
                              <strong>₹{item.price * item.quantity}</strong>
                            </div>
                          ))
                        ) : (
                          <>
                            <div className="summary-line">
                              <span>Base price</span>
                              <strong>₹{Number(selectedService?.basePrice || predictedPrice || 0).toFixed(2)}</strong>
                            </div>
                            <div className="summary-line">
                              <span>Suggested tip</span>
                              <strong>₹{Number(suggestedTip || 0).toFixed(2)}</strong>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="summary-divider" />

                      <div className="summary-total-row">
                        <span>Total</span>
                        <strong>₹{isCartCheckout ? (cart.total || 0) : Number(predictedPrice || selectedService?.basePrice || 0) + Number(bookingTip || 0)}</strong>
                      </div>
                    </div>

                    <div className="payment-card coupon-card">
                      <div className="card-header">
                        <span>Promo code</span>
                        <small>Apply instantly</small>
                      </div>
                      <input
                        type="text"
                        className="promo-input"
                        placeholder="Enter code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                      />
                    </div>

                    <div className="payment-card trust-card">
                      <div className="trust-icon">🔒</div>
                      <div>
                        <strong>Secure checkout</strong>
                        <p>256-bit encryption, trusted by thousands of customers.</p>
                      </div>
                    </div>
                  </aside>

                  <section className="payment-side form-side">
                    <div className="address-panel section-card">
                      <div className="section-header">
                        <span className="section-label">Delivery address</span>
                        <p className="section-description">Choose an existing address or add a new delivery location.</p>
                      </div>
                      {savedAddresses.length > 0 && (
                        <div className="address-cards">
                          {savedAddresses.map((addr) => (
                            <button
                              key={addr.id}
                              type="button"
                              className={`address-card ${selectedAddressId === addr.id ? "selected" : ""}`}
                              onClick={() => handleSelectAddress(addr.id)}
                            >
                              <div className="address-card-icon">🏠</div>
                              <div>
                                <p className="address-card-title">{addr.label}</p>
                                <p className="address-card-copy">{addr.fullAddress}</p>
                              </div>
                              <span className="address-badge">{selectedAddressId === addr.id ? "Selected" : "Select"}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`address-card add-new ${isAddingAddress ? "selected" : ""}`}
                            onClick={() => {
                              setIsAddingAddress(true);
                              setSelectedAddressId(null);
                              setNewAddressLabel("Home");
                            }}
                          >
                            <div className="address-card-icon">+</div>
                            <div>
                              <p className="address-card-title">Add new address</p>
                              <p className="address-card-copy">Create a new delivery location</p>
                            </div>
                          </button>
                        </div>
                      )}

                      {(!savedAddresses.length || isAddingAddress) && (
                        <div className="new-address-panel">
                          <div className="section-header">
                            <span className="section-label">Enter delivery location</span>
                            <p className="section-description">Search for your address or use the picker to set it precisely.</p>
                          </div>
                          <LocationPickerLeaflet
                            value={location}
                            onChange={(val) => {
                              setLocation(typeof val === "string" ? val : val.display || location);
                              setCoordinates(null);
                            }}
                            onAddressSelect={(details) => {
                              setAddressDetails(details);
                              setCoordinates(details.coordinates || null);
                              setLocation(`${details.street || ""} ${details.city || ""} ${details.state || ""}`.trim() || details.fullAddress || location);
                            }}
                            coordinates={coordinates}
                            onCoordinatesChange={(coords) => {
                              setCoordinates(coords);
                            }}
                            placeholder="Enter your street, city or area"
                            maxSuggestions={8}
                          />
                          <div className="form-group">
                            <label className="form-label">Address label</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Home, Work, Office"
                              value={newAddressLabel}
                              onChange={(e) => setNewAddressLabel(e.target.value)}
                            />
                          </div>
                          <div className="payment-buttons">
                            <button className="pay-btn" type="button" onClick={handleSaveAddress}>
                              Save address
                            </button>
                            <button className="close-btn" type="button" onClick={() => setIsAddingAddress(false)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="payment-step-pill">
                      <span className="step active">1</span>
                      <span className="step-text">Choose payment</span>
                    </div>

                    <div className="payment-section">
                      <div className="section-header">
                        <span className="section-label">Payment method</span>
                        <p className="section-description">Tap a method to continue with a fast checkout flow.</p>
                      </div>
                      <div className="payment-method-grid">
                        {paymentMethods.upiIds?.filter((m) => m.enabled !== false).length > 0 && (
                          <button type="button" className={`method-card ${paymentMethod === "upi" ? "active" : ""}`} onClick={() => setPaymentMethod("upi")}>UPI</button>
                        )}
                        {paymentMethods.qrCodes?.filter((m) => m.enabled !== false).length > 0 && (
                          <button type="button" className={`method-card ${paymentMethod === "qr" ? "active" : ""}`} onClick={() => setPaymentMethod("qr")}>QR Code</button>
                        )}
                        {paymentMethods.bankAccounts?.filter((m) => m.enabled !== false).length > 0 && (
                          <button type="button" className={`method-card ${paymentMethod === "bank" ? "active" : ""}`} onClick={() => setPaymentMethod("bank")}>Net Banking</button>
                        )}
                        {paymentMethods.cardSupported && (
                          <button type="button" className={`method-card ${paymentMethod === "card" ? "active" : ""}`} onClick={() => setPaymentMethod("card")}>Card</button>
                        )}
                        <button type="button" className={`method-card ${paymentMethod === "manual" ? "active" : ""}`} onClick={() => setPaymentMethod("manual")}>Manual</button>
                        {paymentMethods.codSupported && (
                          <button type="button" className={`method-card ${paymentMethod === "cod" ? "active" : ""}`} onClick={() => setPaymentMethod("cod")}>Cash</button>
                        )}
                        <button type="button" className={`method-card ${paymentMethod === "wallet" ? "active" : ""}`} onClick={() => setPaymentMethod("wallet")}>Wallet</button>
                      </div>
                    </div>

                    {selectedAddress && (
                      <div className="payment-section section-card">
                        <div className="section-header">
                          <span className="section-label">Selected delivery address</span>
                          <p className="section-description">This address will be used to assign the nearest provider and confirm your booking.</p>
                        </div>
                        <div className="summary-items">
                          <div className="detail-row">
                            <span>Delivery address</span>
                            <strong>{selectedAddress.fullAddress}</strong>
                          </div>
                          {selectedAddress.label && (
                            <div className="detail-row">
                              <span>Address label</span>
                              <strong>{selectedAddress.label}</strong>
                            </div>
                          )}
                        </div>
                        <div className="payment-buttons">
                          <button className="close-btn" type="button" onClick={() => setIsAddingAddress(true)}>
                            Change address
                          </button>
                          <button className="pay-btn" type="button" onClick={() => setIsAddingAddress(true)}>
                            Edit / add address
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="payment-section payment-method-details">
                      {paymentMethod === "upi" && (
                        <>
                          <h4 className="detail-title">UPI IDs</h4>
                          <p className="detail-copy">Scan or copy any of these UPI handles to complete payment.</p>
                          {paymentMethods.upiIds?.filter((m) => m.enabled !== false).length ? paymentMethods.upiIds.filter((m) => m.enabled !== false).map((upi, index) => (
                            <div key={index} className="detail-row"><span>{upi.label || "UPI"}</span><strong>{upi.value}</strong></div>
                          )) : <p className="note-text">No UPI IDs configured.</p>}
                        </>
                      )}

                      {paymentMethod === "qr" && (
                        <>
                          <h4 className="detail-title">Scan QR Code</h4>
                          <p className="detail-copy">Use your payment app to scan one of the QR codes below.</p>
                          {paymentMethods.qrCodes?.filter((m) => m.enabled !== false).length ? (
                            <div className="payment-qr-list">
                              {paymentMethods.qrCodes.filter((m) => m.enabled !== false).map((qr, index) => (
                                <div key={index} className="payment-qr-card modern-qr-card">
                                  <img src={`${API_BASE_URL}${qr.url}`} alt={qr.label} className="payment-qr-image" />
                                  <strong>{qr.label}</strong>
                                </div>
                              ))}
                            </div>
                          ) : <p className="note-text">No QR codes configured.</p>}
                        </>
                      )}

                      {paymentMethod === "bank" && (
                        <>
                          <h4 className="detail-title">Bank Transfer</h4>
                          <p className="detail-copy">Transfer funds and add the transaction ID below.</p>
                          {paymentMethods.bankAccounts?.filter((m) => m.enabled !== false).length ? paymentMethods.bankAccounts.filter((m) => m.enabled !== false).map((bank, index) => (
                            <div key={index} className="detail-row"><span>{bank.bankName}</span><strong>{bank.accountName} / {bank.ifsc}</strong></div>
                          )) : <p className="note-text">No bank details configured.</p>}
                        </>
                      )}

                      {paymentMethod === "card" && (
                        <>
                          <h4 className="detail-title">Card Payment</h4>
                          <p className="detail-copy">Proceed with your card details and enter the reference once complete.</p>
                        </>
                      )}

                      {paymentMethod === "manual" && (
                        <>
                          <h4 className="detail-title">Manual Payment</h4>
                          <p className="detail-copy">Upload proof of payment and wait while admin reviews the request.</p>
                        </>
                      )}

                      {paymentMethod === "cod" && (
                        <>
                          <h4 className="detail-title">Cash on Delivery</h4>
                          <p className="detail-copy">Pay the provider in cash after the service is completed.</p>
                        </>
                      )}

                      {paymentMethod === "wallet" && (
                        <>
                          <h4 className="detail-title">Wallet Checkout</h4>
                          <p className="detail-copy">Your wallet balance will be used automatically if available.</p>
                        </>
                      )}
                    </div>

                    {(paymentMethod === "manual" || paymentMethod === "bank" || paymentMethod === "card") && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Transaction / Reference ID</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Enter transaction ID or reference"
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Payment Notes</label>
                          <textarea
                            className="form-input"
                            placeholder="Enter details for admin review (optional)"
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Upload payment screenshot (optional)</label>
                          <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                          {proofFile && (
                            <div className="proof-preview-row">
                              <small>{proofFile.name}</small>
                              <button className="btn btn-danger btn-small" style={{ marginLeft: 8 }} onClick={() => { setProofFile(null); setProofUrl(""); }}>
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="payment-buttons">
                      <button
                        className="pay-btn"
                        onClick={async () => {
                          try {
                            await requestCurrentLocation();
                            // upload proof first if present
                            if (proofFile && !proofUrl) {
                              const fd = new FormData();
                              fd.append("proof", proofFile);
                              try {
                                const resp = await api.post("/payments/upload-proof", fd, { headers: { "Content-Type": "multipart/form-data" } });
                                setProofUrl(resp.data.url || resp.data?.url || "");
                              } catch (err) {
                                console.error("Proof upload failed", err);
                                addToast("Could not upload proof image", "error");
                                return;
                              }
                            }

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
                        {gpsLoading ? "Locating..." : paymentMethod === "wallet" ? "Pay with Wallet" : paymentMethod === "cod" ? "Confirm Cash" : "Continue to Pay"}
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
                  </section>
                </div>
                <div className="mobile-payment-bar">
                  <div>
                    <span className="mobile-pay-label">Total</span>
                    <strong>₹{isCartCheckout ? (cart.total || 0) : Number(predictedPrice || selectedService?.basePrice || 0) + Number(bookingTip || 0)}</strong>
                  </div>
                  <button
                    className="pay-btn mobile-pay-action"
                    onClick={async () => {
                      try {
                        await requestCurrentLocation();
                        if (proofFile && !proofUrl) {
                          const fd = new FormData();
                          fd.append("proof", proofFile);
                          try {
                            const resp = await api.post("/payments/upload-proof", fd, { headers: { "Content-Type": "multipart/form-data" } });
                            setProofUrl(resp.data.url || resp.data?.url || "");
                          } catch (err) {
                            console.error("Proof upload failed", err);
                            addToast("Could not upload proof image", "error");
                            return;
                          }
                        }
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
                        <img src={`${API_BASE_URL}${qr.url}`} alt={qr.label} className="payment-qr-image" />
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
