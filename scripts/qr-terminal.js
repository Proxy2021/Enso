#!/usr/bin/env node
// Prints a QR code to the terminal for the given URL.
// Usage: node scripts/qr-terminal.js <url>

const QRCode = require("qrcode");

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/qr-terminal.js <url>");
  process.exit(1);
}

QRCode.toString(url, { type: "terminal", small: true }, (err, qr) => {
  if (err) {
    console.error("Failed to generate QR code:", err.message);
    process.exit(1);
  }
  console.log();
  console.log(qr);
  console.log("  URL:", url);
  console.log();
});
