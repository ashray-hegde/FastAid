const crypto = require('crypto');

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(orderId + '|' + paymentId);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
}

module.exports = verifyRazorpaySignature;