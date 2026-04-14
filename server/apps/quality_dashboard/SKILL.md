---
name: quality_dashboard
description: "Quality & Insights Dashboard — monitor Enso's quality scores, activity feed, personalization profile, and AI-generated insights. Provides transparent visibility into how well your AI assistant is performing."
---

Quality & Insights Dashboard — monitor Enso's quality scores, activity feed, personalization profile, and AI-generated insights. Provides transparent visibility into how well your AI assistant is performing.

## Tool Reference

### enso_quality_dashboard_overview (primary)

Get Enso quality overview: composite score (0-100), dimension breakdowns (Response Quality, Action Success, Proactive Relevance, Orchestration Value), 7-day and 30-day trends. Use when the user says: 'show quality dashboard', 'how is Enso doing', 'quality score', 'show quality overview', 'Enso health'.

Parameters:
- `period` (string): Time period for trends: '7d' or '30d' (default: '7d')

### enso_quality_dashboard_activity

Get chronological activity feed with quality signals. Filter by interaction type (chat, action, proactive, orchestration), quality level, or date range. Use when the user says: 'show activity', 'recent interactions', 'what has Enso been doing', 'activity log', 'quality feed'.

Parameters:
- `filter` (string): Filter by type: 'all', 'chat', 'action', 'proactive', 'orchestration' (default: 'all')
- `quality` (string): Filter by quality: 'all', 'good', 'neutral', 'poor' (default: 'all')
- `limit` (number): Number of entries to return (default: 30)

### enso_quality_dashboard_profile

View personalization profile — what Enso has learned about the user. Shows work patterns, communication preferences, topic interests, tool usage with confidence levels and evidence counts. Users can edit or delete preferences. Use when the user says: 'what does Enso know about me', 'personalization profile', 'my preferences', 'learned preferences', 'show my profile'.

Parameters:
- `action` (string): Action: 'view', 'delete' (default: 'view')
- `preferenceId` (string): Preference ID to delete (required for delete action)

### enso_quality_dashboard_insights

Get AI-generated insights and recommendations based on usage patterns. Shows productivity insights, feature recommendations, and weekly summary stats. Use when the user says: 'show insights', 'recommendations', 'usage patterns', 'weekly summary', 'what can I improve', 'Enso suggestions'.

Parameters:
- `period` (string): Period for summary: 'week' or 'month' (default: 'week')

### enso_quality_dashboard_feedback

Submit quality feedback: rate a response (thumbs up/down), answer a pulse question, or provide freeform feedback. Use when the user says: 'rate this', 'give feedback', 'thumbs up', 'thumbs down', 'quality feedback'.

Parameters:
- `type` (string): Feedback type: 'rating', 'pulse', 'freeform'
- `value` (number): For rating: 1 (thumbs up) or 0 (thumbs down). For pulse: 1-5 scale.
- `text` (string): Freeform feedback text or pulse question response
- `contextId` (string): ID of the interaction being rated (optional)
