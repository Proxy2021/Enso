import type { ToolTemplate } from "../registry.js";

export function isClawHubSignature(signatureId: string): boolean {
  return signatureId === "clawhub_store";
}

export function getClawHubTemplateCode(_signature: ToolTemplate): string {
  return CLAWHUB_TEMPLATE;
}

const CLAWHUB_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("browse");
  const [confirmSlug, setConfirmSlug] = useState(null);

  const skills = Array.isArray(data?.skills) ? data.skills : [];
  const installedSlugs = Array.isArray(data?.installedSlugs) ? data.installedSlugs : [];
  const installedSet = useMemo(() => new Set(installedSlugs), [installedSlugs]);
  const hasError = !!data?.error;
  const errorMsg = String(data?.message ?? "");

  const isBrowse = data?.tool === "enso_clawhub_browse";
  const isSearch = data?.tool === "enso_clawhub_search";
  const isInspect = data?.tool === "enso_clawhub_inspect";
  const isInstalled = data?.tool === "enso_clawhub_installed";
  const isInstallResult = data?.tool === "enso_clawhub_install";
  const isUninstallResult = data?.tool === "enso_clawhub_uninstall";
  const isActionResult = isInstallResult || isUninstallResult;

  const doSearch = () => {
    const q = searchQuery.trim();
    if (q) onAction("search", { query: q });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") doSearch();
  };

  // ── CLI not found state ──
  if (hasError && errorMsg.includes("not found")) {
    return (
      <UICard accent="red" header="ClawHub CLI Required">
        <div className="space-y-3">
          <EmptyState
            icon={<LucideReact.AlertTriangle size={28} />}
            title="clawhub CLI not installed"
            description="The ClawHub CLI is needed to browse and manage skills."
          />
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Install with npm:</div>
            <code className="text-sm text-emerald-400">npm install -g clawhub</code>
          </div>
          <Button variant="primary" onClick={() => onAction("browse", {})}>
            Retry
          </Button>
        </div>
      </UICard>
    );
  }

  // ── Install / Uninstall result ──
  if (isActionResult) {
    const success = !!data?.success;
    return (
      <UICard accent={success ? "emerald" : "red"} header={isInstallResult ? "Skill Install" : "Skill Uninstall"}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {success
              ? <LucideReact.CheckCircle size={20} className="text-emerald-400" />
              : <LucideReact.XCircle size={20} className="text-red-400" />
            }
            <span className="text-sm text-gray-200">{String(data?.message ?? (success ? "Done" : "Failed"))}</span>
          </div>
          {data?.slug && (
            <Badge variant={success ? "success" : "destructive"}>{String(data.slug)}</Badge>
          )}
          {success && isInstallResult && (
            <div className="bg-gray-800 rounded-lg p-2.5 border border-gray-700 text-xs text-gray-400">
              The skill is now available to OpenClaw agents. If the gateway was already running, a reload may be needed for the agent to pick up the new skill.
            </div>
          )}
          <Separator />
          <div className="flex gap-2">
            <Button variant="secondary" icon={<LucideReact.ArrowLeft size={14} />} onClick={() => onAction("browse", {})}>
              Browse
            </Button>
            <Button variant="secondary" icon={<LucideReact.Package size={14} />} onClick={() => onAction("installed", {})}>
              Installed
            </Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Inspect detail view ──
  if (isInspect && !hasError) {
    const slug = String(data?.slug ?? "");
    const name = String(data?.name ?? slug);
    const emoji = String(data?.emoji ?? "");
    const desc = String(data?.description ?? "");
    const version = String(data?.version ?? "");
    const author = String(data?.author ?? "");
    const readme = String(data?.readme ?? "");
    const reqEnv = Array.isArray(data?.requires?.env) ? data.requires.env : [];
    const reqBins = Array.isArray(data?.requires?.bins) ? data.requires.bins : [];
    const isInst = !!data?.installed;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onAction("browse", {})}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            <LucideReact.ArrowLeft size={14} /> Back to store
          </button>
          {isInst
            ? <Badge variant="success">Installed</Badge>
            : <Badge variant="outline">Not installed</Badge>
          }
        </div>

        <UICard accent="blue">
          <div className="flex items-start gap-3">
            {emoji && <span className="text-3xl">{emoji}</span>}
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-gray-100">{name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                {version && <span>v{version}</span>}
                {author && <span>by {author}</span>}
              </div>
            </div>
          </div>
        </UICard>

        {(reqEnv.length > 0 || reqBins.length > 0) && (
          <UICard accent="amber" header="Requirements">
            <div className="flex flex-wrap gap-1.5">
              {reqEnv.map((e, i) => (
                <Badge key={"env-" + i} variant="outline">
                  <LucideReact.Key size={10} className="mr-1" />{String(e)}
                </Badge>
              ))}
              {reqBins.map((b, i) => (
                <Badge key={"bin-" + i} variant="outline">
                  <LucideReact.Terminal size={10} className="mr-1" />{String(b)}
                </Badge>
              ))}
            </div>
          </UICard>
        )}

        {readme && (
          <Accordion
            type="single"
            items={[{
              value: "readme",
              title: "README",
              content: (
                <div className="text-xs text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                  {readme}
                </div>
              ),
            }]}
          />
        )}

        <div className="flex gap-2">
          {isInst ? (
            <Button
              variant="destructive"
              icon={<LucideReact.Trash2 size={14} />}
              onClick={() => onAction("uninstall", { slug })}
            >
              Uninstall
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<LucideReact.Download size={14} />}
              onClick={() => onAction("install", { slug })}
            >
              Install
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Browse / Search / Installed list view ──
  const viewTitle = isInstalled ? "Installed Skills" : isSearch ? "Search Results" : "ClawHub Store";
  const viewAccent = isInstalled ? "emerald" : isSearch ? "purple" : "blue";
  const query = String(data?.query ?? "");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LucideReact.Store size={18} className="text-blue-400" />
          <div>
            <div className="text-sm font-semibold text-gray-100">{viewTitle}</div>
            <div className="text-[11px] text-gray-500">
              {isInstalled
                ? skills.length + " skill" + (skills.length !== 1 ? "s" : "") + " installed"
                : isSearch
                  ? (data?.totalFound ?? skills.length) + " result" + (skills.length !== 1 ? "s" : "") + " for \\u201c" + query + "\\u201d"
                  : "Discover and install OpenClaw skills"
              }
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onAction("browse", {})}
            className={"px-2.5 py-1 text-xs rounded-full border cursor-pointer " + (isBrowse || isSearch ? "bg-blue-600/30 border-blue-500/50 text-blue-300" : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700")}
          >
            Browse
          </button>
          <button
            onClick={() => onAction("installed", {})}
            className={"px-2.5 py-1 text-xs rounded-full border cursor-pointer " + (isInstalled ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700")}
          >
            Installed
          </button>
        </div>
      </div>

      {/* Search bar (shown on browse/search) */}
      {!isInstalled && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search skills... (e.g. calendar, email, scraping)"
              value={searchQuery}
              onChange={(v) => setSearchQuery(typeof v === "string" ? v : v?.target?.value ?? "")}
              onKeyDown={handleKeyDown}
              icon={<LucideReact.Search size={14} />}
            />
          </div>
          <Button variant="primary" onClick={doSearch} icon={<LucideReact.Search size={14} />}>
            Search
          </Button>
        </div>
      )}

      {/* Category quick filters (browse only) */}
      {isBrowse && !hasError && (
        <div className="flex flex-wrap gap-1.5">
          {["productivity", "developer tools", "data analysis", "communication", "automation"].map((cat) => (
            <button
              key={cat}
              onClick={() => onAction("search", { query: cat })}
              className="px-2.5 py-1 text-[11px] rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 cursor-pointer capitalize"
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {hasError && !errorMsg.includes("not found") && (
        <UICard accent="red">
          <div className="flex items-center gap-2 text-sm text-red-300">
            <LucideReact.AlertTriangle size={16} />
            {errorMsg || "Something went wrong"}
          </div>
        </UICard>
      )}

      {/* Empty state */}
      {!hasError && skills.length === 0 && (
        <EmptyState
          icon={<LucideReact.PackageSearch size={28} />}
          title={isInstalled ? "No skills installed" : "No skills found"}
          description={isInstalled ? "Browse the store to discover and install skills." : "Try a different search query."}
          action={
            isInstalled
              ? { label: "Browse Store", onClick: () => onAction("browse", {}) }
              : undefined
          }
        />
      )}

      {/* Skill cards grid */}
      {skills.length > 0 && (
        <div className="grid grid-cols-1 gap-2 max-h-[420px] overflow-y-auto pr-1">
          {skills.map((skill, idx) => {
            const slug = String(skill?.slug ?? skill?.name ?? "");
            const name = String(skill?.name ?? slug);
            const emoji = String(skill?.emoji ?? "");
            const desc = String(skill?.description ?? "");
            const version = String(skill?.version ?? "");
            const author = String(skill?.author ?? "");
            const isInst = isInstalled ? true : (!!skill?.installed || installedSet.has(slug));
            const confirming = confirmSlug === slug;

            return (
              <div
                key={slug + "-" + idx}
                className="bg-gray-800/80 border border-gray-700/60 rounded-lg p-2.5 hover:bg-gray-750/80 hover:border-gray-600 transition-colors group"
              >
                <div className="flex items-start gap-2.5">
                  {/* Emoji / icon */}
                  <div className="w-9 h-9 rounded-lg bg-gray-700/60 flex items-center justify-center text-lg shrink-0">
                    {emoji || "🧩"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAction("inspect", { slug })}
                        className="text-sm font-medium text-gray-100 hover:text-blue-300 cursor-pointer truncate"
                      >
                        {name}
                      </button>
                      {isInst && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">
                          installed
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{desc}</div>
                    <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-gray-500">
                      {version && <span>v{version}</span>}
                      {author && <span>by {author}</span>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="shrink-0 flex items-center gap-1">
                    <EnsoUI.Tooltip content="View details" side="left">
                      <button
                        onClick={() => onAction("inspect", { slug })}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-700 cursor-pointer"
                      >
                        <LucideReact.Info size={14} />
                      </button>
                    </EnsoUI.Tooltip>
                    {isInst ? (
                      confirming ? (
                        <button
                          onClick={() => { setConfirmSlug(null); onAction("uninstall", { slug }); }}
                          className="px-2 py-1 text-[11px] rounded-md bg-red-900/50 text-red-300 border border-red-700/50 hover:bg-red-800/50 cursor-pointer"
                        >
                          Confirm
                        </button>
                      ) : (
                        <EnsoUI.Tooltip content="Uninstall" side="left">
                          <button
                            onClick={() => setConfirmSlug(slug)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-700 cursor-pointer"
                          >
                            <LucideReact.Trash2 size={14} />
                          </button>
                        </EnsoUI.Tooltip>
                      )
                    ) : (
                      <EnsoUI.Tooltip content="Install" side="left">
                        <button
                          onClick={() => onAction("install", { slug })}
                          className="p-1.5 rounded-md text-gray-500 hover:text-emerald-400 hover:bg-gray-700 cursor-pointer"
                        >
                          <LucideReact.Download size={14} />
                        </button>
                      </EnsoUI.Tooltip>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats footer */}
      {skills.length > 0 && !isInstalled && (
        <div className="text-[10px] text-gray-600 text-center">
          Showing {skills.length} skill{skills.length !== 1 ? "s" : ""} • {installedSlugs.length} installed
        </div>
      )}
    </div>
  );
}`;
