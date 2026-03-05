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
  const [activeTab, setActiveTab] = useState("places");

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

  // Rating stars helper
  const RatingStars = ({ rating }) => {
    const numRating = parseFloat(rating) || 0;
    if (numRating <= 0) return null;
    const fullStars = Math.floor(numRating);
    const hasHalf = numRating - fullStars >= 0.3;
    const stars = [];
    for (var i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<LucideReact.Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />);
      } else if (i === fullStars && hasHalf) {
        stars.push(<LucideReact.StarHalf key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />);
      } else {
        stars.push(<LucideReact.Star key={i} className="w-3 h-3 text-gray-600" />);
      }
    }
    return (
      <div className="flex items-center gap-0.5">
        {stars}
        <span className="text-[10px] text-amber-300 ml-1 font-medium">{rating}</span>
      </div>
    );
  };

  // ── Reusable components ──

  const PlaceCard = ({ place, idx }) => {
    const hasImg = place.imageUrl && !imgErrors[place.name];
    const imgReady = hasImg && imgLoaded[place.name];
    const isFav = favorites[place.name];
    return (
      <UICard key={idx} accent={accentMap[place.category] || accent}>
        {hasImg && (
          <div className={"w-full overflow-hidden rounded-t-lg -mt-3 -mx-3 relative " + (imgReady ? "h-36 mb-2" : "h-0")} style={{ width: "calc(100% + 1.5rem)" }}>
            <img src={place.imageUrl} alt={place.name} className="w-full h-full object-cover" onLoad={() => handleImgLoad(place.name)} onError={() => handleImgError(place.name)} referrerPolicy="no-referrer" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)" }} />
            <button onClick={(e) => { e.stopPropagation(); toggleFav(place.name); }} className={"absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all " + (isFav ? "bg-rose-500 shadow-lg shadow-rose-500/30" : "bg-black/40 backdrop-blur-sm hover:bg-black/60")}>
              <LucideReact.Heart className={"w-4 h-4 " + (isFav ? "text-white fill-white" : "text-white/90")} />
            </button>
            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between">
              {place.priceLevel && (
                <div className="bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{place.priceLevel}</div>
              )}
              {place.bestTime && (
                <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-gray-200 text-[9px] px-2 py-0.5 rounded-full">
                  <LucideReact.Clock className="w-2.5 h-2.5" />{place.bestTime}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-100 truncate">{place.name}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {place.category && <Badge variant="info">{place.category}</Badge>}
              {place.location && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                  <LucideReact.MapPin className="w-2.5 h-2.5" />{place.location}
                </span>
              )}
            </div>
            {place.rating && <div className="mt-1"><RatingStars rating={place.rating} /></div>}
          </div>
          {!hasImg && (
            <button onClick={() => toggleFav(place.name)} className="shrink-0 mt-0.5">
              <LucideReact.Heart className={"w-4 h-4 transition-colors " + (isFav ? "text-rose-400 fill-rose-400" : "text-gray-600 hover:text-rose-400")} />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1.5 line-clamp-3 leading-relaxed">{place.description}</div>
        {place.highlights && place.highlights.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {place.highlights.slice(0, 3).map((h, i) => (
              <span key={i} className="text-[9px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded-full">{h}</span>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 mt-2.5">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((place, idx) => <PlaceCard key={place.name + idx} place={place} idx={idx} />)}
      </div>
    );
  };

  const VideoGrid = ({ items }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="space-y-3">
        {playingVideo && (
          <UICard accent="rose">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-100 line-clamp-1 flex-1 mr-2">{playingVideo.title}</div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {items.map((vid, idx) => (
            <UICard key={idx} accent="rose">
              <div className="cursor-pointer" onClick={() => setPlayingVideo(vid)}>
                {vid.thumbnail && !imgErrors["vid_" + idx] && (
                  <div className={"w-full overflow-hidden rounded-t-lg -mt-3 -mx-3 relative " + (imgLoaded["vid_" + idx] ? "h-28 mb-2" : "h-0")} style={{ width: "calc(100% + 1.5rem)" }}>
                    <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover" onLoad={() => handleImgLoad("vid_" + idx)} onError={() => handleImgError("vid_" + idx)} referrerPolicy="no-referrer" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
                    {vid.duration && (
                      <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-medium">{vid.duration}</div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-11 h-11 rounded-full bg-red-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-red-600/30">
                        <LucideReact.Play className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-xs font-medium text-gray-100 line-clamp-2 leading-relaxed">{vid.title}</div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {vid.creator && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
                    <LucideReact.User className="w-2.5 h-2.5 shrink-0" />{vid.creator}
                  </span>
                )}
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
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {items.map((url, i) => {
              var domain = "";
              try { domain = new URL(url).hostname.replace("www.", ""); } catch(e) { domain = url; }
              return (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-blue-400 transition-colors">
                  <LucideReact.ExternalLink className="w-2.5 h-2.5 shrink-0" />{domain}
                </a>
              );
            })}
          </div>
        )
      }]} />
    );
  };

  const CityInfoBar = () => {
    if (!country && !currency && !language && !bestSeason) return null;
    const items = [
      country && { icon: LucideReact.Globe, label: country, color: "text-blue-400" },
      currency && { icon: LucideReact.Wallet, label: currency, color: "text-emerald-400" },
      language && { icon: LucideReact.MessageCircle, label: language, color: "text-violet-400" },
      bestSeason && { icon: LucideReact.Sun, label: bestSeason, color: "text-amber-400" },
    ].filter(Boolean);
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1.5">
            <item.icon className={"w-3 h-3 " + item.color} />
            <span className="text-[11px] text-gray-300 font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const TravelTips = ({ tips }) => {
    if (!tips || tips.length === 0) return null;
    const tipColors = [
      "from-amber-500/10 to-orange-500/5 border-amber-500/20",
      "from-emerald-500/10 to-teal-500/5 border-emerald-500/20",
      "from-blue-500/10 to-indigo-500/5 border-blue-500/20",
      "from-purple-500/10 to-violet-500/5 border-purple-500/20",
      "from-rose-500/10 to-pink-500/5 border-rose-500/20",
      "from-cyan-500/10 to-sky-500/5 border-cyan-500/20",
      "from-fuchsia-500/10 to-pink-500/5 border-fuchsia-500/20",
    ];
    const tipIconColors = ["text-amber-400", "text-emerald-400", "text-blue-400", "text-purple-400", "text-rose-400", "text-cyan-400", "text-fuchsia-400"];
    return (
      <div className="space-y-2">
        {tips.map((tip, i) => {
          const TipIcon = iconMap[tip.icon] || LucideReact.Info;
          return (
            <div key={i} className={"rounded-xl p-3 border bg-gradient-to-br " + tipColors[i % tipColors.length]}>
              <div className="flex gap-3 items-start">
                <div className={"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/10"}>
                  <TipIcon className={"w-4.5 h-4.5 " + tipIconColors[i % tipIconColors.length]} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gray-100">{tip.title}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{tip.text}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const StatsRow = () => {
    const restCount = sections.find((s) => s.category === "restaurants")?.places?.length || 0;
    const photoCount = sections.find((s) => s.category === "photo_spots")?.places?.length || 0;
    const landCount = sections.find((s) => s.category === "landmarks")?.places?.length || 0;
    const stats = [
      { icon: LucideReact.MapPin, count: places.length, label: "Places", color: "text-blue-400", bg: "bg-blue-500/10", onClick: null },
      { icon: LucideReact.Utensils, count: restCount, label: "Eats", color: "text-amber-400", bg: "bg-amber-500/10", onClick: () => onAction("restaurants", { city }) },
      { icon: LucideReact.Camera, count: photoCount, label: "Photos", color: "text-purple-400", bg: "bg-purple-500/10", onClick: () => onAction("photo_spots", { city }) },
      { icon: LucideReact.Landmark, count: landCount, label: "Sights", color: "text-cyan-400", bg: "bg-cyan-500/10", onClick: () => onAction("landmarks", { city }) },
    ];
    return (
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s, i) => (
          <div key={i} className={"rounded-xl p-2.5 text-center border border-white/[0.04] " + s.bg + (s.onClick ? " cursor-pointer hover:border-white/10 transition-all" : "")} onClick={s.onClick}>
            <s.icon className={"w-4.5 h-4.5 mx-auto " + s.color} />
            <div className="text-base font-bold text-gray-100 mt-1">{s.count}</div>
            <div className="text-[10px] text-gray-500 font-medium">{s.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const PlaceDetailDialog = () => {
    if (!selectedPlace) return null;
    return (
      <Dialog open={!!selectedPlace} onClose={() => setSelectedPlace(null)} title={selectedPlace.name}>
        <div className="space-y-3">
          {selectedPlace.imageUrl && !imgErrors[selectedPlace.name] && (
            <div className={"w-full overflow-hidden rounded-xl relative " + (imgLoaded[selectedPlace.name] ? "h-48" : "h-0")}>
              <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="w-full h-full object-cover" onLoad={() => handleImgLoad(selectedPlace.name)} onError={() => handleImgError(selectedPlace.name)} referrerPolicy="no-referrer" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
              {selectedPlace.priceLevel && (
                <div className="absolute top-2.5 right-2.5 bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">{selectedPlace.priceLevel}</div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedPlace.category && <Badge variant="info">{selectedPlace.category}</Badge>}
            {selectedPlace.location && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <LucideReact.MapPin className="w-3 h-3" />{selectedPlace.location}
              </span>
            )}
          </div>
          {selectedPlace.rating && <RatingStars rating={selectedPlace.rating} />}
          <div className="text-sm text-gray-200 leading-relaxed">{selectedPlace.description}</div>
          {selectedPlace.bestTime && (
            <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
              <LucideReact.Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] text-amber-400/80 font-medium uppercase tracking-wide">Best time to visit</div>
                <div className="text-xs text-gray-200 mt-0.5">{selectedPlace.bestTime}</div>
              </div>
            </div>
          )}
          {selectedPlace.highlights && selectedPlace.highlights.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Highlights</div>
              <div className="space-y-1.5">
                {selectedPlace.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <LucideReact.Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                    </div>
                    <span className="text-xs text-gray-300 leading-relaxed">{h}</span>
                  </div>
                ))}
              </div>
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
      { name: "Paris", emoji: "\u{1F1EB}\u{1F1F7}", desc: "City of Light", color: "from-blue-500/15 to-indigo-500/10" },
      { name: "Tokyo", emoji: "\u{1F1EF}\u{1F1F5}", desc: "Neon & tradition", color: "from-rose-500/15 to-pink-500/10" },
      { name: "New York", emoji: "\u{1F1FA}\u{1F1F8}", desc: "The Big Apple", color: "from-amber-500/15 to-orange-500/10" },
      { name: "Rome", emoji: "\u{1F1EE}\u{1F1F9}", desc: "Eternal City", color: "from-emerald-500/15 to-teal-500/10" },
      { name: "Barcelona", emoji: "\u{1F1EA}\u{1F1F8}", desc: "Gaudi's dream", color: "from-purple-500/15 to-violet-500/10" },
      { name: "Istanbul", emoji: "\u{1F1F9}\u{1F1F7}", desc: "East meets West", color: "from-cyan-500/15 to-sky-500/10" },
    ];
    return (
      <div className="space-y-5 py-1">
        <div className="text-center space-y-3 py-3 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-purple-500/10 border border-white/[0.04]">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <LucideReact.Globe className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-100 tracking-tight">City Explorer</div>
            <div className="text-xs text-gray-400 max-w-[280px] mx-auto mt-1 leading-relaxed">Research restaurants, photo spots, landmarks, video guides & insider travel tips</div>
          </div>
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
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <LucideReact.History className="w-3 h-3" /> Recent
              </div>
              <Button variant="ghost" onClick={() => onAction("delete_history", { city: "" })}>
                <span className="text-[10px] text-gray-500">Clear All</span>
              </Button>
            </div>
            <div className="space-y-1.5">
              {recentCities.map((rc, i) => (
                <UICard key={i} accent="blue">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => onAction("explore", { city: rc.city })}>
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 flex items-center justify-center shrink-0 border border-blue-500/10">
                        <LucideReact.MapPin className="w-4.5 h-4.5 text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-100 truncate">{rc.city}</div>
                        <div className="flex gap-2 mt-0.5 items-center">
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><LucideReact.MapPin className="w-2 h-2" />{rc.placeCount}</span>
                          {rc.videoCount > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><LucideReact.Play className="w-2 h-2" />{rc.videoCount}</span>}
                          <span className="text-[10px] text-gray-600">{timeAgo(rc.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" onClick={() => onAction("explore", { city: rc.city, force: true })}>
                        <LucideReact.RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" onClick={() => onAction("delete_history", { city: rc.city })}>
                        <LucideReact.Trash2 className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                    </div>
                  </div>
                </UICard>
              ))}
            </div>
          </div>
        )}
        {recentCities.length === 0 && (
          <div className="space-y-2.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <LucideReact.Compass className="w-3 h-3" /> Popular destinations
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {suggestions.map((s) => (
                <div key={s.name} className={"rounded-xl p-3 cursor-pointer transition-all border border-white/[0.04] hover:border-white/10 bg-gradient-to-br " + s.color} onClick={() => onAction("explore", { city: s.name })}>
                  <div className="text-base mb-0.5">{s.emoji}</div>
                  <div className="text-sm font-semibold text-gray-100">{s.name}</div>
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
        <div className={"text-center py-6 rounded-2xl border " + (data?.success ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20" : "bg-gradient-to-br from-rose-500/10 to-red-500/5 border-rose-500/20")}>
          <div className={"w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3 " + (data?.success ? "bg-emerald-500/20" : "bg-rose-500/20")}>
            {data?.success
              ? <LucideReact.CheckCircle className="w-7 h-7 text-emerald-400" />
              : <LucideReact.AlertCircle className="w-7 h-7 text-rose-400" />
            }
          </div>
          <div className="text-sm font-semibold text-gray-100">{data?.success ? "Report Sent" : "Send Failed"}</div>
          <div className="text-xs text-gray-400 mt-1">{city}</div>
        </div>
        <UICard accent={data?.success ? "emerald" : "rose"}>
          <div className="text-sm text-gray-200">{String(data?.message ?? "")}</div>
          {data?.recipient && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
              <LucideReact.Mail className="w-3 h-3" /> {String(data.recipient)}
            </div>
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
        <Button variant="primary" onClick={() => onAction("explore", { city })}>
          <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Overview
        </Button>
      </div>
    );
  }

  // ── Overview view ──
  if (isOverview) {
    const searchSources = Array.isArray(data?.searchSources) ? data.searchSources : [];
    const overviewTabs = [
      { value: "places", label: "Places", icon: "MapPin" },
      videos.length > 0 ? { value: "videos", label: "Videos", icon: "Play" } : null,
      travelTips.length > 0 ? { value: "tips", label: "Tips", icon: "Lightbulb" } : null,
    ].filter(Boolean);

    return (
      <div className="space-y-3.5">
        {/* Hero banner */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600/20 via-blue-600/15 to-purple-600/20 border border-white/[0.06] p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] text-blue-400/80 uppercase tracking-widest font-semibold mb-1">City Explorer</div>
              <div className="text-xl font-bold text-gray-50 tracking-tight">{city}</div>
              {fromHistory && (
                <div className="flex items-center gap-1 mt-1.5">
                  <LucideReact.BookOpen className="w-3 h-3 text-blue-400/70" />
                  <span className="text-[10px] text-blue-400/70">Saved research</span>
                </div>
              )}
            </div>
            <div className="flex gap-1.5">
              {fromHistory && (
                <Button variant="ghost" onClick={() => onAction("explore", { city, force: true })}>
                  <LucideReact.RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="primary" onClick={() => setEmailOpen(true)}>
                <LucideReact.Mail className="w-3.5 h-3.5 mr-1" />Email
              </Button>
            </div>
          </div>
        </div>

        <CityInfoBar />
        <StatsRow />

        {summary && (
          <div className="text-xs text-gray-400 px-0.5 leading-relaxed border-l-2 border-indigo-500/30 pl-3">{summary}</div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04]">
          {overviewTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={"flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-2 rounded-lg transition-all " +
                (activeTab === tab.value
                  ? "bg-white/10 text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]")}
            >
              {tab.label}
              {tab.value === "places" && <span className="text-[9px] opacity-60">{places.length}</span>}
              {tab.value === "videos" && <span className="text-[9px] opacity-60">{videos.length}</span>}
              {tab.value === "tips" && <span className="text-[9px] opacity-60">{travelTips.length}</span>}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "videos" && <VideoGrid items={videos} />}
        {activeTab === "tips" && <TravelTips tips={travelTips} />}
        {activeTab === "places" && (
          <div className="space-y-4">
            {sections.map((section, sIdx) => {
              const secPlaces = Array.isArray(section.places) ? section.places : [];
              const catIcons = { restaurants: LucideReact.Utensils, photo_spots: LucideReact.Camera, landmarks: LucideReact.Landmark };
              const CatIcon = catIcons[section.category] || LucideReact.MapPin;
              const catColors = { restaurants: "text-amber-400", photo_spots: "text-purple-400", landmarks: "text-cyan-400" };
              const catColor = catColors[section.category] || "text-blue-400";
              const catBgs = { restaurants: "from-amber-500/10 to-orange-500/5 border-amber-500/15", photo_spots: "from-purple-500/10 to-violet-500/5 border-purple-500/15", landmarks: "from-cyan-500/10 to-sky-500/5 border-cyan-500/15" };
              const catBg = catBgs[section.category] || "from-blue-500/10 to-indigo-500/5 border-blue-500/15";
              return (
                <div key={sIdx} className="space-y-2.5">
                  <div className={"flex items-center justify-between rounded-xl px-3 py-2 bg-gradient-to-r border " + catBg}>
                    <div className="flex items-center gap-2">
                      <CatIcon className={"w-4 h-4 " + catColor} />
                      <div className="text-sm font-semibold text-gray-200">{section.label}</div>
                      <span className="text-[10px] text-gray-500 font-medium">{secPlaces.length}</span>
                    </div>
                    <Button variant="ghost" onClick={() => {
                      const actionMap = { restaurants: "restaurants", photo_spots: "photo_spots", landmarks: "landmarks" };
                      onAction(actionMap[section.category] || "explore", { city });
                    }}>
                      <span className="text-[11px]">See All</span>
                      <LucideReact.ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {secPlaces.slice(0, 4).map((place, idx) => <PlaceCard key={place.name + idx} place={place} idx={idx} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <SourcesList sources={searchSources} />

        <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + city + " Report"} footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category: "overview", places, summary }); }}>
              <LucideReact.Send className="w-3.5 h-3.5 mr-1" /> Send
            </Button>
          </div>
        }>
          <div className="space-y-3">
            <div className="text-xs text-gray-400 leading-relaxed">Send a beautifully formatted travel guide for {city} with all places, videos, and tips.</div>
            <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
          </div>
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
  const catGradients = { restaurants: "from-amber-600/20 to-orange-600/10 border-amber-500/15", photo_spots: "from-purple-600/20 to-violet-600/10 border-purple-500/15", landmarks: "from-cyan-600/20 to-sky-600/10 border-cyan-500/15" };

  const sortOptions = [
    { value: "default", label: "Default", icon: LucideReact.LayoutGrid },
    { value: "rating", label: "Top Rated", icon: LucideReact.Star },
    { value: "name", label: "A-Z", icon: LucideReact.ArrowDownAZ },
  ];
  if (isRestaurants) {
    sortOptions.push({ value: "price_low", label: "Budget First", icon: LucideReact.ArrowDown });
    sortOptions.push({ value: "price_high", label: "Luxury First", icon: LucideReact.ArrowUp });
  }

  return (
    <div className="space-y-3.5">
      {/* Category hero header */}
      <div className={"rounded-2xl overflow-hidden bg-gradient-to-br border p-4 " + (catGradients[category] || "from-blue-600/20 to-indigo-600/10 border-blue-500/15")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => onAction("explore", { city })}>
              <LucideReact.ArrowLeft className="w-4 h-4" />
            </Button>
            <CatIcon className={"w-5 h-5 " + (accent === "amber" ? "text-amber-400" : accent === "purple" ? "text-purple-400" : "text-cyan-400")} />
            <div>
              <div className="text-base font-bold text-gray-100">{categoryLabel}</div>
              <div className="text-[11px] text-gray-400">{city} \u00B7 {places.length} found</div>
            </div>
          </div>
          <Button variant="primary" onClick={() => setEmailOpen(true)}>
            <LucideReact.Mail className="w-3.5 h-3.5 mr-1" />Email
          </Button>
        </div>
      </div>

      {summary && <div className="text-xs text-gray-400 leading-relaxed border-l-2 border-indigo-500/30 pl-3">{summary}</div>}

      <div className="flex gap-2">
        <Input placeholder={"Search " + categoryLabel.toLowerCase() + "..."} value={filter} onChange={(val) => setFilter(val)} icon="Search" />
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
              { value: "Korean", label: "Korean" },
              { value: "Mediterranean", label: "Mediterranean" },
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
            className={"flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-all border " +
              (sortBy === opt.value
                ? "bg-white/10 text-gray-200 font-medium border-white/10"
                : "bg-white/[0.02] text-gray-500 hover:bg-white/5 border-transparent")}
          >
            <opt.icon className="w-3 h-3" />{opt.label}
          </button>
        ))}
      </div>
      <PlaceGrid items={places} emptyMsg={"No " + categoryLabel.toLowerCase() + " found"} />
      <SourcesList sources={searchSources} />
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + categoryLabel + " Report"} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category, places, summary }); }}>
            <LucideReact.Send className="w-3.5 h-3.5 mr-1" /> Send
          </Button>
        </div>
      }>
        <div className="space-y-3">
          <div className="text-xs text-gray-400 leading-relaxed">Send a formatted report of {categoryLabel.toLowerCase()} in {city}.</div>
          <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
        </div>
      </Dialog>
      <PlaceDetailDialog />
    </div>
  );
}`;
