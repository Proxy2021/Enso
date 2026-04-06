import { useState, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";

interface OnboardingSource {
  id: string;
  icon: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const SOURCES: OnboardingSource[] = [
  { id: "browserHistory", icon: "🌐", label: "Browser", description: "History + bookmarks from Chrome/Edge", defaultEnabled: true },
  { id: "bookmarks", icon: "🔖", label: "Bookmarks", description: "Saved sites organized by folder", defaultEnabled: true },
  { id: "files", icon: "📁", label: "Projects", description: "Detect software projects and tech stacks", defaultEnabled: true },
  { id: "email", icon: "📧", label: "Email", description: "Communication patterns from Outlook/IMAP", defaultEnabled: false },
  { id: "system", icon: "💻", label: "System", description: "Installed apps and environment", defaultEnabled: true },
  { id: "kindleLibrary", icon: "📚", label: "Kindle", description: "Amazon Kindle book collection", defaultEnabled: false },
];

type Phase = "select" | "scanning" | "complete";
interface ScanStep { step: string; status: "pending" | "running" | "done" | "error"; detail?: string }

export default function DataSourceOnboarding() {
  const connectionState = useChatStore((s) => s.connectionState);
  const wsClient = useChatStore((s) => s._wsClient);
  const { t } = useT();

  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("select");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of SOURCES) init[s.id] = s.defaultEnabled;
    return init;
  });
  const [steps, setSteps] = useState<ScanStep[]>([]);
  const [result, setResult] = useState<{ pagesCreated: number; interestsFound: number; tasksCreated: number } | null>(null);

  // Check if this is a first run
  useEffect(() => {
    if (connectionState !== "connected" || !wsClient) return;
    // Request context status to detect first run
    wsClient.send({ type: "settings.get_context_status" } as never);
  }, [connectionState, wsClient]);

  // Listen for context status response to detect first run
  useEffect(() => {
    const contextUpdate = useChatStore.getState()._contextUpdate;
    if (contextUpdate?.contextStatus) {
      const status = contextUpdate.contextStatus as {
        consent?: Record<string, boolean>;
        scanLog?: Record<string, number>;
        isFirstRun?: boolean;
      };
      // First run: no consent enabled AND no scan log entries
      if (status.isFirstRun) {
        setShow(true);
      }
    }
  });

  // Listen for onboarding progress from server
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const update = state._onboardingUpdate;
      if (!update) return;
      if (update.step) {
        setSteps(prev => {
          const existing = prev.findIndex(s => s.step === update.step);
          if (existing >= 0) {
            const copy = [...prev];
            copy[existing] = update as ScanStep;
            return copy;
          }
          return [...prev, update as ScanStep];
        });
      }
      if (update.complete) {
        setResult(update.result as { pagesCreated: number; interestsFound: number; tasksCreated: number });
        setPhase("complete");
      }
    });
    return unsub;
  }, []);

  function handleStart() {
    const selectedSources = Object.entries(enabled).filter(([, v]) => v).map(([k]) => k);
    if (selectedSources.length === 0) { handleSkip(); return; }

    setPhase("scanning");
    // Initialize pending steps
    setSteps(selectedSources.map(id => ({ step: `scan-${id}`, status: "pending" as const, detail: SOURCES.find(s => s.id === id)?.label })));

    // Send onboarding request to server
    wsClient?.send({ type: "onboarding.setup", sources: selectedSources, createTasks: true } as never);
  }

  function handleSkip() {
    // Mark as done without scanning
    wsClient?.send({ type: "onboarding.skip" } as never);
    setShow(false);
  }

  function handleDone() {
    setShow(false);
  }

  if (!show) return null;

  const selectedCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">

        {/* Phase 1: Source Selection */}
        {phase === "select" && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="text-3xl mb-2">🧠</div>
              <h2 className="text-xl font-semibold text-gray-100">Connect Your Data</h2>
              <p className="text-sm text-gray-400 mt-2">
                Enable sources to build your Knowledge Cortex — Enso learns your interests, projects, and patterns for deeply personalized AI.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {SOURCES.map(src => (
                <button
                  key={src.id}
                  onClick={() => setEnabled(prev => ({ ...prev, [src.id]: !prev[src.id] }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-150 ${
                    enabled[src.id]
                      ? "border-indigo-500/60 bg-indigo-500/10"
                      : "border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50"
                  }`}
                >
                  <span className="text-2xl">{src.icon}</span>
                  <span className="text-xs font-medium text-gray-200">{src.label}</span>
                  <span className="text-[10px] text-gray-500 text-center leading-tight">{src.description}</span>
                  <div className={`w-4 h-4 rounded-full border-2 mt-1 transition-colors ${
                    enabled[src.id] ? "bg-indigo-500 border-indigo-500" : "border-gray-600"
                  }`}>
                    {enabled[src.id] && (
                      <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 text-center mb-4">
              All data stays on your server. Only compact summaries are used in conversations.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 transition-colors"
              >Skip</button>
              <button
                onClick={handleStart}
                className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
              >Get Started ({selectedCount})</button>
            </div>
          </div>
        )}

        {/* Phase 2: Scanning Progress */}
        {phase === "scanning" && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-100">Building Your Cortex</h2>
              <p className="text-sm text-gray-400 mt-1">Scanning sources and creating knowledge pages...</p>
            </div>

            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {step.status === "done" && <span className="text-emerald-400">✓</span>}
                    {step.status === "running" && <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
                    {step.status === "pending" && <span className="text-gray-600">○</span>}
                    {step.status === "error" && <span className="text-red-400">✗</span>}
                  </div>
                  <span className={`text-sm ${step.status === "done" ? "text-gray-300" : step.status === "running" ? "text-indigo-300" : step.status === "error" ? "text-red-400" : "text-gray-500"}`}>
                    {step.detail || step.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 3: Complete */}
        {phase === "complete" && result && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="text-3xl mb-2">✨</div>
              <h2 className="text-lg font-semibold text-gray-100">Your Cortex is Ready</h2>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center p-3 rounded-lg bg-gray-800/50 border border-gray-700/40">
                <div className="text-2xl font-bold text-indigo-400">{result.pagesCreated}</div>
                <div className="text-[10px] text-gray-500 mt-1">pages created</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-800/50 border border-gray-700/40">
                <div className="text-2xl font-bold text-emerald-400">{result.interestsFound}</div>
                <div className="text-[10px] text-gray-500 mt-1">interests found</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-800/50 border border-gray-700/40">
                <div className="text-2xl font-bold text-amber-400">{result.tasksCreated}</div>
                <div className="text-[10px] text-gray-500 mt-1">tasks created</div>
              </div>
            </div>

            {result.tasksCreated > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                <p className="text-xs text-gray-400 mb-2">Scheduled tasks enabled:</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-emerald-400">✓</span> Cortex Daily Discovery (8am daily)
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-emerald-400">✓</span> Weekly Profile Refresh (Monday 9am)
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDone}
              className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
            >Start Chatting →</button>
          </div>
        )}
      </div>
    </div>
  );
}
