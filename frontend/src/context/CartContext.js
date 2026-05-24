import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "./ToastContext";
import api from "../api";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, savedForLater: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCart = async () => {
    try {
      // Check if token exists before making API call
      const token = localStorage.getItem("token");
      if (!token) {
        // No token - don't attempt to load cart, just mark as ready
        setLoading(false);
        setCart({ items: [], total: 0, savedForLater: [] });
        return;
      }

      setLoading(true);
      const { data } = await api.get("/cart");
      setCart(data);
      setLoading(false);
    } catch (err) {
      // Handle 401 specifically - don't retry, just clear state
      if (err.response?.status === 401) {
        setCart({ items: [], total: 0, savedForLater: [] });
        setError(null); // Don't show error for 401, it's expected when not logged in
        setLoading(false);
        return;
      }
      setError(err.message || "Unable to load cart");
      setLoading(false);
    }
  };

  const { addToast } = useToast();

  const addToCart = async (item) => {
    try {
      // Check token before attempting operation
      const token = localStorage.getItem("token");
      if (!token) {
        addToast("Please log in to add items to cart", "error");
        return;
      }

      const payload = {
        serviceId: item.serviceId,
        quantity: item.quantity || 1,
        price: item.price,
        description: item.description || item.serviceName,
        savedForLater: item.savedForLater || false
      };
      await api.post("/cart/add", payload);
      await loadCart();
      addToast("Added to cart", "success");
    } catch (err) {
      // Handle 401 - redirect to login instead of showing error
      if (err.response?.status === 401) {
        addToast("Session expired, please log in again", "error");
        return;
      }
      setError(err.message || "Failed to add item to cart");
      addToast("Failed to add item to cart", "error");
    }
  };

  const updateItem = async (itemId, updates) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please log in to update cart");
        return;
      }

      await api.put(`/cart/item/${itemId}`, updates);
      await loadCart();
    } catch (err) {
      // Handle 401 without retry
      if (err.response?.status === 401) {
        setError(null);
        return;
      }
      setError(err.message || "Unable to update cart item");
    }
  };

  const removeItem = async (itemId) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        addToast("Please log in to remove items", "error");
        return;
      }

      const id = String(itemId);
      await api.delete(`/cart/item/${id}`);
      await loadCart();
      addToast("Removed from cart", "info");
    } catch (err) {
      // Handle 401 without retry
      if (err.response?.status === 401) {
        addToast("Session expired, please log in again", "error");
        return;
      }
      setError(err.message || "Unable to remove cart item");
      addToast("Unable to remove cart item", "error");
      // Don't retry loadCart - let user handle 401 by re-logging in
    }
  };

  const clearCart = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        addToast("Please log in to manage cart", "error");
        return;
      }

      await api.delete("/cart/clear");
      setCart({ items: [], total: 0, savedForLater: [] });
      addToast("Cart cleared", "info");
    } catch (err) {
      // Handle 401 without error display
      if (err.response?.status === 401) {
        addToast("Session expired, please log in again", "error");
        return;
      }
      setError(err.message || "Unable to clear cart");
      addToast("Unable to clear cart", "error");
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  return (
    <CartContext.Provider value={{ cart, loading, error, loadCart, addToCart, updateItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
