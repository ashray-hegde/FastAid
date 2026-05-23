const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const OtpCode = require('../models/OtpCode');
const Lockout = require('../models/Lockout');

const API_URL = process.env.API_URL || 'http://localhost:5000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fastaid';
const MOBILE = process.argv[2] || '+911234567890';

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to mongo');

    // send many requests quickly to trigger rate limit
    console.log('Firing rapid OTP requests to trigger rate-limiter...');
    for (let i = 0; i < 10; i++) {
      try {
        const r = await axios.post(`${API_URL}/api/auth/request-otp`, { mobileNumber: MOBILE }, { timeout: 5000 });
        console.log(i, 'status', r.status, r.data?.message || JSON.stringify(r.data));
      } catch (err) {
        if (err.response) console.log(i, 'error', err.response.status, err.response.data);
        else console.log(i, 'network error', err.message);
      }
    }

    console.log('Checking Lockout collection for IP or phone lockouts...');
    const phoneLock = await Lockout.findOne({ key: MOBILE, type: 'phone' }).lean();
    const ipLock = await Lockout.findOne({ type: 'ip' }).lean();
    console.log('phoneLock:', phoneLock);
    console.log('ipLock:', ipLock);

    process.exit(0);
  } catch (err) {
    console.error('simulateLockout failed', err);
    process.exit(2);
  }
})();
