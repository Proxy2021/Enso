# Enso Server Setup

This directory contains the Enso backend server. For the complete setup guide (standalone mode, Cloudflare tunnel, remote access, OpenClaw integration), see the **[main SETUP.md](../SETUP.md)** in the project root.

## Quick Reference

```bash
# Start standalone server
npx tsx standalone.ts

# Or from project root
npm run dev:server
```

## CLI

The setup script (`scripts/install.sh` or `scripts/install.ps1`) installs the `enso` command globally. Once the server is running you can use it from any terminal:

```bash
enso status                          # server health check
enso chat "What is quantum computing?"
enso research "AI trends in 2026"
enso apps list
enso apps run photobook browse
enso --json chat "Hello"             # NDJSON output for scripting
```

Configuration is stored in `~/.enso/cli.json` (server URL and access token). You can also pass `--server` / `--token` flags or set `ENSO_SERVER` / `ENSO_TOKEN` environment variables.

## Environment Variables

Create a `.env` file in this directory:

```env
GEMINI_API_KEY=your-key-here
# ENSO_ACCESS_TOKEN=your-secret    # auto-generated if omitted
# ENSO_MACHINE_NAME=My Desktop     # shown in Connection Picker
```
