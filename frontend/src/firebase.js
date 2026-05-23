import api from "./api";

export const sendPhoneOtp = async (phoneNumber) => {
  if (!phoneNumber) throw new Error("Phone number is required.");
  // Call backend OTP request endpoint. Backend will handle Twilio/Fallback.
  const res = await api.post("/auth/request-otp", { mobileNumber: phoneNumber });
  return res.data;
};

export const verifyPhoneOtp = async (mobileNumber, otp) => {
  if (!mobileNumber || !otp) throw new Error("Mobile number and OTP are required.");
  const res = await api.post("/auth/verify-otp", { mobileNumber, otp });
  return res.data;
};

export const normalizePhoneInput = (value) => {
  return value?.toString().trim().replace(/[^+0-9]/g, "");
};
