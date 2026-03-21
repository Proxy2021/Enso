# Enso Server Setup

This directory contains the Enso backend server. For the complete setup guide (standalone mode, Cloudflare tunnel, remote access, OpenClaw integration), see the **[main SETUP.md](../SETUP.md)** in the project root.

## Quick Reference

```bash
# Start standalone server
npx tsx standalone.ts

# Or from project root
npm run dev:server
```

## Environment Variables

Create a `.env` file in this directory:

```env
GEMINI_API_KEY=your-key-here
# ENSO_ACCESS_TOKEN=your-secret    # auto-generated if omitted
# ENSO_MACHINE_NAME=My Desktop     # shown in Connection Picker
```
