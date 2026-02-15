import { v4 as uuidv4 } from "uuid";
import type { ServerMessage } from "../shared/types.js";
import { serverGenerateUI } from "./ui-generator.js";

type SendFn = (msg: ServerMessage) => void;

interface MockScenario {
  keywords: string[];
  text: string;
  data: unknown;
}

const SCENARIOS: MockScenario[] = [
  {
    keywords: ["sales", "revenue", "quarterly"],
    text: "Here's the quarterly sales data for this year. Revenue has been growing steadily with a strong Q3 performance.",
    data: {
      title: "Quarterly Sales Report",
      growth: "+23% YoY",
      quarters: [
        { quarter: "Q1", revenue: 142000, deals: 38 },
        { quarter: "Q2", revenue: 168000, deals: 45 },
        { quarter: "Q3", revenue: 215000, deals: 52 },
        { quarter: "Q4", revenue: 198000, deals: 48 },
      ],
    },
  },
  {
    keywords: ["weather", "forecast", "temperature"],
    text: "Here's the 5-day weather forecast for your area.",
    data: {
      location: "San Francisco, CA",
      forecast: [
        { day: "Mon", high: 68, low: 54, condition: "Sunny", humidity: 45 },
        { day: "Tue", high: 65, low: 52, condition: "Partly Cloudy", humidity: 55 },
        { day: "Wed", high: 61, low: 50, condition: "Cloudy", humidity: 70 },
        { day: "Thu", high: 59, low: 48, condition: "Rain", humidity: 85 },
        { day: "Fri", high: 64, low: 51, condition: "Sunny", humidity: 40 },
      ],
    },
  },
  {
    keywords: ["task", "kanban", "todo", "project"],
    text: "Here's your current project board with all tasks organized by status.",
    data: {
      projectName: "Enso Launch",
      columns: [
        {
          name: "To Do",
          tasks: [
            { id: 1, title: "Write API docs", priority: "medium", assignee: "Alice" },
            { id: 2, title: "Set up CI/CD", priority: "high", assignee: "Bob" },
          ],
        },
        {
          name: "In Progress",
          tasks: [
            { id: 3, title: "Implement auth", priority: "high", assignee: "Charlie" },
            { id: 4, title: "Design landing page", priority: "medium", assignee: "Diana" },
          ],
        },
        {
          name: "Done",
          tasks: [
            { id: 5, title: "Project setup", priority: "low", assignee: "Alice" },
          ],
        },
      ],
    },
  },
  {
    keywords: ["profile", "user", "account"],
    text: "Here's the user profile information.",
    data: {
      name: "Alex Johnson",
      role: "Senior Engineer",
      email: "alex@openclaw.dev",
      avatar: null,
      stats: { commits: 1247, pullRequests: 89, reviews: 234 },
      skills: ["TypeScript", "React", "Rust", "Python"],
      status: "online",
    },
  },
];

function findScenario(text: string): MockScenario | null {
  const lower = text.toLowerCase();
  return SCENARIOS.find((s) => s.keywords.some((kw) => lower.includes(kw))) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function handleChat(
  userText: string,
  sessionKey: string,
  send: SendFn
): Promise<void> {
  const runId = uuidv4();
  let seq = 0;

  const scenario = findScenario(userText);

  if (!scenario) {
    // Plain text echo
    const responseText = `You said: "${userText}". Try asking about sales data, weather forecast, tasks, or user profile to see dynamic UI components!`;
    const words = responseText.split(" ");

    for (const word of words) {
      send({
        id: uuidv4(),
        runId,
        sessionKey,
        seq: seq++,
        state: "delta",
        text: word + " ",
        timestamp: Date.now(),
      });
      await sleep(50);
    }

    send({
      id: uuidv4(),
      runId,
      sessionKey,
      seq: seq++,
      state: "final",
      text: responseText,
      timestamp: Date.now(),
    });
    return;
  }

  // Stream text
  const words = scenario.text.split(" ");
  for (const word of words) {
    send({
      id: uuidv4(),
      runId,
      sessionKey,
      seq: seq++,
      state: "delta",
      text: word + " ",
      timestamp: Date.now(),
    });
    await sleep(50);
  }

  // Generate UI in parallel (already ran alongside streaming)
  const uiResult = await serverGenerateUI({
    data: scenario.data,
    userMessage: userText,
    assistantText: scenario.text,
  });

  console.log(
    `[Bridge] UI generated for runId=${runId} shape=${uiResult.shapeKey} cached=${uiResult.cached}`
  );

  // Final message with data + generated UI
  send({
    id: uuidv4(),
    runId,
    sessionKey,
    seq: seq++,
    state: "final",
    text: scenario.text,
    data: scenario.data,
    generatedUI: uiResult.code,
    timestamp: Date.now(),
  });
}
