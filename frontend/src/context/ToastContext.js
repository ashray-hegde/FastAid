import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", timeout = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    const t = { id, message, type };
    setToasts((s) => [t, ...s]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), timeout);
    return id;
  }, []);

  const removeToast = useCallback((id) => setToasts((s) => s.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
