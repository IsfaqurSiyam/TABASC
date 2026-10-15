import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { API_URL } from '../../config/api';

const parseWallet = (value) => {
  try {
    const parsed = JSON.parse(value);
    return parsed.walletAddress;
  } catch {
    return value.trim();
  }
};

function ReputationScanner() {
  const scannerRef = useRef(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [reputation, setReputation] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const loadReputation = async (rawValue) => {
    const wallet = parseWallet(rawValue);
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet || '')) {
      setError('This QR code does not contain a valid wallet address.');
      return;
    }
    setError('');
    setWalletAddress(wallet);
    try {
      const response = await axios.get(`${API_URL}/reputation/${wallet}`);
      setReputation(response.data);
    } catch (err) {
      setReputation(null);
      setError(err.response?.data?.message || 'No reputation record found for this wallet.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Unable to stop QR scanner', err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const startScanner = async () => {
    setError('');
    setScanning(true);
    const scanner = new Html5Qrcode('reputation-qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await stopScanner();
          await loadReputation(decodedText);
        },
        () => {}
      );
    } catch (err) {
      setScanning(false);
      setError('Camera access failed. Check browser permissions or upload an image instead.');
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setError('');
    const scanner = new Html5Qrcode('reputation-qr-file-reader');
    try {
      const decodedText = await scanner.scanFile(file, true);
      await loadReputation(decodedText);
    } catch {
      setError('Could not read a QR code from that image.');
    } finally {
      scanner.clear();
    }
  };

  useEffect(() => () => { stopScanner(); }, []);

  const trustColors = {
    Excellent: '#2E7D32', Good: '#66BB6A', Average: '#FBC02D',
    Poor: '#F57C00', Critical: '#C62828'
  };

  return (
    <section className="scanner-card">
      <h3>Scan Client Reputation QR</h3>
      <p>Scan a client&apos;s TABASC QR code to view their verified reputation score.</p>
      <div id="reputation-qr-reader" style={{ display: scanning ? 'block' : 'none' }} />
      <div className="scanner-actions">
        {!scanning && <button onClick={startScanner}>Use Camera</button>}
        {scanning && <button onClick={stopScanner}>Stop Camera</button>}
        <label>
          Upload QR Image
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>
      <div id="reputation-qr-file-reader" style={{ display: 'none' }} />
      {error && <p className="error-message">{error}</p>}
      {reputation && (
        <div className="reputation-result" style={{ borderLeft: `6px solid ${trustColors[reputation.trustLevel] || '#999'}` }}>
          <h4 style={{ margin: '0 0 8px' }}>Verified Reputation</h4>
          <p><strong>Wallet:</strong> {walletAddress}</p>
          <p style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0' }}>
            {reputation.finalScore} / 1000
          </p>
          <p style={{ color: trustColors[reputation.trustLevel] || '#666', fontWeight: 'bold' }}>
            {reputation.trustLevel}
          </p>
          <p>Based on {reputation.totalBatches} evaluated batches</p>
        </div>
      )}
    </section>
  );
}

export default ReputationScanner;
