const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { randomUUID, createHash } = require('crypto');
require('dotenv').config();

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { signToken } = require('../utils/verifyToken');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fastaid';

async function run() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const name = process.argv[2] || 'Dev Admin';
  const email = process.argv[3] || 'dev-admin@local';
  const password = process.argv[4] || 'DevAdmin123!';

  let user = await User.findOne({ email });
  if (!user) {
    const hash = await bcrypt.hash(password, 12);
    user = await User.create({
      name,
      fullName: name,
      email,
      password: hash,
      role: 'admin',
      authMethod: 'password',
      authProviders: ['password'],
      loginProviders: ['password'],
      profileComplete: true,
      isMobileVerified: false
    });
    console.log('Created dev admin user:', email);
  } else {
    console.log('Dev admin user already exists:', email);
  }

  const payload = { id: user._id.toString(), role: 'admin', name: user.name, profileComplete: true };
  const token = signToken(payload);

  // create refresh token
  const rawToken = randomUUID();
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ userId: user._id, tokenHash, expiresAt });

  console.log('Dev tokens:');
  const out = { token, refreshToken: rawToken };
  console.log(JSON.stringify(out, null, 2));

  // Optionally write token to file for CI
  const outPath = process.env.TOKEN_OUT;
  if (outPath) {
    const fs = require('fs');
    try {
      fs.writeFileSync(outPath, JSON.stringify(out));
      console.log('Wrote token to', outPath);
    } catch (e) {
      console.error('Failed to write token file', e.message || e);
    }
  }
  process.exit(0);
}

run().catch((e) => {
  console.error('Error seeding dev admin', e);
  process.exit(2);
});
