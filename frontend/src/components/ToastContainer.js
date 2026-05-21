import React from "react";
import { useToast } from "../context/ToastContext";
import "./toast.css";

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  return (
    <div className="toast-root">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
