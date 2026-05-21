import { useState } from "react";
import api from "../api";

export default function Register({ setShowRegister }) {
  const [step, setStep] = useState(1); // Step 1: Basic, Step 2: Details
  const [formData, setFormData] = useState({
    name: "",
    fullName: "",
    email: "",
    password: "",
    role: "user",
    age: "",
    mobileNumber: "",
    secondaryMobileNumber: "",
    // Customer address fields
    street: "",
    city: "",
    state: "",
    postalCode: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    setError("");
    
    if (!formData.name || !formData.fullName || !formData.email || !formData.password) {
      setError("Please fill all basic fields");
      return;
    }
    
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    if (!formData.mobileNumber) {
      setError("Mobile number is required");
      setLoading(false);
      return;
    }

    try {
      const submitData = {
        name: formData.name,
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        age: formData.age ? Number(formData.age) : undefined,
        mobileNumber: formData.mobileNumber,
        secondaryMobileNumber: formData.secondaryMobileNumber || undefined
      };

      // Add address for customers
      if (formData.role === "user" && formData.street && formData.city) {
        submitData.addresses = [{
          label: "Home",
          street: formData.street,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
          coordinates: { lat: 0, lng: 0 }
        }];
      }

      const response = await api.post("/auth/register", submitData);
      if (response.data?.token) {
        localStorage.setItem("token", response.data.token);
        window.location.reload();
        return;
      }
      setError(response.data?.error || "Registration failed");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackStep = () => {
    setError("");
    setStep(1);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🚀 FastAid</div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join FastAid and get instant services</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        {step === 1 ? (
          <form onSubmit={handleNextStep}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your full name"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your email"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Create a password (min 6 characters)"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">I want to register as</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="form-select"
              >
                <option value="user">👤 Customer - I need services</option>
                <option value="provider">🔧 Provider - I want to offer services</option>
              </select>
            </div>
            
            <button type="submit" className="btn btn-primary">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                min="18"
                max="100"
                className="form-input"
                placeholder="Enter your age"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input
                type="tel"
                name="mobileNumber"
                value={formData.mobileNumber}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter your mobile number"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Secondary Mobile Number</label>
              <input
                type="tel"
                name="secondaryMobileNumber"
                value={formData.secondaryMobileNumber}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter secondary mobile number (optional)"
              />
            </div>

            {formData.role === "user" && (
              <>
                <h3 className="form-section-title">Delivery Address</h3>
                
                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Enter street address"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="Enter city"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="Enter state"
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Enter pincode"
                  />
                </div>
              </>
            )}
            
            <div className="button-group">
              <button type="button" className="btn btn-secondary" onClick={handleBackStep}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </div>
          </form>
        )}
        
        <div className="auth-link">
          Already have an account?{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); setShowRegister(false); }}>Sign In</a>
        </div>
      </div>
    </div>
  );
}
