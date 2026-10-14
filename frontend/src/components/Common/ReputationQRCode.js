import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';

function ReputationQRCode() {
  const { user } = useAuth();
  const svgRef = useRef(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const walletAddress = user?.walletAddress || '';
  const value = JSON.stringify({ walletAddress, type: 'reputation', platform: 'TABASC' });

  const download = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tabasc-reputation-${walletAddress}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!walletAddress) {
    return <p className="error-message">Your account has no wallet address, so a reputation QR code cannot be generated.</p>;
  }

  return (
    <section className="qr-card">
      <h3>My Reputation QR Code</h3>
      <p>Let consumers scan this code to view your verified score.</p>
      {!showQrCode ? (
        <button type="button" onClick={() => setShowQrCode(true)}>
          Show QR Code
        </button>
      ) : (
        <>
          <div className="qr-frame">
            <QRCodeSVG value={value} size={240} fgColor="#1B4332" ref={svgRef} />
          </div>
          <p style={{ wordBreak: 'break-all', fontSize: 12 }}>{walletAddress}</p>
          <div className="scanner-actions">
            <button type="button" onClick={download}>Download QR Code</button>
            <button
              type="button"
              onClick={() => setShowQrCode(false)}
              style={{ background: '#e7f0eb', color: '#163a2d' }}
            >
              Hide QR Code
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default ReputationQRCode;
