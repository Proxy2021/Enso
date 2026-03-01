import { useState, useCallback, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { loadBackends, addBackend, type BackendConfig } from "../lib/connection";

type Step = "welcome" | "os" | "install" | "connect" | "connected";
type OS = "windows" | "macos" | "linux";

const REPO_URL = "https://github.com/Proxy2021/Enso.git";

function getInstallCommands(os: OS): string[] {
  if (os === "windows") {
    return [
      `git clone ${REPO_URL}`,
      `cd Enso`,
      `.\\scripts\\install.ps1`,
    ];
  }
  return [
    `git clone ${REPO_URL}`,
    `cd Enso`,
    `./scripts/install.sh`,
  ];
}

// ─── Step Components ─────────────────────────────────────────────────────

function WelcomeStep({ onSetup, onManual }: { onSetup: () => void; onManual: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8 gap-8">
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
        </svg>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white">Welcome to Enso</h1>
        <p className="text-gray-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto">
          Every answer is an app. Set up your Enso server to get started.
        </p>
      </div>

      <div className="w-full space-y-3 max-w-xs">
        <button
          onClick={onSetup}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
        >
          Set up a new server
        </button>
        <button
          onClick={onManual}
          className="w-full py-3 px-4 rounded-xl border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white transition-colors text-sm"
        >
          I already have a server
        </button>
      </div>
    </div>
  );
}

function OSStep({ onSelect, onBack }: { onSelect: (os: OS) => void; onBack: () => void }) {
  const options: { os: OS; label: string; icon: React.ReactNode }[] = [
    {
      os: "windows",
      label: "Windows",
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
        </svg>
      ),
    },
    {
      os: "macos",
      label: "macOS",
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ),
    },
    {
      os: "linux",
      label: "Linux",
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.868.065 1.157-.505 1.303-.748.145-.243.197-.474.135-.773a1.67 1.67 0 00-.354-.532c-.264-.265-.564-.456-.801-.473l-.246-.015c-.18-.012-.37-.024-.514-.138a.524.524 0 01-.105-.217 2.126 2.126 0 01-.09-.596c.007-.27.057-.556.102-.795.082-.543.033-1.04-.098-1.444a2.856 2.856 0 00-.444-.727l-.002-.003c-.476-.6-1.086-1.025-1.586-1.57-.497-.542-.87-1.255-.797-2.332.02-.262.071-.527.127-.785.114-.52.249-1.024.303-1.56.076-.78-.046-1.59-.576-2.27-.5-.641-1.339-.892-2.2-.93a4.507 4.507 0 00-.876.044z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col px-6 py-8 gap-6">
      <div>
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 transition-colors mb-4 flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className="text-xl font-semibold text-white">What runs on your PC?</h2>
        <p className="text-gray-400 text-sm mt-1">Select the operating system of the computer you want to use as your server.</p>
      </div>

      <div className="space-y-3">
        {options.map(({ os, label, icon }) => (
          <button
            key={os}
            onClick={() => onSelect(os)}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/80 hover:border-gray-600/60 transition-all text-left"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-300">
              {icon}
            </div>
            <span className="text-sm font-medium text-gray-200">{label}</span>
            <svg className="w-4 h-4 text-gray-600 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function InstallStep({ os, onNext, onBack }: { os: OS; onNext: () => void; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const commands = getInstallCommands(os);
  const allCommands = commands.join("\n");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(allCommands);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }, [allCommands]);

  const termLabel = os === "windows" ? "PowerShell" : "Terminal";

  return (
    <div className="flex flex-col px-6 py-8 gap-6">
      <div>
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 transition-colors mb-4 flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className="text-xl font-semibold text-white">Run on your PC</h2>
        <p className="text-gray-400 text-sm mt-1">
          Open <span className="text-gray-200 font-medium">{termLabel}</span> on your computer and paste these commands:
        </p>
      </div>

      {/* Command block */}
      <div className="relative rounded-xl border border-gray-700/50 bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/60 bg-gray-900/50">
          <span className="text-[11px] text-gray-500 font-mono">{termLabel}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        <div className="px-4 py-3 font-mono text-sm text-gray-200 space-y-0.5">
          {commands.map((cmd, i) => (
            <div key={i} className="flex">
              <span className="text-gray-600 select-none mr-2">$</span>
              <span>{cmd}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/30 rounded-xl px-4 py-3 border border-gray-700/30">
        <p className="text-xs text-gray-400 leading-relaxed">
          The script will install dependencies, configure the server, and display a <strong className="text-gray-300">QR code</strong> when ready.
        </p>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
      >
        I see the QR code →
      </button>
    </div>
  );
}

function ConnectStep({
  onManual,
  onBack,
  onConnected,
}: {
  onManual: () => void;
  onBack: () => void;
  onConnected: (name: string) => void;
}) {
  const connectionState = useChatStore((s) => s.connectionState);
  const [manualMode, setManualMode] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const connectToBackend = useChatStore((s) => s.connectToBackend);

  // When WS connects via deep link, auto-advance
  useEffect(() => {
    if (connectionState === "connected") {
      // Small delay so user sees the connected state
      const t = setTimeout(() => {
        const backends = loadBackends();
        const last = backends[backends.length - 1];
        onConnected(last?.name ?? "Server");
      }, 800);
      return () => clearTimeout(t);
    }
  }, [connectionState, onConnected]);

  function handleTest() {
    const testUrl = url.replace(/\/+$/, "");
    if (!testUrl) { setTestMsg("Enter a URL first"); setTestStatus("fail"); return; }
    setTestStatus("testing");
    setTestMsg("");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`${testUrl}/health`, { headers, signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.status === "ok") {
          setTestStatus("ok");
          const machine = data.machine as { name?: string } | undefined;
          if (machine?.name && !name.trim()) setName(machine.name);
          setTestMsg(machine?.name ?? "Connected");
        } else {
          setTestStatus("fail");
          setTestMsg("Unexpected response");
        }
      })
      .catch((err: Error) => {
        setTestStatus("fail");
        setTestMsg(err.message || "Connection failed");
      });
  }

  function handleManualConnect() {
    if (!url.trim()) return;
    const config = addBackend({
      name: name.trim() || new URL(url).hostname,
      url: url.replace(/\/+$/, ""),
      token: token.trim(),
    });
    connectToBackend(config);
    onConnected(config.name);
  }

  if (manualMode) {
    return (
      <div className="flex flex-col px-6 py-8 gap-6">
        <div>
          <button onClick={() => setManualMode(false)} className="text-gray-500 hover:text-gray-300 transition-colors mb-4 flex items-center gap-1 text-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <h2 className="text-xl font-semibold text-white">Manual Connection</h2>
          <p className="text-gray-400 text-sm mt-1">Enter your server details below.</p>
        </div>

        <div className="space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.x:3001"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token"
            type="password"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testStatus === "testing"}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 transition-colors disabled:opacity-50"
          >
            {testStatus === "testing" ? "Testing..." : "Test"}
          </button>
          {testStatus === "ok" && <span className="text-xs text-emerald-400">{testMsg}</span>}
          {testStatus === "fail" && <span className="text-xs text-red-400">{testMsg}</span>}
        </div>

        <button
          onClick={handleManualConnect}
          disabled={!url.trim()}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm disabled:opacity-40"
        >
          Connect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center px-6 py-8 gap-8">
      <div>
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 transition-colors mb-4 flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      {/* Scanning animation */}
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-gray-600 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h3" /><path d="M17 4h3v3" /><path d="M20 17v3h-3" /><path d="M7 20H4v-3" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-white">Scan the QR Code</h2>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed max-w-xs mx-auto">
          Point your phone's camera at the QR code shown on your PC screen. The app will connect automatically.
        </p>
      </div>

      {connectionState === "connecting" && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Connecting...
        </div>
      )}

      <button
        onClick={() => {
          setManualMode(true);
          onManual();
        }}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
      >
        Enter server details manually
      </button>
    </div>
  );
}

function ConnectedStep({ machineName, onFinish }: { machineName: string; onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8 gap-8">
      <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <svg className="w-10 h-10 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-white">Connected!</h2>
        <p className="text-gray-400 text-sm mt-2">
          You're connected to <span className="text-gray-200 font-medium">{machineName}</span>
        </p>
      </div>

      <button
        onClick={onFinish}
        className="w-full max-w-xs py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
      >
        Get Started
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function SetupWizard() {
  const show = useChatStore((s) => s.showSetupWizard);
  const setShow = useChatStore((s) => s.setShowSetupWizard);
  const setShowConnectionPicker = useChatStore((s) => s.setShowConnectionPicker);

  const [step, setStep] = useState<Step>("welcome");
  const [selectedOS, setSelectedOS] = useState<OS>("windows");
  const [connectedName, setConnectedName] = useState("Server");

  const handleFinish = useCallback(() => {
    setShow(false);
    setStep("welcome");
  }, [setShow]);

  const handleManual = useCallback(() => {
    // "I already have a server" → show ConnectionPicker
    setShow(false);
    setShowConnectionPicker(true);
  }, [setShow, setShowConnectionPicker]);

  const handleConnected = useCallback((name: string) => {
    setConnectedName(name);
    setStep("connected");
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-gray-900 border border-gray-800/60 rounded-2xl shadow-2xl overflow-hidden">
        {step === "welcome" && (
          <WelcomeStep onSetup={() => setStep("os")} onManual={handleManual} />
        )}
        {step === "os" && (
          <OSStep
            onSelect={(os) => { setSelectedOS(os); setStep("install"); }}
            onBack={() => setStep("welcome")}
          />
        )}
        {step === "install" && (
          <InstallStep
            os={selectedOS}
            onNext={() => setStep("connect")}
            onBack={() => setStep("os")}
          />
        )}
        {step === "connect" && (
          <ConnectStep
            onManual={() => {}}
            onBack={() => setStep("install")}
            onConnected={handleConnected}
          />
        )}
        {step === "connected" && (
          <ConnectedStep machineName={connectedName} onFinish={handleFinish} />
        )}
      </div>
    </div>
  );
}
