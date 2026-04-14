function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var success = data.success;
  var isError = !success && (data.error || tool === "enso_email_send");

  if (tool === "enso_email_send") {
    if (success) {
      return (
        <UICard>
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ fontSize: "20px" }}>✉️</div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>Email Sent</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#94a3b8" }}>
              <div><span style={{ color: "#cbd5e1", fontWeight: 500 }}>To: </span>{data.to}</div>
              {data.cc && <div><span style={{ color: "#cbd5e1", fontWeight: 500 }}>CC: </span>{data.cc}</div>}
              {data.bcc && <div><span style={{ color: "#cbd5e1", fontWeight: 500 }}>BCC: </span>{data.bcc}</div>}
              <div><span style={{ color: "#cbd5e1", fontWeight: 500 }}>Subject: </span>{data.subject}</div>
              {data.attachmentCount > 0 && (
                <div><span style={{ color: "#cbd5e1", fontWeight: 500 }}>Attachments: </span>{data.attachmentCount}</div>
              )}
              {data.messageId && (
                <div style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>ID: {data.messageId}</div>
              )}
            </div>
          </div>
        </UICard>
      );
    }

    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "20px", marginBottom: "8px" }}>⚠️</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Email Failed</div>
          <div style={{ fontSize: "13px", color: "#ef4444" }}>{data.error || "Unknown error"}</div>
        </div>
      </UICard>
    );
  }

  return (
    <EmptyState
      title="Email"
      description="Use the email tool to send messages via Gmail SMTP."
    />
  );
}
