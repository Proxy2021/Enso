function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_email_scanner_browse";
  var isScan = tool === "enso_email_scanner_scan";

  // ── Scan result ──
  if (isScan) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📧</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Email Inbox Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.data && data.data.totalEmails ? "Processed " + data.data.totalEmails + " emails" : "Scan complete"}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Contacts</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var topSenders = data.topSenders || [];
    var recentSubjects = data.recentSubjects || [];

    if (data.error) {
      return (
        <EmptyState
          title="No Email Data"
          description={data.error}
        />
      );
    }

    // Compute max count for frequency bars
    var maxCount = 1;
    for (var s of topSenders) {
      if (s.count && s.count > maxCount) maxCount = s.count;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📧</span>
            <span style={{ fontWeight: 600 }}>Email Scanner</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {topSenders.length} contact{topSenders.length !== 1 ? "s" : ""} · {recentSubjects.length} subject{recentSubjects.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
        </div>

        {/* Search bar */}
        <Input
          placeholder="Search contacts or subjects..."
          value={searchInput}
          onChange={function(v) { setSearchInput(v); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
        />

        <Tabs defaultValue="contacts">
          <Tabs.List>
            <Tabs.Trigger value="contacts">Top Contacts ({topSenders.length})</Tabs.Trigger>
            <Tabs.Trigger value="subjects">Recent Subjects ({recentSubjects.length})</Tabs.Trigger>
          </Tabs.List>

          {/* Top Contacts tab */}
          <Tabs.Content value="contacts">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {topSenders.length === 0 && <EmptyState title="No contacts" description="No email contacts found." />}
              {topSenders.map(function(sender, i) {
                var name = sender.name || sender.from || sender.email || "Unknown";
                var email = sender.email || sender.from || "";
                var count = sender.count || 0;
                var barWidth = Math.max(8, Math.round((count / maxCount) * 100));

                return (
                  <UICard key={i} style={{ padding: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {/* Avatar circle */}
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "14px", fontWeight: 600, color: "#fff", flexShrink: 0,
                      }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{name}</div>
                        {email && email !== name && (
                          <div style={{ fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
                        )}
                        {/* Frequency bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                          <div style={{ height: "4px", borderRadius: "2px", background: "#1e293b", flex: 1 }}>
                            <div style={{ height: "4px", borderRadius: "2px", background: "#6366f1", width: barWidth + "%" }} />
                          </div>
                          <span style={{ fontSize: "10px", color: "#64748b", flexShrink: 0 }}>{count} email{count !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                        onClick={function() { onAction("send_message", { message: "/research " + name + " " + email }); }}
                      >🔍</Button>
                    </div>
                  </UICard>
                );
              })}
            </div>
          </Tabs.Content>

          {/* Recent Subjects tab */}
          <Tabs.Content value="subjects">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {recentSubjects.length === 0 && <EmptyState title="No subjects" description="No recent email subjects found." />}
              {recentSubjects.map(function(email, i) {
                var subject = email.subject || "(no subject)";
                var from = email.from || "Unknown";
                var date = email.date || "";

                return (
                  <UICard key={i} style={{ padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{from}</div>
                      </div>
                      {date && <div style={{ fontSize: "10px", color: "#64748b", flexShrink: 0 }}>{date}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "5px", marginTop: "6px" }}>
                      <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                        onClick={function() { onAction("send_message", { message: "/research " + subject }); }}
                      >🔍 Research</Button>
                    </div>
                  </UICard>
                );
              })}
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    );
  }

  return <EmptyState title="Email Scanner" description="Use Browse or Scan to explore your email communications." />;
}
