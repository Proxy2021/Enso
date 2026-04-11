// Travel — Research Checklist: location immersion research checklist with categories
var p = params || {};
var action = (p.action || "load").trim();
var city = (p.city || "").trim();

// Load current trip context
var tripData = null;
try {
  tripData = await ctx.store.get("current_trip");
} catch(e) {}

if (!city && tripData) city = tripData.city || "";

// Load or initialize checklist from store
var storeKey = "checklist_" + city.toLowerCase().replace(/\s+/g, "_");
var checklist = null;
try {
  checklist = await ctx.store.get(storeKey);
} catch(e) {}

// Default checklist template based on Location Immersion Research Guide
var defaultChecklist = {
  categories: [
    {
      id: "history",
      label: "Historical Research",
      icon: "scroll",
      color: "#6366f1",
      items: [
        { id: "h1", text: "When was this place founded? By whom?", checked: false, notes: "", tip: "Origin stories reveal the oldest surviving structures" },
        { id: "h2", text: "What are the 3-5 turning points in its history?", checked: false, notes: "", tip: "Wars, fires, conquests explain architectural layers" },
        { id: "h3", text: "Was it destroyed and rebuilt? When?", checked: false, notes: "", tip: "Reconstruction periods define dominant styles" },
        { id: "h4", text: "What role did it play nationally/globally?", checked: false, notes: "", tip: "Capitals, ports, religious centers have different visual DNA" },
        { id: "h5", text: "Create a 5-10 entry visual timeline", checked: false, notes: "", tip: "[Year] — [Event] — [Visual consequence you can photograph]" }
      ]
    },
    {
      id: "culture",
      label: "Cultural Highlights",
      icon: "palette",
      color: "#8b5cf6",
      items: [
        { id: "c1", text: "What traditions, festivals, or daily practices are unique?", checked: false, notes: "", tip: "Check festival calendars for your travel dates" },
        { id: "c2", text: "What is the signature cuisine? Where is it prepared?", checked: false, notes: "", tip: "Market scenes and street food = compelling photos" },
        { id: "c3", text: "What is the dominant architecture style & materials?", checked: false, notes: "", tip: "Materials define texture: stone, wood, bamboo, concrete" },
        { id: "c4", text: "When do locals wake, work, eat, socialize?", checked: false, notes: "", tip: "Daily rhythms tell you when streets are alive vs quiet" },
        { id: "c5", text: "What artisan crafts are practiced here?", checked: false, notes: "", tip: "Textiles, pottery, food craft = amazing close-up subjects" },
        { id: "c6", text: "What photography etiquette rules apply?", checked: false, notes: "", tip: "Some areas fine photographers — know before you go" }
      ]
    },
    {
      id: "iconic",
      label: "Iconic Spots",
      icon: "camera",
      color: "#f59e0b",
      items: [
        { id: "i1", text: "List the top 5-8 must-photograph locations", checked: false, notes: "", tip: "Search: 'best photo spots in [city]'" },
        { id: "i2", text: "Note the exact vantage point for each famous shot", checked: false, notes: "", tip: "Pin locations on Google Maps" },
        { id: "i3", text: "Research crowd patterns and best visit times", checked: false, notes: "", tip: "Dawn is almost always least crowded" },
        { id: "i4", text: "Check for any access restrictions or permits needed", checked: false, notes: "", tip: "Temples, monuments often have photography rules" },
        { id: "i5", text: "Find reference photos from photographers you admire", checked: false, notes: "", tip: "Use 500px, Flickr, or Instagram location tags" }
      ]
    },
    {
      id: "hidden",
      label: "Hidden Gems",
      icon: "gem",
      color: "#22c55e",
      items: [
        { id: "g1", text: "Find 5-8 off-the-beaten-path locations", checked: false, notes: "", tip: "Check Atlas Obscura and local photography groups" },
        { id: "g2", text: "Identify neighborhood-specific photo opportunities", checked: false, notes: "", tip: "Each neighborhood has its own visual character" },
        { id: "g3", text: "Check LocationScout.net for curated spots with coords", checked: false, notes: "", tip: "GPS coordinates save time on location" },
        { id: "g4", text: "Research local markets, workshops, and gathering spaces", checked: false, notes: "", tip: "Social spaces reveal authentic daily life" },
        { id: "g5", text: "Identify unique viewpoints and elevated vantage points", checked: false, notes: "", tip: "Rooftops, bridges, hills give unique perspectives" }
      ]
    },
    {
      id: "visual",
      label: "Visual Character Notes",
      icon: "eye",
      color: "#ec4899",
      items: [
        { id: "v1", text: "Identify the dominant color palette of the destination", checked: false, notes: "", tip: "Stone grey? Terracotta? Whitewash? Neon? Wood-brown?" },
        { id: "v2", text: "Note key textures: cobblestone, bamboo, moss, rust, etc.", checked: false, notes: "", tip: "Textures drive close-up and detail compositions" },
        { id: "v3", text: "Map architectural lines: curves, grids, alleys, domes", checked: false, notes: "", tip: "Lines guide the eye — know what to expect" },
        { id: "v4", text: "Research light quality for the location", checked: false, notes: "", tip: "Basin=soft, coastal=bright, northern=low golden" },
        { id: "v5", text: "Write a one-paragraph 'visual brief'", checked: false, notes: "", tip: "Describe place as if briefing a painter on colors/mood" },
        { id: "v6", text: "Identify 3-5 narrative hooks for a photo series", checked: false, notes: "", tip: "Themes that connect photos into a coherent story" }
      ]
    }
  ]
};

if (!checklist) {
  checklist = defaultChecklist;
}

// Handle actions
if (action === "toggle" && p.itemId) {
  var found = false;
  for (var ci = 0; ci < checklist.categories.length; ci++) {
    var cat = checklist.categories[ci];
    for (var ii = 0; ii < cat.items.length; ii++) {
      if (cat.items[ii].id === p.itemId) {
        cat.items[ii].checked = !cat.items[ii].checked;
        found = true;
        break;
      }
    }
    if (found) break;
  }
}

if (action === "update_notes" && p.itemId && p.notes !== undefined) {
  for (var ci2 = 0; ci2 < checklist.categories.length; ci2++) {
    var cat2 = checklist.categories[ci2];
    for (var ii2 = 0; ii2 < cat2.items.length; ii2++) {
      if (cat2.items[ii2].id === p.itemId) {
        cat2.items[ii2].notes = p.notes;
        break;
      }
    }
  }
}

if (action === "reset") {
  checklist = defaultChecklist;
}

// Save checklist
try {
  await ctx.store.set(storeKey, checklist);
} catch(e) {}

// Compute stats
var totalItems = 0;
var checkedItems = 0;
var categoryStats = [];
for (var cs = 0; cs < checklist.categories.length; cs++) {
  var c = checklist.categories[cs];
  var catChecked = 0;
  for (var ci3 = 0; ci3 < c.items.length; ci3++) {
    totalItems++;
    if (c.items[ci3].checked) { checkedItems++; catChecked++; }
  }
  categoryStats.push({ id: c.id, label: c.label, total: c.items.length, checked: catChecked, percent: Math.round((catChecked / c.items.length) * 100) });
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_research_checklist",
  city: city,
  totalItems: totalItems,
  checkedItems: checkedItems,
  overallPercent: Math.round((checkedItems / totalItems) * 100),
  categoryStats: categoryStats,
  categories: checklist.categories
}) }] };
