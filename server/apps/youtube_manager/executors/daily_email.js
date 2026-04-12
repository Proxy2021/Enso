var p = params || {};
// YouTube Manager — daily_email.js
// Deterministic daily email digest of latest YouTube subscription videos.
// No LLM involved — fetches feed data, builds HTML, sends email.

var maxResults = p.maxResults || 10;

// ── 1. Fetch feed ──
var result = await ctx.callTool("enso_youtube_my_feed", { maxResults: maxResults });
var videos = [];
if (result && result.success && result.data) {
  videos = result.data.videos || [];
} else if (result && typeof result === "string") {
  try { videos = JSON.parse(result).videos || []; } catch(e) {}
}

if (videos.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_youtube_manager_daily_email", emailSent: false, error: "No videos in feed", videoCount: 0 }) }] };
}

// ── 2. Config ──
var baseUrl = (await ctx.store.get("server_base_url")) || "https://pc1.enso.net";
var emailTo = (await ctx.store.get("youtube_email_to")) || "kkwong@xiaomi.com";
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayShort = new Date().toISOString().slice(0, 10);

// ── 3. Helpers ──
function fmtViews(count) {
  if (!count) return "";
  var n = parseInt(count);
  if (isNaN(n)) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M views";
  if (n >= 1000) return Math.round(n / 1000) + "K views";
  return n + " views";
}

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function encUri(s) {
  try { return encodeURIComponent(s || ""); } catch(e) { return s || ""; }
}

// ── 4. Build HTML ──
var html = "";
html += "<div style='background:#0f0f23;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";

// Header
html += "<h1 style='color:#f472b6;text-align:center;font-size:22px;margin:0 0 4px;'>Your Daily YouTube Picks</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + todayStr + " \u2014 Fresh from your subscriptions</p>";

// Video grid (2 columns via table)
html += "<table cellpadding='0' cellspacing='0' border='0' width='100%' style='border-collapse:separate;border-spacing:8px;'>";
var count = Math.min(videos.length, maxResults);
for (var i = 0; i < count; i += 2) {
  html += "<tr>";
  for (var col = 0; col < 2; col++) {
    var idx = i + col;
    if (idx < count) {
      var vid = videos[idx];
      var metaParts = [];
      var viewStr = fmtViews(vid.viewCount);
      if (viewStr) metaParts.push(viewStr);
      if (vid.duration) metaParts.push(vid.duration);
      if (vid.publishedAt) metaParts.push(vid.publishedAt.slice(0, 10));

      // Unsub link using real channelId from API data
      var unsubUrl = baseUrl + "/api/youtube/unsubscribe?channelId=" + encUri(vid.channelId) + "&channelName=" + encUri(vid.channelTitle);

      html += "<td width='50%' valign='top' style='padding:0;'>";
      html += "<div style='background:#1e1e3a;border-radius:12px;overflow:hidden;border:1px solid #2d2640;'>";

      // Thumbnail
      if (vid.thumbnailUrl && vid.videoUrl) {
        html += "<a href='" + escHtml(vid.videoUrl) + "' style='display:block;'>";
        html += "<img src='" + escHtml(vid.thumbnailUrl) + "' alt='' width='100%' style='display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:12px 12px 0 0;' />";
        html += "</a>";
      }

      html += "<div style='padding:10px 12px 12px;'>";

      // Title
      html += "<a href='" + escHtml(vid.videoUrl) + "' style='display:block;font-size:14px;font-weight:600;color:#e2e8f0;text-decoration:none;line-height:1.3;'>" + escHtml(vid.title) + "</a>";

      // Channel + unsub
      html += "<div style='margin:6px 0 4px;'>";
      html += "<span style='color:#f472b6;font-size:12px;font-weight:500;'>" + escHtml(vid.channelTitle) + "</span>";
      if (vid.channelId) {
        html += " <a href='" + escHtml(unsubUrl) + "' style='color:#64748b;font-size:10px;text-decoration:none;border:1px solid #334155;border-radius:4px;padding:1px 6px;margin-left:6px;'>\u2715 unsub</a>";
      }
      html += "</div>";

      // Meta
      if (metaParts.length > 0) {
        html += "<p style='margin:0;font-size:11px;color:#64748b;'>" + metaParts.join(" \u00B7 ") + "</p>";
      }

      // Description
      if (vid.description) {
        html += "<p style='margin:6px 0 0;font-size:11px;color:#94a3b8;line-height:1.4;'>" + escHtml((vid.description || "").slice(0, 200)) + "</p>";
      }

      html += "</div></div></td>";
    } else {
      html += "<td width='50%'></td>";
    }
  }
  html += "</tr>";
}
html += "</table>";

// Footer
html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 5. Send email ──
var emailSent = false;
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "Your Daily YouTube Picks - " + todayShort,
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) {
  ctx.log("Email send failed: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_daily_email",
  emailSent: emailSent,
  videoCount: count,
  to: emailTo
}) }] };
