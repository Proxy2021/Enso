// Get full PKG deployment status from persistent store
var DEFAULT_PHASES = [
  {
    id: "foundation",
    name: "Foundation",
    phase: 1,
    description: "Core reading and search infrastructure",
    tools: [
      { id: "calibre_web", name: "Calibre-Web", status: "not_started", notes: "", checklist: [
        { item: "Install Docker container", done: false },
        { item: "Mount library volume", done: false },
        { item: "Configure OPDS feed", done: false },
        { item: "Import existing library", done: false }
      ]},
      { id: "meilisearch", name: "Meilisearch", status: "not_started", notes: "", checklist: [
        { item: "Deploy instance", done: false },
        { item: "Create book/media indexes", done: false },
        { item: "Configure API key", done: false },
        { item: "Test search queries", done: false }
      ]},
      { id: "readwise_reader", name: "Readwise Reader", status: "not_started", notes: "", checklist: [
        { item: "Set up API token", done: false },
        { item: "Configure sync schedule", done: false },
        { item: "Map highlight categories", done: false },
        { item: "Verify highlight import", done: false }
      ]}
    ]
  },
  {
    id: "knowledge_graph",
    name: "Knowledge Graph Core",
    phase: 2,
    description: "Graph database and RAG pipeline",
    tools: [
      { id: "neo4j", name: "Neo4j", status: "not_started", notes: "", checklist: [
        { item: "Deploy Neo4j Community/Enterprise", done: false },
        { item: "Configure authentication", done: false },
        { item: "Create schema constraints", done: false },
        { item: "Load initial data", done: false }
      ]},
      { id: "chromadb", name: "ChromaDB", status: "not_started", notes: "", checklist: [
        { item: "Deploy ChromaDB server", done: false },
        { item: "Configure embedding model", done: false },
        { item: "Create collections", done: false },
        { item: "Index existing entities", done: false }
      ]},
      { id: "graphrag", name: "GraphRAG Pipeline", status: "not_started", notes: "", checklist: [
        { item: "Set up extraction pipeline", done: false },
        { item: "Configure entity resolution", done: false },
        { item: "Build relationship mapping", done: false },
        { item: "Test query interface", done: false }
      ]}
    ]
  },
  {
    id: "media_expansion",
    name: "Media Expansion",
    phase: 3,
    description: "Multi-media content management",
    tools: [
      { id: "kavita", name: "Kavita", status: "not_started", notes: "", checklist: [
        { item: "Install Kavita server", done: false },
        { item: "Configure manga/comic libraries", done: false },
        { item: "Set up metadata providers", done: false }
      ]},
      { id: "jellyfin", name: "Jellyfin", status: "not_started", notes: "", checklist: [
        { item: "Deploy Jellyfin server", done: false },
        { item: "Add media libraries", done: false },
        { item: "Configure transcoding", done: false },
        { item: "Set up remote access", done: false }
      ]},
      { id: "playnite", name: "Playnite", status: "not_started", notes: "", checklist: [
        { item: "Install Playnite", done: false },
        { item: "Connect game libraries (Steam, etc.)", done: false },
        { item: "Configure metadata sources", done: false },
        { item: "Export game database", done: false }
      ]},
      { id: "obsidian", name: "Obsidian", status: "not_started", notes: "", checklist: [
        { item: "Set up vault structure", done: false },
        { item: "Configure sync method", done: false },
        { item: "Install graph plugins", done: false },
        { item: "Link to knowledge graph", done: false }
      ]}
    ]
  },
  {
    id: "photo_intelligence",
    name: "Photo Intelligence",
    phase: 4,
    description: "Visual search and semantic embedding",
    tools: [
      { id: "weaviate", name: "Weaviate", status: "not_started", notes: "", checklist: [
        { item: "Deploy Weaviate instance", done: false },
        { item: "Configure schema for images", done: false },
        { item: "Set up vectorizer module", done: false },
        { item: "Test vector search", done: false }
      ]},
      { id: "siglip", name: "SigLIP Embeddings", status: "not_started", notes: "", checklist: [
        { item: "Set up SigLIP model server", done: false },
        { item: "Configure batch embedding pipeline", done: false },
        { item: "Process existing photo library", done: false },
        { item: "Validate semantic search quality", done: false }
      ]}
    ]
  }
];

var DEFAULT_SOURCES = [
  { id: "enso_cortex", name: "Enso Cortex", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "kindle_readwise", name: "Kindle / Readwise", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "photos", name: "Photos", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "calibre_web", name: "Calibre-Web", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "jellyfin", name: "Jellyfin", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "playnite", name: "Playnite", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
  { id: "obsidian", name: "Obsidian", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" }
];

// Load or initialize phases
var phases = await ctx.store.get("phases");
if (!phases) {
  phases = DEFAULT_PHASES;
  await ctx.store.set("phases", phases);
}

// Load or initialize sources
var sources = await ctx.store.get("sources");
if (!sources) {
  sources = DEFAULT_SOURCES;
  await ctx.store.set("sources", sources);
}

// Try to get Cortex entity count
try {
  var cortexResult = await ctx.callTool("enso_cortex_search", { query: "*", limit: 1 });
  if (cortexResult.success) {
    var cData = cortexResult.data;
    if (typeof cData === "string") { try { cData = JSON.parse(cData); } catch(e) {} }
    var cortexCount = (cData && cData.totalCount) || (cData && cData.results && cData.results.length) || 0;
    for (var si = 0; si < sources.length; si++) {
      if (sources[si].id === "enso_cortex") {
        sources[si].status = "connected";
        sources[si].health = "healthy";
        sources[si].lastSync = new Date().toISOString();
        if (cortexCount > 0) sources[si].recordCount = cortexCount;
      }
    }
    await ctx.store.set("sources", sources);
  }
} catch(e) {}

// Compute progress per phase and overall
var totalTools = 0;
var deployedTools = 0;
var verifiedTools = 0;
for (var pi = 0; pi < phases.length; pi++) {
  var phase = phases[pi];
  var phaseTotal = phase.tools.length;
  var phaseDone = 0;
  for (var ti = 0; ti < phase.tools.length; ti++) {
    totalTools++;
    var st = phase.tools[ti].status;
    if (st === "deployed") { phaseDone++; deployedTools++; }
    else if (st === "verified") { phaseDone++; deployedTools++; verifiedTools++; }
    else if (st === "in_progress") { phaseDone += 0.5; }
  }
  phase.progress = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
}

var overallProgress = totalTools > 0 ? Math.round((deployedTools / totalTools) * 100) : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_pkg_tracker_get_status",
      phases: phases,
      overallProgress: overallProgress,
      totalTools: totalTools,
      deployedTools: deployedTools,
      verifiedTools: verifiedTools,
      sources: sources
    })
  }]
};
