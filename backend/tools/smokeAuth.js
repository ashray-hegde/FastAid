const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const API_URL = process.env.API_URL;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/fastaid';
const MOBILE = process.argv[2] || '+911234567890';
const FULLNAME = process.argv[3] || 'Smoke User';
const EMAIL = process.argv[4] || 'smoke@example.com';
const PASSWORD = process.argv[5] || 'SmokePass123';

const OtpCode = require('../models/OtpCode');

(async () => {
  try {
    console.log('Connecting to Mongo...');
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    console.log('Requesting OTP for', MOBILE);
    await axios.post(`${API_URL}/api/auth/request-otp`, { mobileNumber: MOBILE });

    console.log('Waiting for OTP to appear in DB...');
    const normalized = MOBILE.toString().trim().replace(/[^+0-9]/g, '').replace(/^00/, '+');
    let attempts = 0;
    let record = null;
    while (attempts < 20) {
      record = await OtpCode.findOne({ mobileNumber: normalized }).lean();
      if (record && record.code) break;
      attempts++;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!record) {
      throw new Error('OTP record not found in DB after waiting');
    }

    console.log('Found OTP in DB:', record.code);

    console.log('Verifying OTP via API (will create user and return tokens)');
    const resp = await axios.post(`${API_URL}/api/auth/verify-otp`, {
      mobileNumber: MOBILE,
      otp: record.code,
      fullName: FULLNAME,
      email: EMAIL,
      password: PASSWORD,
      role: 'user'
    });

    console.log('Verification response:', resp.data);
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err.message || err);
    process.exit(2);
  }
})();
