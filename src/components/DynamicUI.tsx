import React, { useMemo, useState } from "react";
import { compileComponent } from "../lib/sandbox";
import { useChatStore } from "../store/chat";

class UIErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          <strong>Render error:</strong> {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

interface DynamicUIProps {
  componentCode: string;
  data: unknown;
}

export default function DynamicUI({ componentCode, data }: DynamicUIProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [showSource, setShowSource] = useState(false);

  const result = useMemo(() => compileComponent(componentCode), [componentCode]);

  if (result.error) {
    return (
      <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-sm mt-2">
        <div className="flex items-center justify-between text-amber-300">
          <span>
            <strong>Compile error:</strong> {result.error}
          </span>
          <button
            onClick={() => setShowSource(!showSource)}
            className="text-xs underline ml-2 shrink-0"
          >
            {showSource ? "Hide source" : "Show source"}
          </button>
        </div>
        {showSource && (
          <pre className="mt-2 text-xs text-gray-400 overflow-auto max-h-48 bg-gray-900 p-2 rounded">
            {componentCode}
          </pre>
        )}
      </div>
    );
  }

  const Comp = result.Component!;

  return (
    <div className="mt-2 -mx-4 -mb-2.5">
      <UIErrorBoundary>
        <Comp data={data} sendMessage={sendMessage} theme="dark" />
      </UIErrorBoundary>
    </div>
  );
}
