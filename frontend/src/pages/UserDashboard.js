import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import getSocket from "../socket";
import { decodeJwt } from "../utils/token";
import LiveMap from "../components/LiveMap";
import LocationPickerLeaflet from "../components/LocationPickerLeaflet";
import Skeleton from "../components/Skeleton";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import PaymentPage from "./PaymentPage";

import "../components/skeleton.css";
import "./UserDashboard.css";

export default function UserDashboard() {
  const { cart, loading: cartLoading, error: cartError, loadCart, addToCart, updateItem, removeItem, clearCart } =
    useCart();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // App/user state
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");

  // Services / bookings
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [userReviews, setUserReviews] = useState([]);

  // Checkout/location/payment UI
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [isCartCheckout, setIsCartCheckout] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [currentPaymentType, setCurrentPaymentType] = useState("booking"); // "booking" or "wallet"

  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [couponCode, setCouponCode] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [paymentMethods, setPaymentMethods] = useState({
    upiIds: [],
    qrCodes: [],
    bankAccounts: [],
    cardSupported: true,
    codSupported: true,
  });

  // Addresses
  const [addressDetails, setAddressDetails] = useState({});
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const selectedAddress = useMemo(
    () => savedAddresses.find((addr) => addr.id === selectedAddressId),
    [savedAddresses, selectedAddressId]
  );

  // Payment loading/retry (kept from corrupted file)
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const retryPayment = () => {
    setPaymentError("");
    setShowPayment(true);
  };

  // Wallet top-up (UI in corrupted file is partially broken; keep minimal safe logic/state)
  const [showWalletTopup, setShowWalletTopup] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletHistory, setWalletHistory] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);

  // Live tracking
  const [activeBooking, setActiveBooking] = useState(null);
  const [providerLocation, setProviderLocation] = useState(null);
  const [trackingProviderId, setTrackingProviderId] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [activeTab, setActiveTab] = useState("current");

  // Tips/recommendation
  const [ratingBookingId, setRatingBookingId] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [tipValue, setTipValue] = useState(0);
  const [bookingTip, setBookingTip] = useState(0);
  const [suggestedTip, setSuggestedTip] = useState(0);
  const [predictedPrice, setPredictedPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState("");

  // Prevent double-click loops for cart item buttons
  const [cartProcessingIds, setCartProcessingIds] = useState(() => new Set());

  const socketRef = useRef(null);

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
        codSupported: response.data?.codSupported ?? true,
      };
      setPaymentMethods(methods);

      const availableMethods = [
        ...(methods.upiIds?.filter((m) => m.enabled !== false).length ? ["upi"] : []),
        ...(methods.bankAccounts?.filter((m) => m.enabled !== false).length ? ["bank"] : []),
        ...(methods.qrCodes?.filter((m) => m.enabled !== false).length ? ["qr"] : []),
        ...(methods.cardSupported ? ["card"] : []),
        ...(methods.codSupported ? ["cod"] : []),
      ];

      if (!availableMethods.includes(paymentMethod)) {
        setPaymentMethod(availableMethods[0] || "wallet");
      }
    } catch (err) {
      console.error("Error loading payment methods:", err);
    }
  };

  const fetchWallet = async () => {
    try {
      setWalletLoading(true);
      const res = await api.get("/payment/history");
      setWalletHistory(res.data.payments?.filter((p) => p.transactionType === "topup") || []);
      setWalletBalance(res.data.wallet || user?.wallet || 0);
      setWalletError("");
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
        return;
      }
      setWalletError("Failed to load wallet");
      console.error(err);
    } finally {
      setWalletLoading(false);
    }
  };

  const openWalletTopup = () => {
    setWalletAmount(0);
    setWalletError("");
    setShowWalletTopup(true);
    fetchWallet();
  };

  // Booking/tip recommendation
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
        servicePopularity: Number(service.popularityScore || service.popularity || 50),
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
          urgencyScore: 5,
        },
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

  const handleRazorpayBookingSuccess = () => {
    setShowPayment(false);
    setCurrentPaymentType("booking"); // Reset payment type
    loadBookings();
    addToast("Payment successful! Booking confirmed.", "success");
  };

  const handleRazorpayWalletSuccess = () => {
    setShowPayment(false);
    setShowWalletTopup(false); // Close wallet modal too
    setCurrentPaymentType("booking"); // Reset payment type
    setWalletAmount(0);
    setWalletError("");
    fetchWallet();
    addToast("✅ Wallet topped up successfully!", "success");
  };

  const handlePaymentSuccess = async () => {
    if (currentPaymentType === "wallet") {
      handleRazorpayWalletSuccess();
    } else {
      handleRazorpayBookingSuccess();
    }
  };

  // Tip update when predicted price changes
  useEffect(() => {
    if (!isCartCheckout && selectedService && predictedPrice !== null) {
      fetchTipRecommendation(predictedPrice, selectedService.rating || 4.5, paymentMethod)
        .then((tip) => {
          setSuggestedTip(tip);
          setBookingTip(tip);
        })
        .catch(() => setSuggestedTip(0));
    }
  }, [isCartCheckout, selectedService, predictedPrice, paymentMethod]);

  // Prevent background scroll when payment modal is open
  useEffect(() => {
    if (showPayment) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "auto";

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [showPayment]);

  // Initial load + socket listeners (fixed: listeners are stable and cleaned)
  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const token = localStorage.getItem("token");
    if (!token) {
      // No token, redirect to login after a short delay
      const redirectTimer = setTimeout(() => {
        window.location.replace("/login");
      }, 500);
      return () => clearTimeout(redirectTimer);
    }

    const decoded = decodeJwt(token);
    if (!decoded) {
      // Invalid token, redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      const redirectTimer = setTimeout(() => {
        window.location.replace("/login");
      }, 500);
      return () => clearTimeout(redirectTimer);
    }

    setUser(decoded);

    // Only load data if token is valid
    loadServices().catch((err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
      }
      console.error("Error loading services:", err);
    });

    loadBookings().catch((err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
      }
      console.error("Error loading bookings:", err);
    });

    loadUserReviews().catch((err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
      }
      console.error("Error loading reviews:", err);
    });

    loadPaymentMethods().catch((err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
      }
      console.error("Error loading payment methods:", err);
    });

    loadSavedAddresses();
    loadCart().catch((err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/login");
      }
      console.error("Error loading cart:", err);
    });

    const handleBookingUpdate = () => {
      loadBookings();
      loadUserReviews();
      loadCart();
    };
    const handleProviderLocationUpdate = (data) => {
      const currentProviderId = trackingProviderId ? trackingProviderId.toString() : null;
      const eventProviderId = data?.providerId ? data.providerId.toString() : null;
      if (eventProviderId && eventProviderId === currentProviderId) {
        setProviderLocation({ lat: data.lat, lng: data.lng });
      }
    };
    const handlePaymentConfigUpdated = () => {
      loadPaymentMethods();
      addToast("Payment channels were updated", "info");
    };
    const handlePaymentReviewed = (data) => {
      // keep stable: only refresh UI
      if (!data) return;
      loadBookings();
    };
    const handleBookingCompleted = () => {
      loadBookings();
      loadUserReviews();
    };
    const handleWalletUpdated = (data) => {
      // Refresh wallet balance and history when wallet is updated
      if (data?.newBalance !== undefined) {
        setWalletBalance(data.newBalance);
      }
      fetchWallet();
      addToast("Wallet updated successfully!", "success");
    };

    s.on("booking-update", handleBookingUpdate);
    s.on("providerLocationUpdate", handleProviderLocationUpdate);
    s.on("payment-config-updated", handlePaymentConfigUpdated);
    s.on("payment-reviewed", handlePaymentReviewed);
    s.on("booking-completed", handleBookingCompleted);
    s.on("walletUpdated", handleWalletUpdated);

    // Cleanup
    return () => {
      s.off("booking-update", handleBookingUpdate);
      s.off("providerLocationUpdate", handleProviderLocationUpdate);
      s.off("payment-config-updated", handlePaymentConfigUpdated);
      s.off("payment-reviewed", handlePaymentReviewed);
      s.off("booking-completed", handleBookingCompleted);
      s.off("walletUpdated", handleWalletUpdated);
    };
  }, []);

  // Live tracking request
  useEffect(() => {
    if (!showMap || !trackingProviderId) return;
    const s = socketRef.current || getSocket();

    s.emit("get-provider-location", { providerId: trackingProviderId }, (loc) => {
      if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
        setProviderLocation({ lat: loc.latitude, lng: loc.longitude, updatedAt: loc.timestamp });
      }
    });
  }, [showMap, trackingProviderId]);

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
      Plumber: "🔧",
      Electrician: "⚡",
      "AC Repair": "❄️",
      Carpenter: "🪵",
      "House Cleaning": "🧹",
      Painting: "🎨",
      "Pest Control": "🐛",
      Gardening: "🌱",
      "Appliance Repair": "🔌",
      "Moving & Packing": "📦",
    };
    return icons[serviceName] || "🔧";
  };

  const filteredServices = useMemo(() => {
    const q = search.toLowerCase();
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(q) || (service.category?.toLowerCase().includes(q) ?? false)
    );
  }, [services, search]);

  const activeStatuses = ["accepted", "on_the_way", "started", "assigned"];
  const reviewedBookingIds = useMemo(
    () => new Set(userReviews.map((review) => review.bookingId?.toString())),
    [userReviews]
  );

  const currentBooking = useMemo(() => {
    const list = bookings
      .filter((booking) => activeStatuses.includes(booking.status))
      .sort((a, b) => {
        const statusPriority = { started: 4, on_the_way: 3, accepted: 2, assigned: 1 };
        const priorityA = statusPriority[a.status] || 0;
        const priorityB = statusPriority[b.status] || 0;
        if (priorityA !== priorityB) return priorityB - priorityA;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    return list[0] || null;
  }, [bookings]);

  const historyBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking._id !== currentBooking?._id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [bookings, currentBooking?._id]);

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
        feedback: feedbackValue,
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
      {bookings && bookings.find((b) => b.status === "accepted" || b.status === "on_the_way") && (
        (() => {
          const active = bookings.find((b) => b.status === "accepted" || b.status === "on_the_way");
          return (
            <div className="accepted-banner">
              <strong>Provider accepted your booking</strong>
              <div>
                {active?.serviceName || active?.serviceId?.name} • {active?.providerId?.name || "Provider"}
              </div>
              {active?.etaMinutes ? <div>ETA: {active.etaMinutes} mins</div> : null}
              <button
                className="btn btn-primary"
                onClick={() => {
                  setActiveBooking(active);
                  setTrackingProviderId(active.providerId?._id || active.providerId);
                  setShowMap(true);
                }}
              >
                Track
              </button>
            </div>
          );
        })()
      )}

      <section className="hero">
        <h2>Find Trusted Services Near You</h2>
        <p>
          FASTAID connects you with verified professionals for health, home, vehicle, tech and more — quickly and
          securely.
        </p>

        <div className="badges">
          <span className="badge">✔ Verified</span>
          <span className="badge">🔒 Secure</span>
          <span className="badge">⚡ Fast Service</span>
        </div>

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

        <button className="category-btn">View All Categories</button>
      </section>

      <section className="services-section">
        <h3 className="section-title">Popular Services</h3>

        <div className="services-grid">
          {servicesLoading ? (
            <Skeleton count={6} height="120px" />
          ) : filteredServices.length > 0 ? (
            filteredServices.map((service) => (
              <div key={service._id} className="service-card">
                <div className="service-icon" style={{ fontSize: "40px", marginBottom: "10px" }}>
                  {getServiceIcon(service.name)}
                </div>
                <h4>{service.name}</h4>
                <p className="rating">⭐ {service.rating || "4.5"}</p>
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
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-state-icon">🔍</div>
              <h3>No services found</h3>
              <p>Try a different search term</p>
            </div>
          )}
        </div>
      </section>

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
                              setCartProcessingIds((s) => {
                                const n = new Set(s);
                                n.delete(String(itemId));
                                return n;
                              });
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
                              setCartProcessingIds((s) => {
                                const n = new Set(s);
                                n.delete(String(itemId));
                                return n;
                              });
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
                              setCartProcessingIds((s) => {
                                const n = new Set(s);
                                n.delete(String(itemId));
                                return n;
                              });
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

              <button
                className="btn btn-primary"
                onClick={() => {
                  if (cart.items.length) {
                    setSelectedService(null);
                    setIsCartCheckout(true);
                    setShowPayment(true);
                  }
                }}
              >
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
            <button className="btn btn-primary" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Browse Services
            </button>
          </div>
        )}
      </section>

      <section className="bookings-section">
        <div className="bookings-header">
          <div>
            <h3 className="bookings-title">My Bookings</h3>
            <p className="bookings-subtitle">Only your active service is shown here. Browse history for past bookings.</p>
          </div>
          <div className="bookings-tabs">
            <button className={`tab-btn ${activeTab === "current" ? "active" : ""}`} onClick={() => setActiveTab("current")}>
              Current Service
            </button>
            <button className={`tab-btn ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
              History
            </button>
          </div>
        </div>

        {activeTab === "current" ? (
          currentBooking ? (
            <div className="current-card">
              <div className="current-card-header">
                <div>
                  <h4>{currentBooking.serviceName || currentBooking.serviceId?.name}</h4>
                  <span className={`status-badge status-${currentBooking.status}`}>{currentBooking.status}</span>
                </div>
                <div className="current-amount">
                  ₹{currentBooking.servicePrice || currentBooking.amount || 0}
                </div>
              </div>

              <div className="current-details">
                <p>
                  <strong>Customer:</strong> {user?.name || "You"}
                </p>
                {currentBooking.providerId && (
                  <p>
                    <strong>Provider:</strong> {currentBooking.providerId.name || currentBooking.providerId}
                  </p>
                )}
                <p>
                  <strong>Location:</strong>{" "}
                  {currentBooking.location || currentBooking.locationDetails?.fullAddress || "Not set"}
                </p>
                <p>
                  <strong>Payment:</strong> {currentBooking.paymentStatus}
                </p>
                {currentBooking.etaMinutes ? (
                  <p>
                    <strong>ETA:</strong> {currentBooking.etaMinutes} mins
                  </p>
                ) : null}
              </div>

              <div className="current-actions">
                {currentBooking.providerId &&
                  currentBooking.status !== "completed" &&
                  currentBooking.status !== "cancelled" && (
                    <button className="btn btn-primary" onClick={() => handleTrackBooking(currentBooking)}>
                      Track Provider
                    </button>
                  )}

                {["pending", "assigned"].includes(currentBooking.status) && (
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
        ) : historyBookings.length > 0 ? (
          <div className="services-grid">
            {historyBookings.map((booking) => (
              <div key={booking._id} className="booking-card history-card">
                <div className="booking-info">
                  <h4>{booking.serviceName || booking.serviceId?.name}</h4>
                  <p>📍 {booking.location || booking.locationDetails?.fullAddress || "Location pending"}</p>
                  <p>💰 Amount: ₹{booking.servicePrice || booking.amount || 0}</p>
                  <p>🕒 {new Date(booking.createdAt).toLocaleString()}</p>
                  <p>🧾 Status: {booking.status}</p>
                  {booking.providerId && <p>👷 Provider: {booking.providerId.name || booking.providerId}</p>}
                </div>

                <div className="booking-actions history-actions">
                  {booking.status === "completed" && !reviewedBookingIds.has(booking._id?.toString()) && (
                    <button className="btn btn-primary btn-small" onClick={() => openReviewPrompt(booking)}>
                      Rate & Tip
                    </button>
                  )}

                  {booking.status === "completed" && reviewedBookingIds.has(booking._id?.toString()) && (
                    <span className="reviewed-tag">Reviewed</span>
                  )}

                  {booking.tipSuggestion > 0 && booking.status === "completed" && (
                    <div className="tip-suggestion">Suggested tip: ₹{booking.tipSuggestion}</div>
                  )}

                  {booking.providerId && booking.status !== "completed" && booking.status !== "cancelled" && (
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
        )}
      </section>

      {showMap && activeBooking && (
        <section className="tracking-section">
          <div className="tracking-card">
            <h3>Live tracking for {activeBooking.serviceName}</h3>
            <p>
              Status: <strong>{activeBooking.status}</strong>
            </p>

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
            {/* Close button to exit payment modal */}
            <button
              className="btn btn-secondary close-payment-btn"
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
              onClick={() => {
                setShowPayment(false);
                setCurrentPaymentType("booking");
              }}
            >
              ✕ Close
            </button>
            <PaymentPage
              onSuccess={handlePaymentSuccess}
              onCancel={() => {
                setShowPayment(false);
                setCurrentPaymentType("booking");
              }}
              amount={
                currentPaymentType === "wallet"
                  ? walletAmount
                  : Number(predictedPrice || selectedService?.basePrice || 0) + Number(bookingTip || 0)
              }
              bookingId={selectedService?._id}
              user={user}
              paymentType={currentPaymentType}
            />

            {paymentLoading && (
              <div className="payment-loader-overlay">
                <div className="loader-spinner" />
                <p>Verifying payment...</p>
              </div>
            )}

            {paymentError && (
              <div className="payment-error-bar">
                <span>{paymentError}</span>
                <button onClick={retryPayment}>Retry Payment</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rate/Tip Modal */}
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
                  <option key={value} value={value}>
                    {value} Star{value > 1 ? "s" : ""}
                  </option>
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

      {/* Wallet top-up modal - Simple Razorpay flow */}
      {showWalletTopup && !showPayment && (
        <div className="payment-modal">
          <div className="payment-content modern-payment">
            <button
              className="btn btn-secondary close-payment-btn"
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
              onClick={() => {
                setShowWalletTopup(false);
                setWalletAmount(0);
                setWalletError("");
              }}
            >
              ✕ Close
            </button>

            <h3 style={{ marginBottom: '8px', color: '#111', fontSize: '22px', fontWeight: '700' }}>💳 Add Money</h3>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>Current Balance: <strong style={{ color: '#22c55e', fontSize: '16px' }}>₹{walletBalance || 0}</strong></p>

            {/* Amount Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#111' }}>Enter Amount (₹)</label>
              <input
                type="number"
                min="1"
                max="100000"
                placeholder="Enter amount (min ₹1, max ₹1,00,000)"
                value={walletAmount}
                onChange={(e) => {
                  setWalletAmount(Number(e.target.value));
                  setWalletError("");
                }}
                disabled={paymentLoading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  border: walletError ? '2px solid #dc2626' : '1px solid #ddd',
                  fontSize: '16px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'border 0.2s',
                  opacity: paymentLoading ? 0.6 : 1
                }}
              />
            </div>

            {/* Error Message */}
            {walletError && (
              <div style={{
                color: '#dc2626',
                padding: '12px',
                backgroundColor: '#fee2e2',
                borderRadius: '6px',
                border: '1px solid #fca5a5',
                fontSize: '13px',
                marginBottom: '16px',
                fontWeight: '500'
              }}>
                ⚠️ {walletError}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  // Validate amount
                  if (!walletAmount || walletAmount < 1) {
                    setWalletError("Enter at least ₹1");
                    return;
                  }
                  if (walletAmount > 100000) {
                    setWalletError("Maximum ₹1,00,000 allowed");
                    return;
                  }
                  
                  // Start payment flow
                  setWalletError("");
                  setCurrentPaymentType("wallet");
                  setShowWalletTopup(false);
                  setShowPayment(true);
                }}
                disabled={paymentLoading || !walletAmount || walletAmount < 1 || walletAmount > 100000}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  backgroundColor: (walletAmount && walletAmount >= 1 && walletAmount <= 100000 && !paymentLoading) ? '#22c55e' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (walletAmount && walletAmount >= 1 && walletAmount <= 100000 && !paymentLoading) ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  fontWeight: '700',
                  transition: 'all 0.2s',
                  opacity: paymentLoading ? 0.7 : 1
                }}
              >
                {paymentLoading ? '⏳ Processing...' : '💳 Add Money'}
              </button>

              <button
                onClick={() => {
                  setShowWalletTopup(false);
                  setWalletAmount(0);
                  setWalletError("");
                }}
                disabled={paymentLoading}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#111',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: paymentLoading ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  opacity: paymentLoading ? 0.6 : 1
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="wallet-balance-bar">
        <span>Wallet: ₹{walletBalance}</span>
        <button className="wallet-topup-btn" onClick={openWalletTopup}>
          Add Money
        </button>
      </div>
    </div>
  );
}
