import { useState, useRef, useEffect } from "react";
import api from "../api";

export default function Payment({
  onSuccess,
  onCancel,
  amount = 0,
  bookingId,
  user,
  paymentType = "booking" // "booking" or "wallet"
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const razorpayInstanceRef = useRef(null);
  const popupOpenedRef = useRef(false);

  // Dynamically load Razorpay script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async () => {
    // Prevent duplicate popup opening
    if (isProcessing || popupOpenedRef.current) {
      return;
    }

    setError("");
    setLoading(true);
    setIsProcessing(true);

    const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        setError("Failed to load Razorpay. Please try again later.");
        setLoading(false);
        setIsProcessing(false);
        return;
      }

      // Create order on backend
      const orderRes = await api.post("/payment/create-order", {
        amount,
        currency: "INR",
        receipt: paymentType === "booking" ? bookingId : `wallet-${Date.now()}`,
        notes: {
          bookingId: paymentType === "booking" ? bookingId : null,
          userId: user?._id || user?.id,
          type: paymentType
        },
        type: paymentType // Send type to backend
      });

      const order = orderRes.data.order;
      if (!order || !order.id) throw new Error("Order creation failed");

      const options = {
        key,
        amount: order.amount,
        currency: order.currency,
        name: "FastAid",
        description: paymentType === "booking" ? "Service Booking Payment" : "Wallet Top-up",
        order_id: order.id,
        handler: async function (response) {
          // Payment successful callback
          try {
            setLoading(true);
            const verifyRes = await api.post("/payment/verify-payment", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: paymentType === "booking" ? bookingId : null,
              type: paymentType
            });

            if (verifyRes.data.success) {
              setLoading(false);
              setIsProcessing(false);
              popupOpenedRef.current = false;
              onSuccess && onSuccess(verifyRes.data);
            } else {
              setError("Payment verification failed. Please contact support.");
              setLoading(false);
              setIsProcessing(false);
              popupOpenedRef.current = false;
            }
          } catch (err) {
            setError(
              err.response?.data?.error ||
              "Payment verification failed. Please try again."
            );
            setLoading(false);
            setIsProcessing(false);
            popupOpenedRef.current = false;
          }
        },
        prefill: {
          name: user?.name || user?.fullName || "",
          email: user?.email || "",
          contact: user?.phone || user?.mobileNumber || ""
        },
        theme: { color: "#22c55e" },
        modal: {
          ondismiss: function () {
            // Handle popup close
            setLoading(false);
            setIsProcessing(false);
            popupOpenedRef.current = false;
            // Don't show error, just reset
            setError("");
          }
        }
      };

      const rzp = new window.Razorpay(options);
      razorpayInstanceRef.current = rzp;

      // Handle payment failure
      rzp.on("payment.failed", function (response) {
        setError(
          `Payment failed: ${response.error.description || "Please try again."}`
        );
        setLoading(false);
        setIsProcessing(false);
        popupOpenedRef.current = false;
      });

      // Open popup and mark as opened
      popupOpenedRef.current = true;
      rzp.open();
      setLoading(false);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        "Payment initiation failed. Please try again."
      );
      setLoading(false);
      setIsProcessing(false);
      popupOpenedRef.current = false;
    }
  };

  // Reset popup flag when component unmounts
  useEffect(() => {
    return () => {
      popupOpenedRef.current = false;
    };
  }, []);

  return (
    <div className="payment-container">
      <h3 style={{ marginBottom: "20px" }}>💳 Payment</h3>

      <p style={{ margin: "20px 0", fontSize: "16px", color: "#374151" }}>
        {paymentType === "booking"
          ? "Pay securely using Razorpay to confirm your booking."
          : "Add money to your wallet using Razorpay."}
      </p>

      {/* Amount Display */}
      <div
        style={{
          backgroundColor: "#f0fdf4",
          padding: "12px 16px",
          borderRadius: "6px",
          marginBottom: "16px",
          border: "1px solid #dcfce7"
        }}
      >
        <span style={{ fontSize: "14px", color: "#666" }}>Total Amount:</span>
        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#22c55e" }}>
          ₹{amount}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            color: "#dc2626",
            margin: "10px 0",
            padding: "10px",
            backgroundColor: "#fee2e2",
            borderRadius: "4px",
            border: "1px solid #fca5a5"
          }}
        >
          {error}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              textAlign: "center"
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid #dcfce7",
                borderTop: "4px solid #22c55e",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 12px"
              }}
            />
            <p style={{ margin: 0, fontWeight: "500" }}>
              {isProcessing ? "Verifying payment..." : "Processing..."}
            </p>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Pay Now Button */}
      <button
        onClick={handleRazorpayPayment}
        className="btn btn-success"
        style={{
          width: "100%",
          marginTop: "20px",
          opacity: isProcessing ? 0.6 : 1,
          cursor: isProcessing ? "not-allowed" : "pointer"
        }}
        disabled={isProcessing || loading}
      >
        {loading ? "Processing..." : isProcessing ? "Opening Payment..." : "Pay Now"}
      </button>

      {/* Cancel Payment Button */}
      <button
        onClick={() => {
          if (!isProcessing && !loading) {
            onCancel && onCancel();
          }
        }}
        className="btn btn-secondary"
        style={{
          width: "100%",
          marginTop: "12px",
          opacity: isProcessing ? 0.6 : 1,
          cursor: isProcessing ? "not-allowed" : "pointer"
        }}
        disabled={isProcessing || loading}
      >
        Cancel Payment
      </button>

      {/* Retry Support */}
      {error && !isProcessing && (
        <button
          onClick={handleRazorpayPayment}
          className="btn btn-primary"
          style={{
            width: "100%",
            marginTop: "12px"
          }}
        >
          Retry Payment
        </button>
      )}
    </div>
  );
}

