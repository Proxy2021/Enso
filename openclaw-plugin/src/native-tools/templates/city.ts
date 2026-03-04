import type { ToolTemplate } from "../registry.js";

export function isCitySignature(signatureId: string): boolean {
  return signatureId === "city_research_board";
}

export function getCityTemplateCode(_signature: ToolTemplate): string {
  return CITY_TEMPLATE;
}

const CITY_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [imgErrors, setImgErrors] = useState({});
  const [imgLoaded, setImgLoaded] = useState({});
  const [cityInput, setCityInput] = useState("");
  const [playingVideo, setPlayingVideo] = useState(null);
  const [favorites, setFavorites] = useState({});

  const city = String(data?.city ?? "");
  const category = String(data?.category ?? "overview");
  const places = Array.isArray(data?.places) ? data.places : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  const summary = String(data?.summary ?? "");
  const recentCities = Array.isArray(data?.recentCities) ? data.recentCities : [];
  const travelTips = Array.isArray(data?.travelTips) ? data.travelTips : [];
  const country = data?.country || "";
  const currency = data?.currency || "";
  const language = data?.language || "";
  const bestSeason = data?.bestSeason || "";
  const fromHistory = !!data?.fromHistory;
  const isWelcome = category === "welcome" || (!city && places.length === 0);
  const isOverview = !isWelcome && (data?.tool === "enso_city_explore" || sections.length > 0);
  const isRestaurants = data?.tool === "enso_city_restaurants" || category === "restaurants";
  const isPhotoSpots = data?.tool === "enso_city_photo_spots" || category === "photo_spots";
  const isLandmarks = data?.tool === "enso_city_landmarks" || category === "landmarks";
  const isEmail = data?.tool === "enso_city_send_email";

  const accentMap = { restaurants: "amber", photo_spots: "purple", landmarks: "cyan", overview: "blue" };
  const accent = accentMap[category] || "blue";

  const handleImgError = (name) => setImgErrors((prev) => ({ ...prev, [name]: true }));
  const handleImgLoad = (name) => setImgLoaded((prev) => ({ ...prev, [name]: true }));
  const toggleFav = (name) => setFavorites((prev) => ({ ...prev, [name]: !prev[name] }));

  const timeAgo = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + "d ago";
    return Math.floor(days / 7) + "w ago";
  };

  // ── Helpers ──

  const toYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    try {
      var u = new URL(url);
      if ((u.hostname === "www.youtube.com" || u.hostname === "youtube.com") && u.searchParams.get("v")) {
        return "https://www.youtube.com/embed/" + u.searchParams.get("v") + "?autoplay=1&rel=0";
      }
      if (u.hostname === "youtu.be" && u.pathname.length > 1) {
        return "https://www.youtube.com/embed/" + u.pathname.slice(1) + "?autoplay=1&rel=0";
      }
      if ((u.hostname === "www.youtube.com" || u.hostname === "youtube.com") && u.pathname.startsWith("/embed/")) {
        return url + (url.includes("?") ? "&autoplay=1" : "?autoplay=1&rel=0");
      }
    } catch(e) {}
    return null;
  };

  const sortPlaces = (items) => {
    if (sortBy === "rating") {
      return [...items].sort((a, b) => {
        const ra = parseFloat(a.rating) || 0;
        const rb = parseFloat(b.rating) || 0;
        return rb - ra;
      });
    }
    if (sortBy === "name") {
      return [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    if (sortBy === "price_low") {
      return [...items].sort((a, b) => (a.priceLevel || "").length - (b.priceLevel || "").length);
    }
    if (sortBy === "price_high") {
      return [...items].sort((a, b) => (b.priceLevel || "").length - (a.priceLevel || "").length);
    }
    return items;
  };

  const iconMap = {
    Sun: LucideReact.Sun,
    Wallet: LucideReact.Wallet,
    Bus: LucideReact.Bus,
    Heart: LucideReact.Heart,
    Shield: LucideReact.Shield,
    Coffee: LucideReact.Coffee,
    Camera: LucideReact.Camera,
    Globe: LucideReact.Globe,
    Clock: LucideReact.Clock,
    Utensils: LucideReact.Utensils,
    Thermometer: LucideReact.Thermometer,
    Map: LucideReact.Map,
  };

  // ── Reusable components ──

  const PlaceCard = ({ place, idx }) => {
    const hasImg = place.imageUrl && !imgErrors[place.name];
    const imgReady = hasImg && imgLoaded[place.name];
    const isFav = favorites[place.name];
    return (
      <UICard key={idx} accent={accentMap[place.category] || accent}>
        {hasImg && (
          <div className={"w-full overflow-hidden rounded-t-lg -mt-3 -mx-3 relative " + (imgReady ? "h-32 mb-2" : "h-0")} style={{ width: "calc(100% + 1.5rem)" }}>
            <img src={place.imageUrl} alt={place.name} className="w-full h-full object-cover" onLoad={() => handleImgLoad(place.name)} onError={() => handleImgError(place.name)} referrerPolicy="no-referrer" />
            <button onClick={(e) => { e.stopPropagation(); toggleFav(place.name); }} className={"absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-colors " + (isFav ? "bg-rose-500/90" : "bg-black/50 hover:bg-black/70")}>
              <LucideReact.Heart className={"w-3.5 h-3.5 " + (isFav ? "text-white fill-white" : "text-white")} />
            </button>
            {place.priceLevel && (
              <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded">{place.priceLevel}</div>
            )}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-100 truncate">{place.name}</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {place.category && <Badge variant="info">{place.category}</Badge>}
              {place.rating && <Badge variant="success">{place.rating}</Badge>}
              {place.priceLevel && !hasImg && <Badge variant="outline">{place.priceLevel}</Badge>}
              {place.location && <Badge variant="outline">{place.location}</Badge>}
            </div>
          </div>
          {!hasImg && (
            <button onClick={() => toggleFav(place.name)} className="shrink-0 mt-0.5">
              <LucideReact.Heart className={"w-4 h-4 transition-colors " + (isFav ? "text-rose-400 fill-rose-400" : "text-gray-600 hover:text-rose-400")} />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1.5 line-clamp-2">{place.description}</div>
        <div className="flex gap-1.5 mt-2">
          <Button variant="ghost" onClick={() => setSelectedPlace(place)}>Details</Button>
          {place.mapUrl && (
            <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-white/5 transition-colors">
              <LucideReact.MapPin className="w-3 h-3" /> Map
            </a>
          )}
        </div>
      </UICard>
    );
  };

  const PlaceGrid = ({ items, emptyMsg }) => {
    const filtered = filter
      ? items.filter((p) =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          (p.category || "").toLowerCase().includes(filter.toLowerCase()) ||
          (p.location || "").toLowerCase().includes(filter.toLowerCase())
        )
      : items;
    const sorted = sortPlaces(filtered);
    if (sorted.length === 0) {
      return <EmptyState icon="Search" title="No results" description={emptyMsg || "Try a different search"} />;
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {sorted.map((place, idx) => <PlaceCard key={place.name + idx} place={place} idx={idx} />)}
      </div>
    );
  };

  const VideoGrid = ({ items }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <LucideReact.Play className="w-4 h-4 text-rose-400" />
          Video Guides ({items.length})
        </div>

        {playingVideo && (
          <UICard accent="rose">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-100 line-clamp-1 flex-1 mr-2">{playingVideo.title}</div>
                <Button variant="ghost" onClick={() => setPlayingVideo(null)}>
                  <LucideReact.X className="w-4 h-4" />
                </Button>
              </div>
              {toYouTubeEmbedUrl(playingVideo.url) ? (
                <div className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={toYouTubeEmbedUrl(playingVideo.url)}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ border: "none" }}
                  />
                </div>
              ) : (
                <a href={playingVideo.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">
                  Open video in new tab
                </a>
              )}
              <div className="flex items-center gap-2">
                {playingVideo.creator && <span className="text-[10px] text-gray-400">{playingVideo.creator}</span>}
                {playingVideo.duration && <Badge variant="default">{playingVideo.duration}</Badge>}
              </div>
            </div>
          </UICard>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((vid, idx) => (
            <UICard key={idx} accent="rose">
              <div className="cursor-pointer" onClick={() => setPlayingVideo(vid)}>
                {vid.thumbnail && !imgErrors["vid_" + idx] && (
                  <div className={"w-full overflow-hidden rounded-t-lg -mt-3 -mx-3 relative " + (imgLoaded["vid_" + idx] ? "h-24 mb-2" : "h-0")} style={{ width: "calc(100% + 1.5rem)" }}>
                    <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover" onLoad={() => handleImgLoad("vid_" + idx)} onError={() => handleImgError("vid_" + idx)} referrerPolicy="no-referrer" />
                    {vid.duration && (
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{vid.duration}</div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center">
                        <LucideReact.Play className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-xs font-medium text-gray-100 line-clamp-2">{vid.title}</div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {vid.creator && <span className="text-[10px] text-gray-400 truncate">{vid.creator}</span>}
                {vid.age && <span className="text-[10px] text-gray-500">{vid.age}</span>}
              </div>
            </UICard>
          ))}
        </div>
      </div>
    );
  };

  const SourcesList = ({ sources }) => {
    const items = Array.isArray(sources) ? sources : [];
    if (items.length === 0) return null;
    return (
      <Accordion items={[{
        value: "sources",
        title: "Sources (" + items.length + ")",
        content: (
          <div className="space-y-1 max-h-32 overflow-auto">
            {items.map((url, i) => {
              var domain = "";
              try { domain = new URL(url).hostname.replace("www.", ""); } catch(e) { domain = url; }
              return <div key={i} className="text-[10px] text-gray-500 truncate">{domain}</div>;
            })}
          </div>
        )
      }]} />
    );
  };

  const CityInfoBar = () => {
    if (!country && !currency && !language && !bestSeason) return null;
    const items = [
      country && { icon: LucideReact.Globe, label: country },
      currency && { icon: LucideReact.Wallet, label: currency },
      language && { icon: LucideReact.MessageCircle, label: language },
      bestSeason && { icon: LucideReact.Sun, label: bestSeason },
    ].filter(Boolean);
    return (
      <div className="flex flex-wrap gap-2 px-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white/5 rounded-full px-2.5 py-1">
            <item.icon className="w-3 h-3 text-gray-400" />
            <span className="text-[11px] text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const TravelTips = ({ tips }) => {
    if (!tips || tips.length === 0) return null;
    return (
      <Accordion items={[{
        value: "tips",
        title: "Travel Tips (" + tips.length + ")",
        content: (
          <div className="space-y-2">
            {tips.map((tip, i) => {
              const TipIcon = iconMap[tip.icon] || LucideReact.Info;
              return (
                <div key={i} className="flex gap-2.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <TipIcon className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-200">{tip.title}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{tip.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }]} />
    );
  };

  const StatsRow = () => {
    const restCount = sections.find((s) => s.category === "restaurants")?.places?.length || 0;
    const photoCount = sections.find((s) => s.category === "photo_spots")?.places?.length || 0;
    const landCount = sections.find((s) => s.category === "landmarks")?.places?.length || 0;
    return (
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <LucideReact.MapPin className="w-4 h-4 text-blue-400 mx-auto" />
          <div className="text-sm font-bold text-gray-100 mt-1">{places.length}</div>
          <div className="text-[10px] text-gray-500">Places</div>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center cursor-pointer hover:bg-white/10 transition-colors" onClick={() => onAction("restaurants", { city })}>
          <LucideReact.Utensils className="w-4 h-4 text-amber-400 mx-auto" />
          <div className="text-sm font-bold text-gray-100 mt-1">{restCount}</div>
          <div className="text-[10px] text-gray-500">Eats</div>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center cursor-pointer hover:bg-white/10 transition-colors" onClick={() => onAction("photo_spots", { city })}>
          <LucideReact.Camera className="w-4 h-4 text-purple-400 mx-auto" />
          <div className="text-sm font-bold text-gray-100 mt-1">{photoCount}</div>
          <div className="text-[10px] text-gray-500">Photos</div>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center cursor-pointer hover:bg-white/10 transition-colors" onClick={() => onAction("landmarks", { city })}>
          <LucideReact.Landmark className="w-4 h-4 text-cyan-400 mx-auto" />
          <div className="text-sm font-bold text-gray-100 mt-1">{landCount}</div>
          <div className="text-[10px] text-gray-500">Sights</div>
        </div>
      </div>
    );
  };

  const PlaceDetailDialog = () => {
    if (!selectedPlace) return null;
    return (
      <Dialog open={!!selectedPlace} onClose={() => setSelectedPlace(null)} title={selectedPlace.name}>
        <div className="space-y-3">
          {selectedPlace.imageUrl && !imgErrors[selectedPlace.name] && (
            <div className={"w-full overflow-hidden rounded-lg " + (imgLoaded[selectedPlace.name] ? "h-44" : "h-0")}>
              <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="w-full h-full object-cover" onLoad={() => handleImgLoad(selectedPlace.name)} onError={() => handleImgError(selectedPlace.name)} referrerPolicy="no-referrer" />
            </div>
          )}
          <div className="flex gap-1 flex-wrap">
            {selectedPlace.category && <Badge variant="info">{selectedPlace.category}</Badge>}
            {selectedPlace.rating && <Badge variant="success">{selectedPlace.rating}</Badge>}
            {selectedPlace.priceLevel && <Badge variant="outline">{selectedPlace.priceLevel}</Badge>}
            {selectedPlace.location && <Badge variant="outline">{selectedPlace.location}</Badge>}
          </div>
          <div className="text-sm text-gray-200 leading-relaxed">{selectedPlace.description}</div>
          {selectedPlace.bestTime && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <LucideReact.Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-gray-300">Best time: {selectedPlace.bestTime}</span>
            </div>
          )}
          {selectedPlace.highlights && selectedPlace.highlights.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-gray-400 font-medium">Highlights</div>
              {selectedPlace.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <LucideReact.Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-300">{h}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {selectedPlace.mapUrl && (
              <a href={selectedPlace.mapUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="primary">
                  <LucideReact.MapPin className="w-3.5 h-3.5 mr-1.5" /> Open in Maps
                </Button>
              </a>
            )}
            <Button variant={favorites[selectedPlace.name] ? "danger" : "outline"} onClick={() => toggleFav(selectedPlace.name)}>
              <LucideReact.Heart className={"w-3.5 h-3.5 mr-1 " + (favorites[selectedPlace.name] ? "fill-white" : "")} />
              {favorites[selectedPlace.name] ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  };

  // ── Welcome / city input view ──
  if (isWelcome) {
    const handleExplore = () => {
      const c = cityInput.trim();
      if (c) onAction("explore", { city: c });
    };
    const suggestions = [
      { name: "Paris", flag: "FR", desc: "City of Light" },
      { name: "Tokyo", flag: "JP", desc: "Neon & tradition" },
      { name: "New York", flag: "US", desc: "The Big Apple" },
      { name: "Rome", flag: "IT", desc: "Eternal City" },
      { name: "Barcelona", flag: "ES", desc: "Gaudi's masterpiece" },
      { name: "Istanbul", flag: "TR", desc: "East meets West" },
    ];
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <LucideReact.Globe className="w-6 h-6 text-blue-400" />
            <div className="text-lg font-bold text-gray-100">City Explorer</div>
          </div>
          <div className="text-xs text-gray-400 max-w-xs mx-auto">Discover restaurants, photo spots, landmarks, video guides, and local travel tips</div>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search any city..."
            value={cityInput}
            onChange={(val) => setCityInput(val)}
            onKeyDown={(e) => { if (e.key === "Enter") handleExplore(); }}
            icon="Search"
          />
          <Button variant="primary" onClick={handleExplore}>Explore</Button>
        </div>
        {recentCities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Recent explorations</div>
              <Button variant="ghost" onClick={() => onAction("delete_history", { city: "" })}>
                <span className="text-[10px] text-gray-500">Clear All</span>
              </Button>
            </div>
            <div className="space-y-1.5">
              {recentCities.map((rc, i) => (
                <UICard key={i} accent="blue">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => onAction("explore", { city: rc.city })}>
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                        <LucideReact.MapPin className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-100 truncate">{rc.city}</div>
                        <div className="flex gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{rc.placeCount} places</span>
                          {rc.videoCount > 0 && <span className="text-[10px] text-gray-400">{rc.videoCount} videos</span>}
                          <span className="text-[10px] text-gray-500">{timeAgo(rc.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => onAction("explore", { city: rc.city, force: true })}>
                        <LucideReact.RefreshCw className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" onClick={() => onAction("delete_history", { city: rc.city })}>
                        <LucideReact.X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </UICard>
              ))}
            </div>
          </div>
        )}
        {recentCities.length === 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Popular destinations</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {suggestions.map((s) => (
                <div key={s.name} className="bg-white/5 hover:bg-white/10 rounded-lg p-3 cursor-pointer transition-colors" onClick={() => onAction("explore", { city: s.name })}>
                  <div className="text-sm font-medium text-gray-100">{s.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Email result view ──
  if (isEmail) {
    return (
      <div className="space-y-3">
        <Stat label="Email Report" value={city} accent={data?.success ? "emerald" : "rose"} />
        <UICard accent={data?.success ? "emerald" : "rose"}>
          <Badge variant={data?.success ? "success" : "danger"}>{data?.success ? "Sent" : "Not Sent"}</Badge>
          <div className="text-sm text-gray-200 mt-2">{String(data?.message ?? "")}</div>
          {data?.recipient && (
            <div className="text-xs text-gray-400 mt-1">To: {String(data.recipient)}</div>
          )}
        </UICard>
        {data?.fallbackHtml && (
          <Accordion items={[{
            value: "html",
            title: "HTML Report (copy to use)",
            content: (
              <div className="max-h-48 overflow-auto">
                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap break-all">{String(data.fallbackHtml).slice(0, 3000)}</pre>
              </div>
            )
          }]} />
        )}
        <Button variant="primary" onClick={() => onAction("explore", { city })}>Back to Overview</Button>
      </div>
    );
  }

  // ── Overview view ──
  if (isOverview) {
    const searchSources = Array.isArray(data?.searchSources) ? data.searchSources : [];
    const overviewTabs = [{ value: "places", label: "Places (" + places.length + ")" }];
    if (videos.length > 0) overviewTabs.push({ value: "videos", label: "Videos (" + videos.length + ")" });
    if (travelTips.length > 0) overviewTabs.push({ value: "tips", label: "Tips" });

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Stat label="City Explorer" value={city} accent="blue" />
          <div className="flex gap-1.5">
            {fromHistory && (
              <Button variant="ghost" onClick={() => onAction("explore", { city, force: true })}>
                <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
              </Button>
            )}
            <Button variant="primary" onClick={() => setEmailOpen(true)}>
              <LucideReact.Mail className="w-3.5 h-3.5 mr-1" />Email
            </Button>
          </div>
        </div>

        {fromHistory && (
          <div className="flex items-center gap-1.5 px-1">
            <LucideReact.BookOpen className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-blue-400">Loaded from saved research</span>
          </div>
        )}

        <CityInfoBar />
        <StatsRow />

        {summary && <div className="text-xs text-gray-400 px-1 leading-relaxed">{summary}</div>}

        <Tabs tabs={overviewTabs} defaultValue="places" variant="pills">
          {(tab) => {
            if (tab === "videos") return <VideoGrid items={videos} />;
            if (tab === "tips") return <TravelTips tips={travelTips} />;
            return (
              <div className="space-y-3">
                {sections.map((section, sIdx) => {
                  const secPlaces = Array.isArray(section.places) ? section.places : [];
                  const catIcons = { restaurants: LucideReact.Utensils, photo_spots: LucideReact.Camera, landmarks: LucideReact.Landmark };
                  const CatIcon = catIcons[section.category] || LucideReact.MapPin;
                  const catColors = { restaurants: "text-amber-400", photo_spots: "text-purple-400", landmarks: "text-cyan-400" };
                  const catColor = catColors[section.category] || "text-blue-400";
                  return (
                    <div key={sIdx} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CatIcon className={"w-4 h-4 " + catColor} />
                          <div className="text-sm font-semibold text-gray-200">{section.label} ({secPlaces.length})</div>
                        </div>
                        <Button variant="ghost" onClick={() => {
                          const actionMap = { restaurants: "restaurants", photo_spots: "photo_spots", landmarks: "landmarks" };
                          onAction(actionMap[section.category] || "explore", { city });
                        }}>See All</Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {secPlaces.slice(0, 4).map((place, idx) => <PlaceCard key={place.name + idx} place={place} idx={idx} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </Tabs>

        <SourcesList sources={searchSources} />

        <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + city + " Report"} footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category: "overview", places, summary }); }}>Send</Button>
          </div>
        }>
          <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
        </Dialog>
        <PlaceDetailDialog />
      </div>
    );
  }

  // ── Deep dive views (restaurants, photo_spots, landmarks) ──
  const categoryLabels = { restaurants: "Restaurants", photo_spots: "Photo Spots", landmarks: "Landmarks" };
  const categoryLabel = categoryLabels[category] || category;
  const categoryIcons = { restaurants: LucideReact.Utensils, photo_spots: LucideReact.Camera, landmarks: LucideReact.Landmark };
  const CatIcon = categoryIcons[category] || LucideReact.MapPin;
  const searchSources = Array.isArray(data?.searchSources) ? data.searchSources : [];

  const sortOptions = [
    { value: "default", label: "Default" },
    { value: "rating", label: "Top Rated" },
    { value: "name", label: "A-Z" },
  ];
  if (isRestaurants) {
    sortOptions.push({ value: "price_low", label: "Price: Low" });
    sortOptions.push({ value: "price_high", label: "Price: High" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" onClick={() => onAction("explore", { city })}>
            <LucideReact.ChevronLeft className="w-4 h-4" />
          </Button>
          <CatIcon className={"w-5 h-5 " + (accent === "amber" ? "text-amber-400" : accent === "purple" ? "text-purple-400" : "text-cyan-400")} />
          <div>
            <div className="text-sm font-bold text-gray-100">{categoryLabel}</div>
            <div className="text-[11px] text-gray-500">{city}</div>
          </div>
          <Badge variant="info">{places.length} found</Badge>
        </div>
        <Button variant="primary" onClick={() => setEmailOpen(true)}>
          <LucideReact.Mail className="w-3.5 h-3.5 mr-1" />Email
        </Button>
      </div>
      {summary && <div className="text-xs text-gray-400 px-1 leading-relaxed">{summary}</div>}
      <div className="flex gap-2">
        <Input placeholder={"Filter " + categoryLabel.toLowerCase() + "..."} value={filter} onChange={(val) => setFilter(val)} icon="Search" />
        {isRestaurants && (
          <Select
            options={[
              { value: "", label: "All Cuisines" },
              { value: "Italian", label: "Italian" },
              { value: "Japanese", label: "Japanese" },
              { value: "French", label: "French" },
              { value: "Mexican", label: "Mexican" },
              { value: "Indian", label: "Indian" },
              { value: "Chinese", label: "Chinese" },
              { value: "Thai", label: "Thai" },
            ]}
            placeholder="Cuisine"
            onChange={(val) => { if (val) onAction("restaurants", { city, cuisine: val }); }}
          />
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {sortOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSortBy(opt.value)}
            className={"text-[11px] px-2.5 py-1 rounded-full transition-colors " + (sortBy === opt.value ? "bg-blue-500/30 text-blue-300 font-medium" : "bg-white/5 text-gray-400 hover:bg-white/10")}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <PlaceGrid items={places} emptyMsg={"No " + categoryLabel.toLowerCase() + " found"} />
      <SourcesList sources={searchSources} />
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + categoryLabel + " Report"} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category, places, summary }); }}>Send</Button>
        </div>
      }>
        <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
      </Dialog>
      <PlaceDetailDialog />
    </div>
  );
}`;
