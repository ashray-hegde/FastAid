export default function Payment({ onSuccess, scannerImageSrc }) {
  const qrSrc = scannerImageSrc || "/scanner/scanner.jpeg";


  return (
    <div className="payment-container">
      <h3 style={{ marginBottom: '20px' }}>💳 Payment</h3>

      <div className="payment-qr">
        <img
          src={qrSrc}
          alt="QR Code"
          style={{
            width: '180px',
            height: '180px',
            objectFit: 'contain',
            borderRadius: '10px'
          }}
        />
      </div>

      <p style={{ margin: '20px 0', fontSize: '16px', color: '#374151' }}>
        <strong>UPI Payment</strong>
      </p>

      <p style={{ margin: '10px 0', fontSize: '14px', color: '#6B7280' }}>
        Scan QR or pay to:
      </p>

      <p
        style={{
          margin: '15px 0',
          padding: '15px',
          background: '#F3F4F6',
          borderRadius: '10px',
          fontSize: '18px',
          fontWeight: '600',
          color: '#4F46E5'
        }}
      >
        📱 8310549462@ybl
      </p>

      <p style={{ margin: '15px 0', fontSize: '13px', color: '#9CA3AF' }}>
        After payment, click the button below to confirm
      </p>

      <button
        onClick={onSuccess}
        className="btn btn-success"
        style={{ width: '100%', marginTop: '20px' }}
      >
        ✅ Payment Done - Confirm
      </button>
    </div>
  );
}

