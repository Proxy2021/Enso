export default function GeneratedUI({ data, onAction }) {
  const [typeText, setTypeText] = useState("");
  const [mousePos, setMousePos] = useState(null);
  const [lastClickPos, setLastClickPos] = useState(null);

  // ── Error view ──
  if (data && data.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Remote Desktop Error"
          description={data.error}
          action={
            <Button size="sm" onClick={() => onAction("capture", {})}>
              <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  // ── Initial state — no screenshot yet ──
  if (!data || !data.screenshot) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.Monitor className="w-8 h-8 text-blue-400" />}
          title="Remote Desktop"
          description="Capture the desktop screen to begin remote control"
          action={
            <Button size="sm" variant="primary" onClick={() => onAction("capture", {})}>
              <LucideReact.Camera className="w-3.5 h-3.5 mr-1.5" /> Capture Screen
            </Button>
          }
        />
      </div>
    );
  }

  // ── Active view ──
  var screenW = data.width || 1920;
  var screenH = data.height || 1080;

  var handleImageClick = function (e) {
    var rect = e.currentTarget.getBoundingClientRect();
    var clickX = e.clientX - rect.left;
    var clickY = e.clientY - rect.top;
    var displayW = rect.width;
    var displayH = rect.height;
    var origX = Math.round((clickX / displayW) * screenW);
    var origY = Math.round((clickY / displayH) * screenH);
    setLastClickPos({ x: origX, y: origY });
    onAction("click", { x: origX, y: origY, button: "left" });
  };

  var handleImageDblClick = function (e) {
    var rect = e.currentTarget.getBoundingClientRect();
    var clickX = e.clientX - rect.left;
    var clickY = e.clientY - rect.top;
    var displayW = rect.width;
    var displayH = rect.height;
    var origX = Math.round((clickX / displayW) * screenW);
    var origY = Math.round((clickY / displayH) * screenH);
    setLastClickPos({ x: origX, y: origY });
    onAction("click", { x: origX, y: origY, button: "double" });
  };

  var handleRightClick = function (e) {
    e.preventDefault();
    var rect = e.currentTarget.getBoundingClientRect();
    var clickX = e.clientX - rect.left;
    var clickY = e.clientY - rect.top;
    var displayW = rect.width;
    var displayH = rect.height;
    var origX = Math.round((clickX / displayW) * screenW);
    var origY = Math.round((clickY / displayH) * screenH);
    setLastClickPos({ x: origX, y: origY });
    onAction("click", { x: origX, y: origY, button: "right" });
  };

  var handleMouseMove = function (e) {
    var rect = e.currentTarget.getBoundingClientRect();
    var x = Math.round(((e.clientX - rect.left) / rect.width) * screenW);
    var y = Math.round(((e.clientY - rect.top) / rect.height) * screenH);
    setMousePos({ x: x, y: y });
  };

  var handleScroll = function (direction) {
    var x = mousePos ? mousePos.x : Math.round(screenW / 2);
    var y = mousePos ? mousePos.y : Math.round(screenH / 2);
    onAction("scroll", { x: x, y: y, direction: direction, amount: 3 });
  };

  var handleType = function () {
    if (!typeText.trim()) return;
    onAction("type", { text: typeText });
    setTypeText("");
  };

  var handleTypeKeyDown = function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleType();
    }
  };

  var keyCombos = [
    { label: "Enter", combo: "enter", icon: "CornerDownLeft" },
    { label: "Esc", combo: "escape", icon: null },
    { label: "Tab", combo: "tab", icon: null },
    { label: "Bksp", combo: "backspace", icon: "Delete" },
    { label: "Del", combo: "delete", icon: null },
    { label: "Ctrl+C", combo: "control+c", icon: null },
    { label: "Ctrl+V", combo: "control+v", icon: null },
    { label: "Ctrl+A", combo: "control+a", icon: null },
    { label: "Ctrl+Z", combo: "control+z", icon: null },
    { label: "Alt+Tab", combo: "alt+tab", icon: null },
    { label: "Ctrl+S", combo: "control+s", icon: null },
    { label: "Win", combo: "meta", icon: null },
  ];

  return (
    <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LucideReact.Monitor className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Remote Desktop</span>
          <Badge variant="outline">{screenW} x {screenH}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {mousePos && (
            <span className="text-[10px] text-gray-500 font-mono tabular-nums">
              {mousePos.x}, {mousePos.y}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => onAction("capture", {})}>
            <LucideReact.RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Screenshot Display */}
      <div
        className="rounded-xl overflow-hidden bg-black/40 border border-gray-700/50 relative"
        style={{ cursor: "default" }}
      >
        <img
          src={data.screenshot}
          alt="Remote Desktop"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            userSelect: "none",
            pointerEvents: "auto",
          }}
          onClick={handleImageClick}
          onDoubleClick={handleImageDblClick}
          onContextMenu={handleRightClick}
          onMouseMove={handleMouseMove}
          draggable={false}
        />
      </div>

      {/* Type Input */}
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Input
            placeholder="Type text and press Enter..."
            value={typeText}
            onChange={setTypeText}
            onKeyDown={handleTypeKeyDown}
            icon={<LucideReact.Keyboard className="w-3.5 h-3.5" />}
            size="sm"
          />
        </div>
        <Button size="sm" variant="primary" onClick={handleType} disabled={!typeText.trim()}>
          <LucideReact.Send className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Key Combos + Scroll */}
      <div className="flex items-center gap-1 flex-wrap">
        {keyCombos.map(function (k, i) {
          return (
            <button
              key={i}
              onClick={function () { onAction("key", { combo: k.combo }); }}
              className="px-2 py-1 text-[10px] bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 hover:border-blue-500/30 cursor-pointer text-gray-300 font-mono transition-all active:scale-95"
              title={k.combo}
            >
              {k.label}
            </button>
          );
        })}

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Arrow keys */}
        <button
          onClick={function () { onAction("key", { combo: "up" }); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Up Arrow"
        >
          <LucideReact.ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={function () { onAction("key", { combo: "down" }); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Down Arrow"
        >
          <LucideReact.ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={function () { onAction("key", { combo: "left" }); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Left Arrow"
        >
          <LucideReact.ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={function () { onAction("key", { combo: "right" }); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Right Arrow"
        >
          <LucideReact.ChevronRight className="w-3.5 h-3.5" />
        </button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Scroll */}
        <button
          onClick={function () { handleScroll("up"); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Scroll Up"
        >
          <LucideReact.ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={function () { handleScroll("down"); }}
          className="p-1 bg-gray-800/60 rounded-lg border border-gray-700/40 hover:bg-gray-700/60 cursor-pointer text-gray-400 transition-all active:scale-95"
          title="Scroll Down"
        >
          <LucideReact.ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Footer */}
      {data.timestamp && (
        <div className="text-[10px] text-gray-600 text-right">
          Last capture: {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
