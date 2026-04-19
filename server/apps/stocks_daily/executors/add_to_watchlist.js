// Add or remove a ticker from the user's personal watchlist.
// Persisted at ~/.enso/data/factor-strategies/watchlist.json so it survives restarts
// and is shared across the in-app card and any landing-page action.

var fs = require("fs");
var path = require("path");

var ticker = (params && typeof params.ticker === "string") ? params.ticker.trim().toUpperCase() : "";
var action = (params && typeof params.action === "string") ? params.action : "add";

if (!ticker) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_add_to_watchlist",
    error: true,
    message: "ticker is required"
  }) }] };
}

var home = process.env.HOME || process.env.USERPROFILE || ".";
var dir = path.join(home, ".enso", "data", "factor-strategies");
var file = path.join(dir, "watchlist.json");

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

var state = { tickers: [], history: [] };
if (fs.existsSync(file)) {
  try {
    var raw = fs.readFileSync(file, "utf-8");
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tickers)) state.tickers = parsed.tickers;
    if (parsed && Array.isArray(parsed.history)) state.history = parsed.history;
  } catch(e) { /* fresh */ }
}

var seen = {};
for (var ti = 0; ti < state.tickers.length; ti++) seen[state.tickers[ti]] = true;
var present = !!seen[ticker];
var watching;

if (action === "remove" || (action !== "add" && present)) {
  state.tickers = state.tickers.filter(function(t) { return t !== ticker; });
  watching = false;
} else {
  if (!present) state.tickers.push(ticker);
  watching = true;
}

state.history.unshift({ ticker: ticker, action: watching ? "added" : "removed", ts: new Date().toISOString() });
state.history = state.history.slice(0, 50);

fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_stocks_daily_add_to_watchlist",
  ticker: ticker,
  action: watching ? "add" : "remove",
  watching: watching,
  watchlistSize: state.tickers.length,
  watchlist: state.tickers.slice(),
  message: (watching ? "Added " : "Removed ") + ticker + (watching ? " to watchlist" : " from watchlist")
}) }] };
