#!/usr/bin/env node
// Re-displays the pairing QR code for connecting additional devices.
// Reads setup info saved during install.
// Usage: node scripts/show-qr.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const setupPath = path.join(os.homedir(), ".enso", "enso-setup.json");

if (!fs.existsSync(setupPath)) {
  console.error("No setup info found at", setupPath);
  console.error("Run the install script first: scripts/install.sh or scripts\\install.ps1");
  process.exit(1);
}

const setup = JSON.parse(fs.readFileSync(setupPath, "utf-8"));

// Try to get fresh LAN IPs
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Try to read access token from server/.env
function getAccessToken() {
  try {
    // Look for server/.env relative to this script
    const scriptDir = __dirname;
    const repoDir = path.dirname(scriptDir);
    const envPath = path.join(repoDir, "server", ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^ENSO_ACCESS_TOKEN=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // Fall through
  }
  // Fallback to setup.json token
  return setup.accessToken || "";
}

const token = getAccessToken();
const lanIps = getLanIps();
const port = setup.port || 3001;
const name = setup.machineName || os.hostname();

if (!token) {
  console.error("Could not determine access token. Check server/.env or re-run the install script.");
  process.exit(1);
}

console.log();
console.log("=== Enso Pairing ===");
console.log();
console.log("Machine:", name);
console.log("LAN addresses:");
lanIps.forEach((ip) => console.log("  http://" + ip + ":" + port));
console.log();

// Generate QR for each LAN IP
const primaryIp = lanIps[0] || "localhost";
const deepLink = `enso://connect?backend=http://${primaryIp}:${port}&token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;

try {
  execFileSync(process.execPath, [path.join(__dirname, "qr-terminal.js"), deepLink], { stdio: "inherit" });
} catch {
  console.log("Deep link:", deepLink);
}

console.log("Scan this QR code with your phone camera to connect the Enso app.");
console.log();
if (lanIps.length > 1) {
  console.log("If the first address doesn't work, try manually entering one of the others.");
  console.log();
}
