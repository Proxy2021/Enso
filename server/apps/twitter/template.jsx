function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_twitter_browse";
  var isScan = tool === "enso_twitter_scan";
  var isUpdate = tool === "enso_twitter_update";

  // ── Scan / Update result ──
  if (isScan || isUpdate) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ marginBottom: "8px" }}>
            <Twitter size={28} style={{ color: "#60a5fa", margin: "0 auto" }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            {isScan ? "Following List Scanned" : "Following List Updated"}
          </div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {isScan && data.data && ("Scan complete")}
              {isUpdate && data.message}
            </div>
          )}
          {isUpdate && data.newFollows && data.newFollows.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "11px", color: "#a3e635", marginBottom: "4px" }}>New follows:</div>
              {data.newFollows.map(function(f, i) {
                return <div key={i} style={{ fontSize: "12px", color: "#d4d4d8" }}>{f}</div>;
              })}
            </div>
          )}
          {isUpdate && data.unfollowed && data.unfollowed.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "11px", color: "#f87171", marginBottom: "4px" }}>Unfollowed:</div>
              {data.unfollowed.map(function(h, i) {
                return <div key={i} style={{ fontSize: "12px", color: "#a1a1aa" }}>@{h}</div>;
              })}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Following</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var [sortBy, setSortBy] = React.useState(data.sortBy || "name");
    var accounts = data.accounts || [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Twitter size={20} style={{ color: "#60a5fa" }} />
            <span style={{ fontWeight: 600 }}>Twitter/X Following</span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {data.filteredCount === data.totalFollowing
                ? data.totalFollowing + " accounts"
                : data.filteredCount + " of " + data.totalFollowing + " accounts"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>
              <Search size={12} style={{ marginRight: "4px" }} />Scan
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("update", {}); }}>
              <UserCheck size={12} style={{ marginRight: "4px" }} />Update
            </Button>
          </div>
        </div>

        {/* Scanned at */}
        {data.scannedAt && (
          <div style={{ fontSize: "12px", color: "#71717a" }}>
            Last scanned: {new Date(data.scannedAt).toLocaleDateString()}
          </div>
        )}

        {/* Search + Sort */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="Search by name, @handle, or bio..."
            value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, sortBy: sortBy }); }}
            style={{ flex: 1 }}
          />
          <Select value={sortBy} onChange={function(v) { setSortBy(v); onAction("browse", { query: searchInput, sortBy: v }); }}
            options={[
              { value: "name", label: "Name" },
              { value: "handle", label: "Handle" }
            ]}
          />
        </div>

        {/* Account grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "8px" }}>
          {accounts.map(function(account, i) {
            return (
              <UICard key={i} style={{ padding: "10px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  {/* Avatar */}
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #1d9bf0 0%, #60a5fa 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    fontSize: "16px", fontWeight: 700, color: "#fff"
                  }}>
                    {account.displayName ? account.displayName.charAt(0).toUpperCase() : "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name + verified */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>{account.displayName}</span>
                      {account.verified && (
                        <Shield size={12} style={{ color: "#60a5fa" }} />
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#71717a" }}>@{account.handle}</div>
                    {/* Bio */}
                    {account.bio && (
                      <div style={{
                        fontSize: "11px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4,
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
                      }}>{account.bio}</div>
                    )}
                    {/* Actions */}
                    <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                      <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                        onClick={function() { window.open("https://x.com/" + account.handle, "_blank"); }}>
                        <ExternalLink size={10} style={{ marginRight: "3px" }} />Profile
                      </Button>
                      <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                        onClick={function() { onAction("send_message", { message: "/research " + account.displayName + " @" + account.handle }); }}>
                        <Search size={10} style={{ marginRight: "3px" }} />Research
                      </Button>
                    </div>
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>

        {accounts.length === 0 && (
          <EmptyState
            title="No accounts found"
            description={data.message || (data.query ? "No accounts matching \"" + data.query + "\"" : "Your following list is empty. Run a scan to import accounts.")}
          />
        )}

        {data.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {data.filteredCount} accounts. Use search to narrow down.
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Twitter/X Following" description="Use Browse or Scan to explore your Twitter following list." />;
}
