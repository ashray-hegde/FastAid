import { useState } from "react";
import api from "../api";

export default function Payment({ onSuccess, onCancel, amount = 0, bookingId, user }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    setLoading(true);
    const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        setError("Failed to load Razorpay. Try again later.");
        setLoading(false);
        return;
      }
      // Create order on backend
      const orderRes = await api.post("/payment/create-order", {
        amount,
        currency: "INR",
        receipt: bookingId,
        notes: { bookingId, userId: user?._id || user?.id }
      });
      const order = orderRes.data.order;
      if (!order || !order.id) throw new Error("Order creation failed");

      const options = {
        key,
        amount: order.amount,
        currency: order.currency,
        name: "FastAid",
        description: "Service Booking Payment",
        order_id: order.id,
        handler: async function (response) {
          // Verify payment on backend
          try {
            setLoading(true);
            const verifyRes = await api.post("/payment/verify-payment", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId,
              type: "booking"
            });
            if (verifyRes.data.success) {
              setLoading(false);
              onSuccess && onSuccess();
            } else {
              setError("Payment verification failed. Please contact support.");
              setLoading(false);
            }
          } catch (err) {
            setError("Payment verification failed. Please try again.");
            setLoading(false);
          }
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.phone || ""
        },
        theme: { color: "#22c55e" }
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
        setError("Payment failed. Please try again.");
        setLoading(false);
      });
      rzp.open();
      setLoading(false);
    } catch (err) {
      setError("Payment initiation failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="payment-container">
      <h3 style={{ marginBottom: '20px' }}>💳 Payment</h3>

      <p style={{ margin: '20px 0', fontSize: '16px', color: '#374151' }}>
        Pay securely using Razorpay. Click below to pay for your booking.
      </p>

      {error && <div style={{ color: 'red', margin: '10px 0' }}>{error}</div>}
      {loading && <div style={{ color: '#22c55e', margin: '10px 0' }}>Processing payment...</div>}

      <button
        onClick={handleRazorpayPayment}
        className="btn btn-success"
        style={{ width: '100%', marginTop: '20px' }}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Pay Now'}
      </button>

      {/* Cancel Payment button below Pay Now, styled the same */}
      <button
        onClick={onCancel}
        className="btn btn-success"
        style={{ width: '100%', marginTop: '12px', backgroundColor: '#22c55e', borderColor: '#22c55e' }}
        disabled={loading}
      >
        Cancel Payment
      </button>
    </div>
  );
}

