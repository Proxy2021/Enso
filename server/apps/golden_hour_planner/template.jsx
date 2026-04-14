function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";

  var isPlanTrip = tool === "enso_ghp_plan_trip";
  var isManageShots = tool === "enso_ghp_manage_shots";
  var isWeeklyReview = tool === "enso_ghp_weekly_review";
  var isQuickRef = tool === "enso_ghp_quick_ref";
  var isLensChallenge = tool === "enso_ghp_lens_challenge";

  // All hooks at top level
  var [selectedDay, setSelectedDay] = React.useState(0);
  var [showAddShot, setShowAddShot] = React.useState(false);
  var [shotLocation, setShotLocation] = React.useState("");
  var [shotBestTime, setShotBestTime] = React.useState("evening_golden");
  var [shotFocal, setShotFocal] = React.useState("35mm");
  var [shotSubject, setShotSubject] = React.useState("street");
  var [shotLight, setShotLight] = React.useState("side_lit");
  var [shotNotes, setShotNotes] = React.useState("");
  var [activeRefTab, setActiveRefTab] = React.useState("settings");
  var [challengeFocal, setChallengeFocal] = React.useState("35mm");
  var [logShotCount, setLogShotCount] = React.useState("");
  var [logBestShot, setLogBestShot] = React.useState("");
  var [logLesson, setLogLesson] = React.useState("");
  var [showLogForm, setShowLogForm] = React.useState(false);

  // Warm photography color scheme
  var colors = {
    bg: "#1a1a1a",
    cardBg: "#242424",
    cardBorder: "#333",
    golden: "#d4a044",
    goldenLight: "#e8c171",
    goldenDark: "#a67c31",
    blue: "#5b8fb9",
    blueLight: "#7bb0d6",
    amber: "#f59e0b",
    text: "#f0ece4",
    textMuted: "#9a9489",
    textDim: "#6b6560",
    accent: "#d4a044",
    success: "#4ade80",
    danger: "#f87171",
    sunrise: "#ff6b35",
    sunset: "#e63946"
  };

  var cardStyle = {
    background: colors.cardBg,
    border: "1px solid " + colors.cardBorder,
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "10px"
  };

  var headerStyle = {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: colors.golden,
    marginBottom: "10px"
  };

  var goldenGradient = "linear-gradient(135deg, #d4a044 0%, #e8c171 50%, #d4a044 100%)";

  // ── PLAN TRIP VIEW ──
  if (isPlanTrip) {
    if (d.error) {
      return (
        <div style={{ background: colors.bg, padding: "16px", borderRadius: "12px" }}>
          <EmptyState icon={LucideReact.Sun} title="Enter a Destination" description={d.error}
            action={<Button variant="primary" onClick={function() { onAction("plan_trip", { city: "Tokyo" }); }}>Try Tokyo</Button>} />
        </div>
      );
    }

    var days = d.days || [];
    var locs = d.locations || [];
    var currentDay = days[selectedDay] || days[0] || {};

    return (
      <div style={{ background: colors.bg, padding: "12px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Hero header */}
        <div style={{ background: goldenGradient, borderRadius: "10px", padding: "16px", color: "#1a1a1a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 800 }}>{d.city}</div>
              <div style={{ fontSize: "12px", opacity: 0.8 }}>{d.country} | {d.timezone} | {d.latitude.toFixed(1)}N</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", opacity: 0.7 }}>TRIP</div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>{d.tripDays} days</div>
            </div>
          </div>
          <div style={{ fontSize: "11px", marginTop: "8px", opacity: 0.8 }}>{d.startDate} to {d.endDate}</div>
        </div>

        {/* Season note */}
        {d.seasonNote && (
          <div style={Object.assign({}, cardStyle, { borderLeft: "3px solid " + colors.golden, padding: "10px 14px" })}>
            <div style={{ fontSize: "12px", color: colors.goldenLight }}>{d.seasonNote}</div>
          </div>
        )}

        {/* PhotoPills verification note */}
        <div style={{ fontSize: "10px", color: colors.textDim, textAlign: "center", padding: "0 8px" }}>
          {d.verifyNote}
        </div>

        {/* Key locations */}
        {locs.length > 0 && (
          <div style={cardStyle}>
            <div style={headerStyle}>Key Locations</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {locs.map(function(loc, i) {
                return <Badge key={i} variant="outline" style={{ color: colors.golden, borderColor: colors.goldenDark, fontSize: "11px" }}>{loc}</Badge>;
              })}
            </div>
          </div>
        )}

        {/* Day selector */}
        <div style={{ display: "flex", gap: "4px", overflowX: "auto", padding: "2px 0" }}>
          {days.map(function(day, idx) {
            var isSelected = idx === selectedDay;
            return (
              <button key={idx} onClick={function() { setSelectedDay(idx); }}
                style={{
                  padding: "6px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
                  fontSize: "11px", fontWeight: isSelected ? 700 : 400, minWidth: "52px",
                  background: isSelected ? colors.golden : colors.cardBg,
                  color: isSelected ? "#1a1a1a" : colors.textMuted
                }}>
                <div>{day.dayOfWeek}</div>
                <div style={{ fontSize: "10px" }}>{day.date.slice(5)}</div>
              </button>
            );
          })}
        </div>

        {/* Daily schedule */}
        {currentDay.date && (
          <div style={cardStyle}>
            <div style={headerStyle}>
              {currentDay.dayOfWeek} {currentDay.date} | {currentDay.daylightHours}h daylight
            </div>

            {/* Timeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {[
                { label: "Pre-Dawn Scout", time: currentDay.preDawnScout, color: "#4a3a5c", icon: "moon", tip: "Arrive early. Scout compositions in dim light." },
                { label: "Blue Hour AM", time: currentDay.blueHourAM.start + " - " + currentDay.blueHourAM.end, color: colors.blue, icon: "blue", tip: "Cool blue tones. City lights still on. Reflections." },
                { label: "Sunrise", time: currentDay.sunrise, color: colors.sunrise, icon: "sunrise", tip: "Dramatic color explosion. Long shadows begin." },
                { label: "Golden Hour AM", time: currentDay.goldenHourAM.start + " - " + currentDay.goldenHourAM.end, color: colors.golden, icon: "golden", tip: "Warm, soft directional light. Portraits, landscapes." },
                { label: "Midday Rest", time: currentDay.middayRest.start + " - " + currentDay.middayRest.end, color: "#555", icon: "rest", tip: "Edit, plan, eat, rest. Harsh light — save energy." },
                { label: "Golden Hour PM", time: currentDay.goldenHourPM.start + " - " + currentDay.goldenHourPM.end, color: colors.golden, icon: "golden", tip: "Golden backlight, rim lighting, silhouettes." },
                { label: "Sunset", time: currentDay.sunset, color: colors.sunset, icon: "sunset", tip: "Sky on fire. Reflections on water. Don't pack up early." },
                { label: "Blue Hour PM", time: currentDay.blueHourPM.start + " - " + currentDay.blueHourPM.end, color: colors.blue, icon: "blue", tip: "Warm windows + cool sky. The magic 15 minutes." }
              ].map(function(slot, si) {
                var isGolden = slot.icon === "golden";
                var isBlue = slot.icon === "blue";
                return (
                  <div key={si} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", borderRadius: "6px",
                    background: isGolden ? "rgba(212, 160, 68, 0.12)" : isBlue ? "rgba(91, 143, 185, 0.10)" : "transparent",
                    borderLeft: "3px solid " + slot.color
                  }}>
                    <div style={{ width: "90px", fontSize: "11px", fontWeight: 600, color: slot.color, flexShrink: 0 }}>{slot.time}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: colors.text }}>{slot.label}</div>
                      <div style={{ fontSize: "10px", color: colors.textMuted, marginTop: "1px" }}>{slot.tip}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", fontSize: "12px" }}
            onClick={function() { onAction("manage_shots", { city: d.city }); }}>Plan Shots</Button>
          <Button variant="outline" style={{ borderColor: colors.goldenDark, color: colors.golden, fontSize: "12px" }}
            onClick={function() { onAction("weekly_review", { city: d.city }); }}>Weekly Review</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("quick_ref", {}); }}>Quick Ref</Button>
        </div>
      </div>
    );
  }

  // ── MANAGE SHOTS VIEW ──
  if (isManageShots) {
    var allShots = d.allShots || [];
    var timeLabels = d.timeLabels || {};

    var timeIcons = {
      "morning_golden": { emoji: "sunrise", color: colors.golden },
      "evening_golden": { emoji: "sunset", color: colors.golden },
      "blue_hour": { emoji: "moon", color: colors.blue },
      "midday_ok": { emoji: "sun", color: "#888" }
    };

    var lightLabels = { "front_lit": "Front-lit", "side_lit": "Side-lit", "back_lit": "Back-lit", "silhouette": "Silhouette" };

    return (
      <div style={{ background: colors.bg, padding: "12px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: colors.text }}>Shot Cards</div>
            <div style={{ fontSize: "11px", color: colors.textMuted }}>{d.city} | {d.totalShots} planned</div>
          </div>
          <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", fontSize: "12px" }}
            onClick={function() { setShowAddShot(!showAddShot); }}>
            {showAddShot ? "Cancel" : "+ Add Shot"}
          </Button>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Stat label="Scouted" value={d.scouted + "/" + d.totalShots} accent="amber" />
          <Stat label="Attempted" value={d.attempted + "/" + d.totalShots} accent="blue" />
          <Stat label="Got It!" value={d.gotIt + "/" + d.totalShots} accent="emerald" />
        </div>

        {/* Add shot form */}
        {showAddShot && (
          <div style={Object.assign({}, cardStyle, { borderColor: colors.golden })}>
            <div style={headerStyle}>New Shot Card</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Input placeholder="Location name (e.g., Temple of Dawn)" value={shotLocation}
                onChange={function(e) { setShotLocation(e.target.value); }} />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <Select options={[
                  { value: "morning_golden", label: "Morning Golden" },
                  { value: "evening_golden", label: "Evening Golden" },
                  { value: "blue_hour", label: "Blue Hour" },
                  { value: "midday_ok", label: "Midday OK" }
                ]} value={shotBestTime} onChange={function(v) { setShotBestTime(v); }} placeholder="Best time" />
                <Select options={[
                  { value: "28mm", label: "28mm" },
                  { value: "35mm", label: "35mm" },
                  { value: "50mm", label: "50mm" },
                  { value: "85mm+", label: "85mm+" }
                ]} value={shotFocal} onChange={function(v) { setShotFocal(v); }} placeholder="Focal length" />
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <Select options={[
                  { value: "architecture", label: "Architecture" },
                  { value: "portrait", label: "Portrait" },
                  { value: "street", label: "Street" },
                  { value: "landscape", label: "Landscape" },
                  { value: "culture", label: "Culture" }
                ]} value={shotSubject} onChange={function(v) { setShotSubject(v); }} placeholder="Subject type" />
                <Select options={[
                  { value: "front_lit", label: "Front-lit" },
                  { value: "side_lit", label: "Side-lit" },
                  { value: "back_lit", label: "Back-lit" },
                  { value: "silhouette", label: "Silhouette" }
                ]} value={shotLight} onChange={function(v) { setShotLight(v); }} placeholder="Light direction" />
              </div>
              <Input placeholder="Notes (optional)" value={shotNotes}
                onChange={function(e) { setShotNotes(e.target.value); }} />
              <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a" }}
                onClick={function() {
                  if (!shotLocation.trim()) return;
                  onAction("manage_shots", {
                    action: "add", city: d.city, location: shotLocation,
                    bestTime: shotBestTime, focalLength: shotFocal,
                    subjectType: shotSubject, lightDirection: shotLight,
                    notes: shotNotes
                  });
                  setShotLocation(""); setShotNotes("");
                  setShowAddShot(false);
                }}>Add Shot Card</Button>
            </div>
          </div>
        )}

        {/* Shot cards list */}
        {allShots.length === 0 ? (
          <EmptyState icon={LucideReact.Camera} title="No shots planned yet"
            description="Add your first shot card to start planning your golden hour photography." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {allShots.map(function(shot) {
              var timeInfo = timeIcons[shot.bestTime] || { color: "#888" };
              return (
                <div key={shot.id} style={Object.assign({}, cardStyle, {
                  borderLeft: "3px solid " + timeInfo.color,
                  opacity: shot.gotIt ? 0.7 : 1
                })}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text,
                        textDecoration: shot.gotIt ? "line-through" : "none" }}>{shot.location}</div>
                      <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                        <Badge variant="outline" style={{ fontSize: "10px", color: timeInfo.color, borderColor: timeInfo.color }}>
                          {timeLabels[shot.bestTime] || shot.bestTime}
                        </Badge>
                        <Badge variant="outline" style={{ fontSize: "10px", color: colors.textMuted }}>{shot.focalLength}</Badge>
                        <Badge variant="outline" style={{ fontSize: "10px", color: colors.textMuted }}>{shot.subjectType}</Badge>
                        <Badge variant="outline" style={{ fontSize: "10px", color: colors.textMuted }}>{lightLabels[shot.lightDirection] || shot.lightDirection}</Badge>
                      </div>
                      {shot.notes && <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>{shot.notes}</div>}
                    </div>
                    <Button variant="ghost" style={{ color: colors.danger, fontSize: "10px", padding: "2px 6px" }}
                      onClick={function() { onAction("manage_shots", { action: "delete", city: d.city, shotId: shot.id }); }}>x</Button>
                  </div>

                  {/* Status toggles */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button onClick={function() { onAction("manage_shots", { action: "toggle_scouted", city: d.city, shotId: shot.id }); }}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                        border: "1px solid " + (shot.scouted ? colors.golden : colors.textDim),
                        background: shot.scouted ? "rgba(212, 160, 68, 0.2)" : "transparent",
                        color: shot.scouted ? colors.golden : colors.textDim
                      }}>{shot.scouted ? "Scouted" : "Scout?"}</button>
                    <button onClick={function() { onAction("manage_shots", { action: "toggle_attempted", city: d.city, shotId: shot.id }); }}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                        border: "1px solid " + (shot.attempted ? colors.blue : colors.textDim),
                        background: shot.attempted ? "rgba(91, 143, 185, 0.2)" : "transparent",
                        color: shot.attempted ? colors.blue : colors.textDim
                      }}>{shot.attempted ? "Attempted" : "Attempt?"}</button>
                    <button onClick={function() { onAction("manage_shots", { action: "toggle_got_it", city: d.city, shotId: shot.id }); }}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                        border: "1px solid " + (shot.gotIt ? colors.success : colors.textDim),
                        background: shot.gotIt ? "rgba(74, 222, 128, 0.2)" : "transparent",
                        color: shot.gotIt ? colors.success : colors.textDim
                      }}>{shot.gotIt ? "Got It!" : "Got it?"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button variant="ghost" style={{ color: colors.golden, fontSize: "12px" }}
            onClick={function() { onAction("plan_trip", { city: d.city }); }}>Back to Schedule</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("weekly_review", { city: d.city }); }}>Weekly Review</Button>
        </div>
      </div>
    );
  }

  // ── WEEKLY REVIEW VIEW ──
  if (isWeeklyReview) {
    var shots2 = d.shots || {};
    var streak = d.streak || {};
    var thisWeek = d.thisWeek || {};
    var dailyTip = d.dailyTip || {};
    var allTips = d.allTips || [];

    return (
      <div style={{ background: colors.bg, padding: "12px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: colors.text }}>Weekly Review</div>
            <div style={{ fontSize: "11px", color: colors.textMuted }}>{d.city}</div>
          </div>
          {!d.todayLogged && (
            <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", fontSize: "12px" }}
              onClick={function() { onAction("weekly_review", { action: "log_session", city: d.city, sessionType: "evening" }); }}>
              Log Today's Session
            </Button>
          )}
          {d.todayLogged && (
            <Badge variant="success" style={{ fontSize: "11px" }}>Today Logged</Badge>
          )}
        </div>

        {/* Streak hero */}
        <div style={Object.assign({}, cardStyle, { textAlign: "center", background: streak.current > 0 ? "rgba(212, 160, 68, 0.1)" : colors.cardBg, borderColor: streak.current > 0 ? colors.goldenDark : colors.cardBorder })}>
          <div style={{ fontSize: "42px", fontWeight: 900, color: streak.active ? colors.golden : colors.textDim }}>
            {streak.current}
          </div>
          <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "2px" }}>
            Day Streak {streak.active ? "(Active)" : "(Broken)"}
          </div>
          <div style={{ fontSize: "10px", color: colors.textDim, marginTop: "4px" }}>
            Longest: {streak.longest} days | Last: {streak.lastDate || "never"}
          </div>
        </div>

        {/* Shot stats */}
        <div style={headerStyle}>Shot Progress</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Stat label="Planned" value={shots2.planned} accent="amber" />
          <Stat label="Scouted" value={shots2.scouted} accent="orange" />
          <Stat label="Attempted" value={shots2.attempted} accent="blue" />
          <Stat label="Got It!" value={shots2.gotIt} accent="emerald" />
        </div>

        {/* Progress bars */}
        <div style={cardStyle}>
          <div style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: colors.textMuted, marginBottom: "3px" }}>
              <span>Scout Progress</span><span>{shots2.scoutRate}%</span>
            </div>
            <Progress value={shots2.scoutRate} max={100} variant="amber" />
          </div>
          <div style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: colors.textMuted, marginBottom: "3px" }}>
              <span>Attempt Rate</span><span>{shots2.attemptRate}%</span>
            </div>
            <Progress value={shots2.attemptRate} max={100} variant="blue" />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: colors.textMuted, marginBottom: "3px" }}>
              <span>Keeper Rate</span><span>{shots2.completionRate}%</span>
            </div>
            <Progress value={shots2.completionRate} max={100} variant="emerald" />
          </div>
        </div>

        {/* This week sessions */}
        <div style={cardStyle}>
          <div style={headerStyle}>This Week's Sessions ({thisWeek.totalSessions}/{thisWeek.target})</div>
          <Progress value={thisWeek.totalSessions} max={thisWeek.target} variant="amber" showLabel />
          <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px" }}>
            <span style={{ color: colors.golden }}>Morning: {thisWeek.morningSessions}</span>
            <span style={{ color: colors.sunset }}>Evening: {thisWeek.eveningSessions}</span>
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            <Button variant="outline" style={{ borderColor: colors.golden, color: colors.golden, fontSize: "11px" }}
              onClick={function() { onAction("weekly_review", { action: "log_session", city: d.city, sessionType: "morning" }); }}>
              Log Morning
            </Button>
            <Button variant="outline" style={{ borderColor: colors.sunset, color: colors.sunset, fontSize: "11px" }}
              onClick={function() { onAction("weekly_review", { action: "log_session", city: d.city, sessionType: "evening" }); }}>
              Log Evening
            </Button>
          </div>
        </div>

        {/* Daily tip */}
        <div style={Object.assign({}, cardStyle, { borderLeft: "3px solid " + colors.golden, background: "rgba(212, 160, 68, 0.06)" })}>
          <div style={{ fontSize: "10px", color: colors.golden, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "6px" }}>
            Tip from {dailyTip.photographer} — {dailyTip.style}
          </div>
          <div style={{ fontSize: "13px", color: colors.text, lineHeight: 1.6, fontStyle: "italic" }}>
            "{dailyTip.tip}"
          </div>
        </div>

        {/* All photographer tips accordion */}
        <Accordion type="single" items={allTips.map(function(tip, idx) {
          return {
            value: "tip-" + idx,
            title: tip.photographer + " — " + tip.style,
            content: React.createElement("div", { style: { fontSize: "12px", color: colors.text, lineHeight: 1.6 } }, tip.tip)
          };
        })} />

        {/* Navigation */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button variant="ghost" style={{ color: colors.golden, fontSize: "12px" }}
            onClick={function() { onAction("plan_trip", { city: d.city }); }}>Schedule</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("manage_shots", { city: d.city }); }}>Shot Cards</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("lens_challenge", {}); }}>Lens Challenge</Button>
        </div>
      </div>
    );
  }

  // ── QUICK REFERENCE VIEW ──
  if (isQuickRef) {
    var settings = d.goldenHourSettings || [];
    var compTips = d.compositionTips || [];
    var proTips = d.proTips || [];

    return (
      <div style={{ background: colors.bg, padding: "12px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "18px", fontWeight: 800, color: colors.text }}>Quick Reference</div>

        <Tabs tabs={[
          { value: "settings", label: "Camera Settings" },
          { value: "composition", label: "Composition" },
          { value: "tips", label: "Pro Tips" }
        ]} defaultValue="settings" variant="pills">
          {function(tab) {
            if (tab === "settings") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
                  {settings.map(function(s, idx) {
                    return (
                      <div key={idx} style={Object.assign({}, cardStyle, { borderLeft: "3px solid " + (s.condition.indexOf("Golden") >= 0 ? colors.golden : s.condition.indexOf("Blue") >= 0 ? colors.blue : "#666") })}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: colors.text, marginBottom: "6px" }}>{s.condition}</div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                          <Badge style={{ fontSize: "10px", background: "rgba(212, 160, 68, 0.15)", color: colors.golden }}>f {s.aperture}</Badge>
                          <Badge style={{ fontSize: "10px", background: "rgba(91, 143, 185, 0.15)", color: colors.blue }}>{s.shutter}</Badge>
                          <Badge style={{ fontSize: "10px", background: "rgba(74, 222, 128, 0.15)", color: colors.success }}>ISO {s.iso}</Badge>
                          <Badge style={{ fontSize: "10px", background: "rgba(248, 113, 113, 0.15)", color: "#f87171" }}>WB: {s.wb}</Badge>
                        </div>
                        <div style={{ fontSize: "11px", color: colors.textMuted, lineHeight: 1.5 }}>{s.notes}</div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (tab === "composition") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
                  {compTips.map(function(tip, idx) {
                    return (
                      <div key={idx} style={cardStyle}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: colors.golden, marginBottom: "4px" }}>{tip.name}</div>
                        <div style={{ fontSize: "12px", color: colors.text, marginBottom: "4px" }}>{tip.description}</div>
                        <div style={{ fontSize: "11px", color: colors.goldenLight, fontStyle: "italic", borderTop: "1px solid " + colors.cardBorder, paddingTop: "6px", marginTop: "4px" }}>
                          Golden Hour: {tip.goldenHourTip}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (tab === "tips") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "8px" }}>
                  {proTips.map(function(tip, idx) {
                    return (
                      <div key={idx} style={Object.assign({}, cardStyle, { display: "flex", gap: "10px", alignItems: "flex-start" })}>
                        <div style={{ fontSize: "18px", fontWeight: 900, color: colors.golden, minWidth: "24px" }}>{idx + 1}</div>
                        <div style={{ fontSize: "12px", color: colors.text, lineHeight: 1.6 }}>{tip}</div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return null;
          }}
        </Tabs>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button variant="ghost" style={{ color: colors.golden, fontSize: "12px" }}
            onClick={function() { onAction("plan_trip", { city: "" }); }}>Schedule</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("manage_shots", {}); }}>Shot Cards</Button>
        </div>
      </div>
    );
  }

  // ── LENS CHALLENGE VIEW ──
  if (isLensChallenge) {
    var isActive = d.active;
    var allInsights = d.allLensInsights || {};
    var currentInsight = d.lensInsight;
    var history = d.history || [];
    var currentDays = d.currentDays || [];
    var focalOptions = d.focalLengthOptions || [];

    return (
      <div style={{ background: colors.bg, padding: "12px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "18px", fontWeight: 800, color: colors.text }}>One Lens Challenge</div>
        <div style={{ fontSize: "11px", color: colors.textMuted }}>
          Commit to one focal length. Master seeing through a single lens.
        </div>

        {/* All-time stats */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Stat label="Total Days" value={d.totalAllTime} accent="amber" />
          <Stat label="Total Shots" value={d.totalShotsAllTime} accent="blue" />
          <Stat label="Challenges" value={history.length + (isActive ? 1 : 0)} accent="emerald" />
        </div>

        {/* Active challenge or start new */}
        {isActive ? (
          <div style={Object.assign({}, cardStyle, { borderColor: colors.golden })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={headerStyle}>Active Challenge</div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: colors.golden }}>{d.focalLength}</div>
                <div style={{ fontSize: "11px", color: colors.textMuted }}>Started {d.startDate} | Day {currentDays.length + 1}</div>
              </div>
              <Button variant="outline" style={{ borderColor: colors.danger, color: colors.danger, fontSize: "11px" }}
                onClick={function() { onAction("lens_challenge", { action: "end_challenge" }); }}>End Challenge</Button>
            </div>

            {/* Current lens insight */}
            {currentInsight && (
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "6px", background: "rgba(212, 160, 68, 0.08)", borderLeft: "3px solid " + colors.golden }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: colors.golden }}>{currentInsight.name}</div>
                <div style={{ fontSize: "11px", color: colors.text, marginTop: "4px" }}>{currentInsight.personality}</div>
                <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>Best for: {currentInsight.bestFor}</div>
                <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "2px" }}>Masters: {currentInsight.masterWho}</div>
                <div style={{ fontSize: "11px", color: colors.goldenLight, marginTop: "4px", fontStyle: "italic" }}>Challenge: {currentInsight.challenge}</div>
              </div>
            )}

            {/* Log today */}
            <div style={{ marginTop: "10px" }}>
              {!showLogForm ? (
                <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", fontSize: "12px", width: "100%" }}
                  onClick={function() { setShowLogForm(true); }}>Log Today's Shooting</Button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <Input placeholder="Number of shots taken" type="number" value={logShotCount}
                    onChange={function(e) { setLogShotCount(e.target.value); }} />
                  <Input placeholder="Your best shot description" value={logBestShot}
                    onChange={function(e) { setLogBestShot(e.target.value); }} />
                  <Input placeholder="What did you learn today?" value={logLesson}
                    onChange={function(e) { setLogLesson(e.target.value); }} />
                  <div style={{ display: "flex", gap: "6px" }}>
                    <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", fontSize: "12px" }}
                      onClick={function() {
                        onAction("lens_challenge", {
                          action: "log_day",
                          shotCount: parseInt(logShotCount) || 0,
                          bestShot: logBestShot,
                          lesson: logLesson
                        });
                        setLogShotCount(""); setLogBestShot(""); setLogLesson("");
                        setShowLogForm(false);
                      }}>Save Entry</Button>
                    <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
                      onClick={function() { setShowLogForm(false); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Daily log entries */}
            {currentDays.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <div style={headerStyle}>Daily Log</div>
                {currentDays.map(function(day, idx) {
                  return (
                    <div key={idx} style={{ padding: "8px 0", borderBottom: "1px solid " + colors.cardBorder, fontSize: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: colors.text }}>
                        <span style={{ fontWeight: 600 }}>Day {day.dayNumber} — {day.date}</span>
                        <span style={{ color: colors.golden }}>{day.shotCount} shots</span>
                      </div>
                      {day.bestShot && <div style={{ color: colors.textMuted, marginTop: "2px" }}>Best: {day.bestShot}</div>}
                      {day.lesson && <div style={{ color: colors.goldenLight, marginTop: "2px", fontStyle: "italic" }}>Learned: {day.lesson}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={cardStyle}>
            <div style={headerStyle}>Start a New Challenge</div>
            <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "10px" }}>
              Pick one focal length and shoot only with that lens for at least 3 days.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {focalOptions.map(function(fl) {
                var insight = allInsights[fl] || {};
                var isSelected = challengeFocal === fl;
                return (
                  <button key={fl} onClick={function() { setChallengeFocal(fl); }}
                    style={{
                      padding: "10px 16px", borderRadius: "8px", cursor: "pointer",
                      border: "2px solid " + (isSelected ? colors.golden : colors.cardBorder),
                      background: isSelected ? "rgba(212, 160, 68, 0.15)" : colors.cardBg,
                      color: isSelected ? colors.golden : colors.textMuted, textAlign: "center"
                    }}>
                    <div style={{ fontSize: "16px", fontWeight: 800 }}>{fl}</div>
                    <div style={{ fontSize: "9px", marginTop: "2px" }}>{(insight.name || "").split(" — ")[1] || ""}</div>
                  </button>
                );
              })}
            </div>
            {allInsights[challengeFocal] && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: colors.text }}>
                <div style={{ fontWeight: 600, color: colors.golden }}>{allInsights[challengeFocal].name}</div>
                <div style={{ color: colors.textMuted, marginTop: "2px" }}>{allInsights[challengeFocal].personality}</div>
                <div style={{ color: colors.textMuted, marginTop: "2px" }}>Masters: {allInsights[challengeFocal].masterWho}</div>
              </div>
            )}
            <Button variant="primary" style={{ background: colors.golden, color: "#1a1a1a", marginTop: "10px", width: "100%", fontSize: "13px" }}
              onClick={function() { onAction("lens_challenge", { action: "start", focalLength: challengeFocal }); }}>
              Start {challengeFocal} Challenge
            </Button>
          </div>
        )}

        {/* Past challenges */}
        {history.length > 0 && (
          <div>
            <div style={headerStyle}>Past Challenges</div>
            {history.map(function(h, idx) {
              return (
                <div key={idx} style={Object.assign({}, cardStyle, { display: "flex", justifyContent: "space-between", alignItems: "center" })}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: colors.golden }}>{h.focalLength}</div>
                    <div style={{ fontSize: "10px", color: colors.textMuted }}>{h.startDate} to {h.endDate}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>{h.daysCompleted} days</div>
                    <div style={{ fontSize: "10px", color: colors.textMuted }}>{h.totalShots} shots</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button variant="ghost" style={{ color: colors.golden, fontSize: "12px" }}
            onClick={function() { onAction("plan_trip", { city: "" }); }}>Schedule</Button>
          <Button variant="ghost" style={{ color: colors.textMuted, fontSize: "12px" }}
            onClick={function() { onAction("weekly_review", {}); }}>Weekly Review</Button>
        </div>
      </div>
    );
  }

  // ── FALLBACK ──
  return (
    <div style={{ background: colors.bg, padding: "16px", borderRadius: "12px" }}>
      <EmptyState icon={LucideReact.Sun} title="Golden Hour Planner"
        description="Plan your photography trips around the magic light."
        action={<Button variant="primary" style={{ background: "#d4a044", color: "#1a1a1a" }}
          onClick={function() { onAction("plan_trip", { city: "Tokyo" }); }}>Plan a Trip</Button>} />
    </div>
  );
}
