import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

// ─── 1. USER FLOW DIAGRAM ────────────────────────────────────────────────────
const flowHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; font-family: 'Segoe UI', system-ui, sans-serif; width: 1200px; padding: 40px; }

  h1 { color: #e8e8f0; font-size: 22px; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.3px; }
  .subtitle { color: #888; font-size: 13px; margin-bottom: 40px; }

  .flow { display: flex; align-items: flex-start; gap: 0; }

  .lane-group { display: flex; flex-direction: column; gap: 0; }
  .lane-label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #555; margin-bottom: 10px; padding-left: 4px; }

  .step {
    width: 160px;
    background: #1a1a24;
    border: 1.5px solid #2a2a3a;
    border-radius: 10px;
    padding: 14px 12px;
    text-align: center;
    position: relative;
  }
  .step.user { border-color: #4a6fa5; background: #141a28; }
  .step.enso { border-color: #5a3fa5; background: #16142a; }
  .step.outcome { border-color: #2a8a5a; background: #121e18; }
  .step.highlight { border-color: #c07030; background: #1e180e; }

  .step-num {
    width: 22px; height: 22px;
    border-radius: 50%;
    font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 8px;
  }
  .user .step-num { background: #4a6fa5; color: #fff; }
  .enso .step-num { background: #5a3fa5; color: #fff; }
  .outcome .step-num { background: #2a8a5a; color: #fff; }
  .highlight .step-num { background: #c07030; color: #fff; }

  .step-title { font-size: 12px; font-weight: 600; color: #d8d8e8; line-height: 1.3; }
  .step-detail { font-size: 10.5px; color: #777; margin-top: 5px; line-height: 1.4; }

  .arrow {
    display: flex; align-items: center; justify-content: center;
    width: 36px; flex-shrink: 0; padding-top: 28px;
    color: #444; font-size: 18px;
  }
  .arrow.down { writing-mode: vertical-lr; width: 160px; height: 28px; padding: 0; margin: 4px 0; }

  .connector {
    width: 1200px; margin: 24px 0 20px;
    display: flex; align-items: center; gap: 12px;
  }
  .connector hr { flex: 1; border: none; border-top: 1.5px dashed #2a2a3a; }
  .connector-label { font-size: 10px; color: #444; white-space: nowrap; letter-spacing: 0.5px; }

  /* vertical stacked layout for Enso actions */
  .col { display: flex; flex-direction: column; gap: 4px; }
  .col .step { margin-bottom: 0; }

  .section { margin-bottom: 20px; }

  .legend { display: flex; gap: 24px; margin-top: 32px; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #777; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; }

  /* horizontal row layout */
  .row { display: flex; align-items: flex-start; gap: 0; margin-bottom: 0; }
  .phase-block { display: flex; flex-direction: column; }
  .phase-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #444; margin-bottom: 8px; text-align: center; width: 160px; }
</style>
</head>
<body>
<h1>Enso Onboarding — User Flow</h1>
<p class="subtitle">Focus: Managing Scattered Notes → Structured Tasks &amp; Insights</p>

<div class="flow" style="flex-direction: column; gap: 0;">

  <!-- Row 1: Discovery & First Contact -->
  <div class="row">
    <div class="phase-block">
      <div class="phase-title" style="color:#4a6fa5;">User Action</div>
      <div class="step user">
        <div class="step-num">1</div>
        <div class="step-title">Opens Enso</div>
        <div class="step-detail">First launch, sees welcome chat interface</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso">
        <div class="step-num">2</div>
        <div class="step-title">Onboarding Greeting</div>
        <div class="step-detail">"Hi! I'm Enso. What's on your mind today?"</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#4a6fa5;">User Action</div>
      <div class="step user">
        <div class="step-num">3</div>
        <div class="step-title">Describes Problem</div>
        <div class="step-detail">"I have notes everywhere — phone, paper, email drafts…"</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso">
        <div class="step-num">4</div>
        <div class="step-title">Active Listening</div>
        <div class="step-detail">Asks clarifying questions, identifies note types &amp; pain points</div>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <div style="display:flex; align-items:center; gap:12px; margin: 16px 0;">
    <div style="flex:1; border-top: 1.5px dashed #2a2a3a;"></div>
    <div style="font-size:10px; color:#444; letter-spacing:0.5px;">CAPTURE PHASE</div>
    <div style="flex:1; border-top: 1.5px dashed #2a2a3a;"></div>
  </div>

  <!-- Row 2: Note Capture -->
  <div class="row">
    <div class="phase-block">
      <div class="phase-title" style="color:#4a6fa5;">User Action</div>
      <div class="step user">
        <div class="step-num">5</div>
        <div class="step-title">Pastes / Types Notes</div>
        <div class="step-detail">Dumps raw, unstructured text into chat (or attaches file)</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso highlight" style="border-color:#c07030; background:#1e180e;">
        <div class="step-num" style="background:#c07030;">6</div>
        <div class="step-title">AI Processing</div>
        <div class="step-detail">Parses intent, extracts tasks, ideas, deadlines, people</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso">
        <div class="step-num">7</div>
        <div class="step-title">Structured Proposal</div>
        <div class="step-detail">Shows extracted tasks + asks "Does this look right?"</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#4a6fa5;">User Action</div>
      <div class="step user">
        <div class="step-num">8</div>
        <div class="step-title">Review &amp; Confirm</div>
        <div class="step-detail">Approves, edits, or removes suggested items</div>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <div style="display:flex; align-items:center; gap:12px; margin: 16px 0;">
    <div style="flex:1; border-top: 1.5px dashed #2a2a3a;"></div>
    <div style="font-size:10px; color:#444; letter-spacing:0.5px;">ORGANIZATION PHASE</div>
    <div style="flex:1; border-top: 1.5px dashed #2a2a3a;"></div>
  </div>

  <!-- Row 3: Outcome -->
  <div class="row">
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso">
        <div class="step-num">9</div>
        <div class="step-title">Creates Tasks</div>
        <div class="step-detail">Adds to Cortex with priorities, tags, due dates</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#5a3fa5;">Enso</div>
      <div class="step enso">
        <div class="step-num">10</div>
        <div class="step-title">Surfaces Patterns</div>
        <div class="step-detail">Notices recurring themes, suggests focus areas</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#2a8a5a;">Outcome</div>
      <div class="step outcome">
        <div class="step-num">11</div>
        <div class="step-title">Organized Workspace</div>
        <div class="step-detail">Tasks in system, ideas in Cortex, nothing lost</div>
      </div>
    </div>
    <div class="arrow">→</div>
    <div class="phase-block">
      <div class="phase-title" style="color:#2a8a5a;">Outcome</div>
      <div class="step outcome" style="border-color:#3ab86a; background:#0e1e14;">
        <div class="step-num" style="background:#3ab86a;">12</div>
        <div class="step-title">Daily Briefing Set Up</div>
        <div class="step-detail">TL schedules morning check-in, user is fully onboarded</div>
      </div>
    </div>
  </div>

</div>

<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#4a6fa5;"></div>User Action</div>
  <div class="legend-item"><div class="legend-dot" style="background:#5a3fa5;"></div>Enso Processing</div>
  <div class="legend-item"><div class="legend-dot" style="background:#c07030;"></div>AI Analysis (Key Step)</div>
  <div class="legend-item"><div class="legend-dot" style="background:#2a8a5a;"></div>Outcome / Result</div>
</div>
</body>
</html>`;

// ─── 2. WIREFRAME: Welcome Screen ────────────────────────────────────────────
const welcomeHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; font-family: 'Segoe UI', system-ui, sans-serif; width: 390px; height: 844px; overflow: hidden; position: relative; }
  .screen { width: 100%; height: 100%; display: flex; flex-direction: column; }

  /* Status bar */
  .statusbar { display: flex; justify-content: space-between; padding: 12px 20px 8px; }
  .statusbar-time { font-size: 14px; font-weight: 600; color: #e8e8f0; }
  .statusbar-icons { display: flex; gap: 6px; align-items: center; }
  .icon-pill { width: 24px; height: 12px; border: 1.5px solid #555; border-radius: 3px; position: relative; }
  .icon-pill::after { content: ''; position: absolute; right: -5px; top: 3px; width: 3px; height: 6px; background: #555; border-radius: 1px; }

  /* Main content */
  .content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }

  .logo { width: 64px; height: 64px; border-radius: 18px; background: linear-gradient(135deg, #5a3fa5 0%, #4a6fa5 100%); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(90,63,165,0.4); }
  .logo-letter { font-size: 32px; font-weight: 700; color: #fff; }

  .welcome-title { font-size: 28px; font-weight: 700; color: #e8e8f0; text-align: center; margin-bottom: 8px; }
  .welcome-sub { font-size: 15px; color: #777; text-align: center; line-height: 1.5; margin-bottom: 40px; max-width: 280px; }

  .suggestion-chips { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-bottom: 28px; }
  .chip { background: #1a1a24; border: 1.5px solid #2a2a3a; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: border-color 0.2s; }
  .chip:hover { border-color: #5a3fa5; }
  .chip-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .chip-text { font-size: 13px; color: #c8c8d8; line-height: 1.3; }
  .chip-text strong { display: block; font-size: 14px; color: #e8e8f0; margin-bottom: 2px; }

  /* Input bar */
  .input-bar { padding: 0 16px 32px; }
  .input-box { background: #1a1a24; border: 1.5px solid #2a2a3a; border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
  .input-placeholder { flex: 1; font-size: 14px; color: #555; }
  .input-btn { width: 32px; height: 32px; border-radius: 8px; background: #5a3fa5; display: flex; align-items: center; justify-content: center; }

  /* Annotation */
  .anno { position: absolute; background: rgba(200,160,60,0.12); border: 1.5px dashed #c8a03c; border-radius: 8px; }
  .anno-label { position: absolute; font-size: 10px; color: #c8a03c; font-weight: 600; white-space: nowrap; letter-spacing: 0.3px; }

  .screen-label { position: absolute; top: 14px; right: 14px; font-size: 10px; color: #444; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
</style>
</head>
<body>
<div class="screen">
  <div class="statusbar">
    <div class="statusbar-time">9:41</div>
    <div class="statusbar-icons">
      <div style="font-size:11px;color:#888;">●●●●</div>
      <div class="icon-pill"></div>
    </div>
  </div>

  <div class="content">
    <div class="logo"><span class="logo-letter">E</span></div>
    <div class="welcome-title">Hi, I'm Enso</div>
    <div class="welcome-sub">Your personal AI that learns what matters to you. What's on your mind?</div>

    <div class="suggestion-chips">
      <div class="chip">
        <div class="chip-icon" style="background:#1e2030;">📝</div>
        <div class="chip-text">
          <strong>Organize my scattered notes</strong>
          I have ideas everywhere and can't find anything
        </div>
      </div>
      <div class="chip">
        <div class="chip-icon" style="background:#1e2030;">🎯</div>
        <div class="chip-text">
          <strong>Help me plan my week</strong>
          Too many things to do, don't know where to start
        </div>
      </div>
      <div class="chip">
        <div class="chip-icon" style="background:#1e2030;">💡</div>
        <div class="chip-text">
          <strong>Track a project or goal</strong>
          I want to make progress on something important
        </div>
      </div>
    </div>
  </div>

  <div class="input-bar">
    <div class="input-box">
      <div class="input-placeholder">Tell me what's on your mind…</div>
      <div class="input-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L13 7L7 13M1 7H13" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  </div>
</div>

<!-- Annotations -->
<div class="anno" style="top:162px; left:50px; width:290px; height:52px;"></div>
<div class="anno-label" style="top:148px; left:50px;">Logo + Brand Identity</div>

<div class="anno" style="top:270px; left:16px; width:358px; height:190px;"></div>
<div class="anno-label" style="top:254px; left:16px;">Quick-start chips (context-aware suggestions)</div>

<div class="anno" style="top:742px; left:16px; width:358px; height:52px;"></div>
<div class="anno-label" style="top:727px; left:16px;">Persistent natural language input</div>

<div class="screen-label">Screen 1 / 4 · Welcome</div>
</body>
</html>`;

// ─── 3. WIREFRAME: Note Dump / Input ─────────────────────────────────────────
const noteDumpHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; font-family: 'Segoe UI', system-ui, sans-serif; width: 390px; height: 844px; overflow: hidden; position: relative; }

  .statusbar { display: flex; justify-content: space-between; padding: 12px 20px 8px; }
  .statusbar-time { font-size: 14px; font-weight: 600; color: #e8e8f0; }

  /* Nav bar */
  .navbar { display: flex; align-items: center; padding: 0 16px 12px; gap: 10px; }
  .back-btn { width: 32px; height: 32px; border-radius: 8px; background: #1a1a24; border: 1px solid #2a2a3a; display: flex; align-items: center; justify-content: center; }
  .nav-title { font-size: 16px; font-weight: 600; color: #e8e8f0; flex: 1; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #5a3fa5, #4a6fa5); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; font-weight: 700; }

  /* Chat area */
  .chat { padding: 12px 16px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }

  .bubble { max-width: 82%; border-radius: 14px; padding: 12px 14px; font-size: 13.5px; line-height: 1.5; }
  .bubble.enso { background: #1a1a2c; border: 1px solid #2a2a3e; color: #c8c8d8; align-self: flex-start; border-bottom-left-radius: 4px; }
  .bubble.user { background: #2a1a4a; border: 1px solid #3a2a5a; color: #d8c8f0; align-self: flex-end; border-bottom-right-radius: 4px; }
  .bubble.user.long { background: #1e1e2e; border-color: #2e2e4e; font-size: 12.5px; color: #aaa; font-family: monospace; white-space: pre-line; }

  .bubble-meta { font-size: 10px; color: #444; margin-bottom: 4px; }
  .bubble-meta.right { text-align: right; }

  .typing-dot { display: inline-block; width: 6px; height: 6px; background: #5a3fa5; border-radius: 50; margin: 0 2px; }

  /* Attach pill */
  .attach-pill { display: flex; align-items: center; gap: 8px; background: #1a1a24; border: 1.5px dashed #2a2a3a; border-radius: 10px; padding: 10px 14px; align-self: flex-end; max-width: 240px; }
  .attach-icon { font-size: 18px; }
  .attach-text { font-size: 12px; color: #777; }

  /* Input */
  .input-area { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 16px 32px; background: linear-gradient(0deg, #0f0f13 80%, transparent); }
  .input-row { display: flex; gap: 8px; align-items: center; }
  .input-box { flex: 1; background: #1a1a24; border: 1.5px solid #2a2a3a; border-radius: 14px; padding: 12px 16px; font-size: 14px; color: #777; }
  .attach-btn { width: 40px; height: 40px; border-radius: 10px; background: #1a1a24; border: 1px solid #2a2a3a; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .send-btn { width: 40px; height: 40px; border-radius: 10px; background: #5a3fa5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .anno { position: absolute; background: rgba(200,160,60,0.1); border: 1.5px dashed #c8a03c; border-radius: 8px; pointer-events: none; }
  .anno-label { position: absolute; font-size: 10px; color: #c8a03c; font-weight: 600; white-space: nowrap; }
  .screen-label { position: absolute; top: 14px; right: 14px; font-size: 10px; color: #444; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="statusbar">
    <div class="statusbar-time">9:43</div>
    <div style="font-size:11px;color:#888; padding-right:20px;">●●●●</div>
  </div>

  <div class="navbar">
    <div class="back-btn">←</div>
    <div class="nav-title">Enso</div>
    <div class="avatar">E</div>
  </div>

  <div class="chat">
    <div>
      <div class="bubble-meta">Enso · 9:41 AM</div>
      <div class="bubble enso">Hey! 👋 Sounds like note chaos is real. Don't worry — let's fix that together.<br><br>Just dump everything here. Copy-paste from your phone notes, type out what's in your head, or attach a file. I'll make sense of it.</div>
    </div>

    <div style="align-self:flex-end; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
      <div class="bubble-meta right">You · 9:42 AM</div>
      <div class="bubble user long">- call dentist before friday
- book hotel for mom's bday trip (japan? bali?)
- finish the Q2 report draft — sarah needs it
- read "atomic habits" been sitting on shelf 3 months
- expense report overdue!!!
- ideas for side project: meal planner app?
- renew car insurance
- james birthday next week, get gift</div>
      <div class="attach-pill">
        <div class="attach-icon">📎</div>
        <div class="attach-text">phone-notes-backup.txt · 4.2 KB</div>
      </div>
    </div>

    <div>
      <div class="bubble-meta">Enso · just now</div>
      <div class="bubble enso" style="display:flex; align-items:center; gap:6px;">
        <span>Reading your notes</span>
        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
      </div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-row">
      <div class="attach-btn">📎</div>
      <div class="input-box">Add more notes…</div>
      <div class="send-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L13 7L7 13M1 7H13" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  </div>

  <!-- Annotations -->
  <div class="anno" style="top:208px; left:16px; right:16px; height:140px;"></div>
  <div class="anno-label" style="top:193px; left:16px;">Enso's encouraging prompt — no judgment, just capture</div>

  <div class="anno" style="top:365px; left:50px; right:16px; bottom:240px;"></div>
  <div class="anno-label" style="top:349px; left:50px;">Raw note dump (freeform text + file attach)</div>

  <div class="anno" style="bottom:58px; left:36px; width:40px; height:42px; border-radius:10px;"></div>
  <div class="anno-label" style="bottom:42px; left:82px;">Attach files / images</div>

  <div class="screen-label">Screen 2 / 4 · Note Capture</div>
</body>
</html>`;

// ─── 4. WIREFRAME: AI Extraction Result ──────────────────────────────────────
const extractionHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; font-family: 'Segoe UI', system-ui, sans-serif; width: 390px; height: 844px; overflow: hidden; position: relative; }

  .statusbar { display: flex; justify-content: space-between; padding: 12px 20px 8px; }
  .statusbar-time { font-size: 14px; font-weight: 600; color: #e8e8f0; }

  .navbar { display: flex; align-items: center; padding: 0 16px 12px; gap: 10px; }
  .back-btn { width: 32px; height: 32px; border-radius: 8px; background: #1a1a24; border: 1px solid #2a2a3a; display: flex; align-items: center; justify-content: center; color: #888; font-size: 14px; }
  .nav-title { font-size: 16px; font-weight: 600; color: #e8e8f0; flex: 1; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #5a3fa5, #4a6fa5); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; font-weight: 700; }

  /* Enso message */
  .enso-message { margin: 0 16px 14px; background: #1a1a2c; border: 1px solid #2a2a3e; border-radius: 14px; padding: 14px; }
  .enso-intro { font-size: 13.5px; color: #c8c8d8; line-height: 1.5; margin-bottom: 14px; }
  .enso-intro strong { color: #e8e8f0; }

  /* Cards */
  .cards-area { padding: 0 16px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #555; margin-bottom: 4px; margin-top: 4px; }

  .task-card { background: #1a1a24; border: 1.5px solid #2a2a3a; border-radius: 10px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 10px; }
  .task-card.urgent { border-color: #a03030; background: #1e1414; }
  .task-card.soon { border-color: #8a6020; background: #1a1610; }
  .task-card.idea { border-color: #2a5a8a; background: #101620; }

  .task-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #3a3a5a; flex-shrink: 0; margin-top: 1px; }
  .task-check.urgent { border-color: #a03030; }
  .task-check.soon { border-color: #8a6020; }
  .task-check.idea { border-color: #2a5a8a; }

  .task-body { flex: 1; }
  .task-title { font-size: 13px; font-weight: 500; color: #d8d8e8; }
  .task-meta { font-size: 11px; color: #666; margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap; }
  .tag { background: #1e1e30; border: 1px solid #2a2a40; border-radius: 5px; padding: 1px 6px; font-size: 10px; color: #778; }
  .tag.red { background: #200e0e; border-color: #3a1a1a; color: #a06060; }
  .tag.amber { background: #1e1800; border-color: #3a3000; color: #a08040; }
  .tag.blue { background: #0e1622; border-color: #1a2a3a; color: #608ab0; }

  /* Action bar */
  .action-bar { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 16px 32px; background: linear-gradient(0deg, #0f0f13 70%, transparent); }
  .action-prompt { font-size: 13px; color: #888; margin-bottom: 10px; text-align: center; }
  .action-btns { display: flex; gap: 10px; }
  .btn { flex: 1; border-radius: 12px; padding: 13px; font-size: 14px; font-weight: 600; text-align: center; }
  .btn.primary { background: #5a3fa5; color: #fff; }
  .btn.secondary { background: #1a1a24; border: 1.5px solid #2a2a3a; color: #888; }
  .btn.edit { background: #1a1a24; border: 1.5px solid #2a2a3a; color: #a08040; }

  .anno { position: absolute; background: rgba(200,160,60,0.08); border: 1.5px dashed #c8a03c; border-radius: 8px; pointer-events: none; }
  .anno-label { position: absolute; font-size: 10px; color: #c8a03c; font-weight: 600; white-space: nowrap; }
  .screen-label { position: absolute; top: 14px; right: 14px; font-size: 10px; color: #444; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="statusbar">
    <div class="statusbar-time">9:44</div>
    <div style="font-size:11px;color:#888; padding-right:20px;">●●●●</div>
  </div>

  <div class="navbar">
    <div class="back-btn">←</div>
    <div class="nav-title">Enso</div>
    <div class="avatar">E</div>
  </div>

  <div class="enso-message">
    <div class="enso-intro">I found <strong>8 items</strong> in your notes — sorted by what needs attention. Does this look right? You can edit, remove, or add before I save them.</div>
  </div>

  <div class="cards-area">
    <div class="section-title">🔴 Urgent (this week)</div>

    <div class="task-card urgent">
      <div class="task-check urgent"></div>
      <div class="task-body">
        <div class="task-title">Submit expense report</div>
        <div class="task-meta"><span class="tag red">Overdue</span><span class="tag">Work</span></div>
      </div>
    </div>

    <div class="task-card urgent">
      <div class="task-check urgent"></div>
      <div class="task-body">
        <div class="task-title">Call dentist — book appointment</div>
        <div class="task-meta"><span class="tag red">By Friday</span><span class="tag">Personal</span></div>
      </div>
    </div>

    <div class="task-card soon">
      <div class="task-check soon"></div>
      <div class="task-body">
        <div class="task-title">Get birthday gift for James</div>
        <div class="task-meta"><span class="tag amber">Next week</span><span class="tag">Personal</span></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:6px;">🟡 This Month</div>

    <div class="task-card soon">
      <div class="task-check soon"></div>
      <div class="task-body">
        <div class="task-title">Finish Q2 report draft for Sarah</div>
        <div class="task-meta"><span class="tag">Work</span><span class="tag amber">Waiting on you</span></div>
      </div>
    </div>

    <div class="task-card">
      <div class="task-check"></div>
      <div class="task-body">
        <div class="task-title">Renew car insurance</div>
        <div class="task-meta"><span class="tag">Admin</span></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:6px;">💡 Ideas &amp; Projects</div>

    <div class="task-card idea">
      <div class="task-check idea"></div>
      <div class="task-body">
        <div class="task-title">Explore meal planner app side project</div>
        <div class="task-meta"><span class="tag blue">Idea</span><span class="tag">Tech</span></div>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <div class="action-prompt">Tap to edit any item, or save all</div>
    <div class="action-btns">
      <div class="btn secondary">Edit</div>
      <div class="btn primary">Save All →</div>
    </div>
  </div>

  <!-- Annotations -->
  <div class="anno" style="top:156px; left:16px; right:16px; height:54px;"></div>
  <div class="anno-label" style="top:140px; left:16px;">AI summary: count + confidence + edit affordance</div>

  <div class="anno" style="top:370px; left:16px; right:16px; height:34px;"></div>
  <div class="anno-label" style="top:354px; left:16px;">Priority grouping auto-inferred from note content</div>

  <div class="anno" style="bottom:100px; left:16px; right:16px; height:86px;"></div>
  <div class="anno-label" style="bottom:84px; left:16px;">Confirm or edit before committing to Cortex</div>

  <div class="screen-label">Screen 3 / 4 · AI Extraction</div>
</body>
</html>`;

// ─── 5. WIREFRAME: Outcome / Dashboard ───────────────────────────────────────
const outcomeHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; font-family: 'Segoe UI', system-ui, sans-serif; width: 390px; height: 844px; overflow: hidden; position: relative; }

  .statusbar { display: flex; justify-content: space-between; padding: 12px 20px 8px; }
  .statusbar-time { font-size: 14px; font-weight: 600; color: #e8e8f0; }

  .header { padding: 4px 20px 16px; }
  .greeting { font-size: 13px; color: #666; }
  .name { font-size: 22px; font-weight: 700; color: #e8e8f0; margin-top: 2px; }

  /* Summary strip */
  .summary-strip { display: flex; gap: 10px; padding: 0 16px 16px; }
  .stat-card { flex: 1; background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 10px; padding: 12px; text-align: center; }
  .stat-num { font-size: 22px; font-weight: 700; color: #e8e8f0; }
  .stat-label { font-size: 10px; color: #666; margin-top: 2px; letter-spacing: 0.5px; }
  .stat-card.highlight { border-color: #3ab86a; background: #0e1e14; }
  .stat-card.highlight .stat-num { color: #3ab86a; }

  /* Task list */
  .section-header { display: flex; justify-content: space-between; align-items: center; padding: 0 16px 8px; }
  .section-title { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #555; }
  .see-all { font-size: 11px; color: #5a3fa5; }

  .task-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #1a1a24; }
  .task-check { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #3a3a5a; flex-shrink: 0; }
  .task-check.done { background: #3ab86a; border-color: #3ab86a; display: flex; align-items: center; justify-content: center; }
  .task-title-text { flex: 1; font-size: 13.5px; color: #d0d0e0; }
  .task-title-text.done { text-decoration: line-through; color: #555; }
  .task-tag { font-size: 10px; background: #1e1e30; border: 1px solid #2a2a40; border-radius: 4px; padding: 2px 6px; color: #778; }
  .task-tag.red { background: #200e0e; border-color: #3a1a1a; color: #a06060; }

  /* TL Briefing card */
  .briefing-card { margin: 12px 16px 0; background: linear-gradient(135deg, #1a142a 0%, #141a28 100%); border: 1.5px solid #3a2a5a; border-radius: 14px; padding: 14px; }
  .briefing-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .briefing-icon { width: 30px; height: 30px; border-radius: 8px; background: #5a3fa5; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .briefing-title { font-size: 13px; font-weight: 600; color: #e8e8f0; }
  .briefing-sub { font-size: 11px; color: #778; }
  .briefing-text { font-size: 12.5px; color: #c0c0d8; line-height: 1.5; }
  .briefing-chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .briefing-chip { font-size: 11px; background: #1e1e30; border: 1px solid #3a2a5a; border-radius: 20px; padding: 4px 10px; color: #a090d0; }

  /* Bottom nav */
  .bottom-nav { position: absolute; bottom: 0; left: 0; right: 0; background: #131318; border-top: 1px solid #1e1e28; padding: 8px 0 24px; display: flex; }
  .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .nav-icon { font-size: 20px; }
  .nav-label { font-size: 10px; color: #555; }
  .nav-item.active .nav-label { color: #8060d0; }

  .anno { position: absolute; background: rgba(200,160,60,0.08); border: 1.5px dashed #c8a03c; border-radius: 8px; pointer-events: none; }
  .anno-label { position: absolute; font-size: 10px; color: #c8a03c; font-weight: 600; white-space: nowrap; }
  .screen-label { position: absolute; top: 14px; right: 14px; font-size: 10px; color: #444; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="statusbar">
    <div class="statusbar-time">9:46</div>
    <div style="font-size:11px;color:#888; padding-right:20px;">●●●●</div>
  </div>

  <div class="header">
    <div class="greeting">Good morning</div>
    <div class="name">You're all set ✓</div>
  </div>

  <div class="summary-strip">
    <div class="stat-card highlight">
      <div class="stat-num">8</div>
      <div class="stat-label">Tasks saved</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">2</div>
      <div class="stat-label">Overdue</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">1</div>
      <div class="stat-label">Idea captured</div>
    </div>
  </div>

  <div class="section-header">
    <div class="section-title">Today's Focus</div>
    <div class="see-all">See all →</div>
  </div>

  <div class="task-row">
    <div class="task-check"></div>
    <div class="task-title-text">Submit expense report</div>
    <div class="task-tag red">Overdue</div>
  </div>
  <div class="task-row">
    <div class="task-check"></div>
    <div class="task-title-text">Call dentist — book appointment</div>
    <div class="task-tag">By Fri</div>
  </div>
  <div class="task-row">
    <div class="task-check"></div>
    <div class="task-title-text">Get birthday gift for James</div>
    <div class="task-tag">Next week</div>
  </div>
  <div class="task-row">
    <div class="task-check done">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4.5 7.5L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="task-title-text done">Note dump organized by Enso</div>
    <div class="task-tag" style="color:#3ab86a; border-color:#1a3a20; background:#0e1e14;">Done</div>
  </div>

  <div class="briefing-card">
    <div class="briefing-header">
      <div class="briefing-icon">🤖</div>
      <div>
        <div class="briefing-title">Team Leader — Morning Brief</div>
        <div class="briefing-sub">Just set up · First check-in tomorrow 8 AM</div>
      </div>
    </div>
    <div class="briefing-text">I've organized your notes and I'll check in each morning with priority updates. I noticed a pattern — you have several admin tasks building up. Want me to block time this week?</div>
    <div class="briefing-chips">
      <div class="briefing-chip">✓ Block time</div>
      <div class="briefing-chip">→ See all tasks</div>
      <div class="briefing-chip">✕ Not now</div>
    </div>
  </div>

  <div class="bottom-nav">
    <div class="nav-item active">
      <div class="nav-icon">🏠</div>
      <div class="nav-label" style="color:#8060d0;">Home</div>
    </div>
    <div class="nav-item">
      <div class="nav-icon">✓</div>
      <div class="nav-label">Tasks</div>
    </div>
    <div class="nav-item">
      <div class="nav-icon">💬</div>
      <div class="nav-label">Chat</div>
    </div>
    <div class="nav-item">
      <div class="nav-icon">🧠</div>
      <div class="nav-label">Cortex</div>
    </div>
    <div class="nav-item">
      <div class="nav-icon">⚙️</div>
      <div class="nav-label">Settings</div>
    </div>
  </div>

  <!-- Annotations -->
  <div class="anno" style="top:120px; left:16px; right:16px; height:74px;"></div>
  <div class="anno-label" style="top:104px; left:16px;">At-a-glance success confirmation with stats</div>

  <div class="anno" style="top:510px; left:16px; right:16px; height:170px;"></div>
  <div class="anno-label" style="top:494px; left:16px;">TL proactive insight with actionable remark chips</div>

  <div class="screen-label">Screen 4 / 4 · Outcome</div>
</body>
</html>`;

// ─── Render all pages ─────────────────────────────────────────────────────────
async function render(html, path, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path, type: 'png', clip: { x: 0, y: 0, width, height } });
  console.log('Saved:', path);
}

await render(flowHTML,       'D:/Github/Enso/design/01-user-flow-diagram.png',        1200, 600);
await render(welcomeHTML,    'D:/Github/Enso/design/02-wireframe-welcome.png',         390, 844);
await render(noteDumpHTML,   'D:/Github/Enso/design/03-wireframe-note-capture.png',    390, 844);
await render(extractionHTML, 'D:/Github/Enso/design/04-wireframe-ai-extraction.png',   390, 844);
await render(outcomeHTML,    'D:/Github/Enso/design/05-wireframe-outcome-dashboard.png', 390, 844);

await browser.close();
console.log('All done.');
