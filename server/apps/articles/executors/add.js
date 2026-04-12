// Articles — Save Article: search web for articles with OpenGraph metadata preview
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_articles_add", error: "Please provide an article title, topic, or URL.", results: [] }) }] };
}

ctx.log("Searching for articles: " + query);

// Helper: fetch OpenGraph metadata from a URL
async function fetchOgMeta(url) {
  try {
    var response = await ctx.fetch(url, { timeout: 8000 });
    var html = "";
    if (response && response.ok && response.data) {
      html = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    }
    if (!html || html.length < 100) return {};

    var meta = {};
    // Extract og:image
    var imgMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+?)["']/i)
      || html.match(/<meta\s+content=["']([^"']+?)["']\s+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (imgMatch) meta.imageUrl = imgMatch[1];

    // Extract og:description
    var descMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([^"']*?)["']/i)
      || html.match(/<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["'](?:og:description|description)["']/i);
    if (descMatch) meta.ogDescription = descMatch[1];

    // Extract author
    var authorMatch = html.match(/<meta\s+(?:property|name)=["'](?:article:author|author)["']\s+content=["']([^"']*?)["']/i)
      || html.match(/<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["'](?:article:author|author)["']/i);
    if (authorMatch) meta.author = authorMatch[1];

    // Extract site name
    var siteMatch = html.match(/<meta\s+(?:property|name)=["']og:site_name["']\s+content=["']([^"']*?)["']/i)
      || html.match(/<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["']og:site_name["']/i);
    if (siteMatch) meta.siteName = siteMatch[1];

    // Extract published date
    var dateMatch = html.match(/<meta\s+(?:property|name)=["']article:published_time["']\s+content=["']([^"']*?)["']/i)
      || html.match(/<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["']article:published_time["']/i);
    if (dateMatch) meta.publishedDate = dateMatch[1].slice(0, 10);

    // Extract title if needed
    var titleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']*?)["']/i)
      || html.match(/<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["']og:title["']/i);
    if (titleMatch) meta.ogTitle = titleMatch[1];

    // Fallback title from <title> tag
    if (!meta.ogTitle) {
      var htmlTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (htmlTitleMatch) meta.ogTitle = htmlTitleMatch[1].replace(/ [-|–] .*$/, "").trim();
    }

    return meta;
  } catch(e) {
    return {};
  }
}

var results = [];
try {
  var isUrl = query.startsWith("http://") || query.startsWith("https://");

  if (isUrl) {
    // Direct URL — fetch and extract metadata
    var og = await fetchOgMeta(query);
    var domain = "";
    try { domain = new URL(query).hostname.replace("www.", ""); } catch(e) {}
    // Derive a clean title from the URL slug if OG failed
    var cleanTitle = og.ogTitle || "";
    if (!cleanTitle) {
      try {
        var urlPath = new URL(query).pathname.split("/").filter(function(s) { return s; }).pop() || "";
        cleanTitle = urlPath.replace(/[-_]/g, " ").replace(/\.\w+$/, "").replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      } catch(e) {}
    }
    results.push({
      title: cleanTitle || query,
      url: query,
      description: og.ogDescription || "",
      source: og.siteName || domain,
      imageUrl: og.imageUrl || "",
      author: og.author || "",
      publishedDate: og.publishedDate || "",
    });
  } else {
    // Search via Brave
    var searchResult = await ctx.search(query + " article", { count: 8 });
    if (searchResult && searchResult.results) {
      // Get basic results first
      var rawResults = searchResult.results.map(function(r) {
        return {
          title: r.title || "",
          url: r.url || "",
          description: (r.description || "").slice(0, 400),
          source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
          imageUrl: "",
          author: "",
          publishedDate: "",
        };
      }).filter(function(r) { return r.title && r.url; });

      // Fetch OG metadata for top 4 results (don't block on all 8)
      var ogPromises = rawResults.slice(0, 4).map(function(r) {
        return fetchOgMeta(r.url).then(function(og) {
          if (og.imageUrl) r.imageUrl = og.imageUrl;
          if (og.author) r.author = og.author;
          if (og.ogDescription && !r.description) r.description = og.ogDescription;
          if (og.publishedDate) r.publishedDate = og.publishedDate;
          if (og.siteName) r.source = og.siteName;
        }).catch(function() {});
      });
      await Promise.all(ogPromises);

      results = rawResults;
    }
  }

  ctx.log("Found " + results.length + " results");
} catch (e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_add",
  query: query,
  totalResults: results.length,
  results: results.slice(0, 8),
}) }] };
