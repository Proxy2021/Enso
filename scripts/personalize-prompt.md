# Enso App Personalization — Deep Customization

You are an expert UI/UX designer and React engineer. You're personalizing an Enso installation to create a **completely custom app experience** for a specific user. This is not theming — you are redesigning the app to feel purpose-built for this person's workflow.

## User Profile

- **Name**: {{USER_NAME}}
- **Role**: {{USER_ROLE}}
- **App Name**: {{APP_NAME}}

## Your Mission

Transform this Enso installation into **{{APP_NAME}}** — an app that looks and feels like it was built from scratch for {{USER_NAME}}'s specific workflow. Go far beyond text changes. Design and implement a genuinely different experience.

## What You Can (and Should) Modify

### 1. App Identity (required)
- `src/App.tsx` — Change header title to "{{APP_NAME}}"
- `public/manifest.json` — Update `name` and `short_name`
- `capacitor.config.ts` — Update `appName`

### 2. Welcome Screen Redesign (the big one)
**File: `src/components/WelcomeCard.tsx`**

Don't just reorder tiles — **redesign the welcome experience** for this user's domain:
- Create a custom layout that makes sense for their workflow
- Add domain-specific sections (e.g., a "Quick Actions" panel, a "Daily Briefing" section, role-specific widgets)
- Use the available EnsoUI components and Tailwind CSS classes for styling
- The component receives `sendMessage(text)` and `runApp(appId)` from the Zustand store — use these for interactivity
- You can create entirely new JSX structure, not just reorder the existing tiles
- Consider: what would this user want to see FIRST when they open the app?

**Design ideas by persona type:**
- **Founder/CEO**: Command center with quick-launch panels for Research, Code, Projects, Discover. A "What should I focus on today?" prompt area
- **Developer**: Code-first layout with prominent terminal/code tiles, a quick "debug this" input, recent repos section concept
- **Researcher**: Research-focused with a prominent search/deep-dive input, topic categories, "Continue reading" section concept
- **Investor**: Market intelligence dashboard-style layout with sections for Deal Flow, Market Research, Portfolio, Due Diligence
- **Creative**: Visual/media-forward layout with inspiration prompts, content calendar concept, media tools prominent
- **Product Manager**: Sprint/roadmap oriented with backlog concepts, team coordination tools prominent, metrics section

### 3. Suggested Prompts & i18n (required)
**File: `src/lib/i18n/en.json`**
- `welcome.tagline` — A punchy, memorable tagline (4-8 words) that captures the app's essence for this user
- `welcome.subtitle` — One sentence describing what the app does for them
- `welcome.prompt.*` — Replace all 6 prompts with ones specific to this user's actual daily work. Be concrete and technical, not generic

### 4. Visual Differentiation
Use Tailwind CSS classes to give the app a distinct visual feel:
- Different accent colors for borders, highlights, hover states (the existing palette: indigo, blue, emerald, amber, purple, rose, cyan, orange, violet, teal, pink)
- Consider the emotional tone — a finance app should feel precise and data-driven, a creative app should feel open and inspiring
- All styling is via Tailwind classes — no CSS files needed

## Technical Constraints

- The sandbox has: React 19 hooks (useState, useEffect, useMemo, etc.), Tailwind CSS 4, Lucide icons (import from 'lucide-react')
- WelcomeCard is a functional React component — all hooks must be at the top level
- Use `useChatStore` from `../store/chat` for `sendMessage`, `runApp`, `connectionState`
- Use `useT` from `../lib/i18n` for `t(key)` translations
- Import constants from `../lib/constants` for `STORAGE_KEYS`, `TIMINGS`
- The component must be self-contained — no new file imports (all deps are already available)
- Keep the `RecentTopics` sub-component at the bottom of the file
- The `handleClick(template)` and `handlePromptClick(textKey)` patterns must still work for tool launching
- DO NOT modify any backend files or server logic — frontend only

## After All Modifications

Save the user profile to `~/.enso/user-profile.json`:
```json
{
  "userName": "{{USER_NAME}}",
  "userRole": "{{USER_ROLE}}",
  "appName": "{{APP_NAME}}",
  "personalizedAt": "<current ISO timestamp>"
}
```

## Quality Bar

The result should make {{USER_NAME}} think: "This app was built specifically for me." Not "someone changed some labels." The welcome screen should feel like opening a purpose-built professional tool, not a generic AI chatbot with different text.
