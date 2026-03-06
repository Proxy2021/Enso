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
  const [lightboxImg, setLightboxImg] = useState(null);
  const [lightboxList, setLightboxList] = useState([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [galleryIdx, setGalleryIdx] = useState({});
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroError, setHeroError] = useState(false);

  const city = String(data?.city ?? "");
  const category = String(data?.category ?? "overview");
  const places = Array.isArray(data?.places) ? data.places : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  const summary = String(data?.summary ?? "");
  const recentCities = Array.isArray(data?.recentCities) ? data.recentCities : [];
  const travelTips = Array.isArray(data?.travelTips) ? data.travelTips : [];
  const cityHistory = data?.cityHistory || null;
  const country = data?.country || "";
  const currency = data?.currency || "";
  const language = data?.language || "";
  const bestSeason = data?.bestSeason || "";
  const population = data?.population || "";
  const famousNickname = data?.famousNickname || "";
  const fromHistory = !!data?.fromHistory;
  const heroImageUrl = data?.heroImageUrl || "";
  const heroImageUrls = Array.isArray(data?.heroImageUrls) ? data.heroImageUrls : [];
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

  // Lightbox controls
  const openLightbox = (images, startIdx) => {
    setLightboxList(images.filter(Boolean));
    setLightboxIdx(startIdx || 0);
    setLightboxImg(images[startIdx || 0]);
  };
  const closeLightbox = () => { setLightboxImg(null); setLightboxList([]); };
  const lightboxNext = () => {
    if (lightboxList.length === 0) return;
    const next = (lightboxIdx + 1) % lightboxList.length;
    setLightboxIdx(next);
    setLightboxImg(lightboxList[next]);
  };
  const lightboxPrev = () => {
    if (lightboxList.length === 0) return;
    const prev = (lightboxIdx - 1 + lightboxList.length) % lightboxList.length;
    setLightboxIdx(prev);
    setLightboxImg(lightboxList[prev]);
  };

  // Gallery carousel for place cards
  const getPlaceImages = (place) => {
    const imgs = [];
    if (place.imageUrl) imgs.push(place.imageUrl);
    if (place.galleryImages) imgs.push(...place.galleryImages);
    return imgs.filter(Boolean);
  };
  const nextGalleryImg = (name, total) => setGalleryIdx((prev) => ({ ...prev, [name]: ((prev[name] || 0) + 1) % total }));
  const prevGalleryImg = (name, total) => setGalleryIdx((prev) => ({ ...prev, [name]: ((prev[name] || 0) - 1 + total) % total }));

  // Auto-refresh welcome data on mount to load recent cities from disk
  useEffect(() => {
    if (isWelcome && recentCities.length === 0) {
      onAction("explore", { city: "" });
    }
  }, []);

  // Collect all images for the photo gallery tab
  const allGalleryImages = useMemo(() => {
    const imgs = [];
    for (const place of places) {
      const placeImgs = getPlaceImages(place);
      for (const img of placeImgs) {
        imgs.push({ url: img, placeName: place.name, category: place.category });
      }
    }
    return imgs;
  }, [places]);

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

  const Lightbox = () => {
    if (!lightboxImg) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }} onClick={closeLightbox}>
        <button onClick={(e) => { e.stopPropagation(); closeLightbox(); }} className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <LucideReact.X className="w-5 h-5 text-white" />
        </button>
        {lightboxList.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); lightboxPrev(); }} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <LucideReact.ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); lightboxNext(); }} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <LucideReact.ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}
        <div className="max-w-[90vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
          <img src={lightboxImg} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
          {lightboxList.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              {lightboxList.map((_, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); setLightboxImg(lightboxList[i]); }}
                  className={"w-2 h-2 rounded-full transition-all " + (i === lightboxIdx ? "bg-white scale-125" : "bg-white/40 hover:bg-white/60")} />
              ))}
            </div>
          )}
        </div>
        {lightboxList.length > 1 && (
          <div className="absolute bottom-3 right-3 text-white/60 text-xs font-medium">{lightboxIdx + 1} / {lightboxList.length}</div>
        )}
      </div>
    );
  };

  const PlaceCard = ({ place, idx }) => {
    const placeImgs = getPlaceImages(place);
    const hasImg = placeImgs.length > 0 && !imgErrors[place.name];
    const currentGalleryIdx = galleryIdx[place.name] || 0;
    const currentImg = placeImgs[currentGalleryIdx] || placeImgs[0];
    const imgReady = hasImg && imgLoaded[place.name];
    const isFav = favorites[place.name];
    const hasMultipleImgs = placeImgs.length > 1;
    return (
      <UICard key={idx} accent={accentMap[place.category] || accent}>
        {hasImg && (
          <div className={"w-full overflow-hidden rounded-t-lg -mt-3 -mx-3 relative group/img " + (imgReady ? "h-44 mb-2" : "h-0")} style={{ width: "calc(100% + 1.5rem)" }}>
            <img src={currentImg} alt={place.name} className="w-full h-full object-cover cursor-pointer transition-transform duration-500 group-hover/img:scale-105" onClick={() => openLightbox(placeImgs, currentGalleryIdx)} onLoad={() => handleImgLoad(place.name)} onError={() => handleImgError(place.name)} referrerPolicy="no-referrer" />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 40%, transparent 60%)" }} />
            {/* Gallery navigation arrows */}
            {hasMultipleImgs && (
              <>
                <button onClick={(e) => { e.stopPropagation(); prevGalleryImg(place.name, placeImgs.length); }} className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                  <LucideReact.ChevronLeft className="w-3.5 h-3.5 text-white" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); nextGalleryImg(place.name, placeImgs.length); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                  <LucideReact.ChevronRight className="w-3.5 h-3.5 text-white" />
                </button>
                <div className="absolute top-2 left-2 flex gap-1">
                  {placeImgs.map((_, i) => (
                    <div key={i} className={"w-1.5 h-1.5 rounded-full transition-all " + (i === currentGalleryIdx ? "bg-white" : "bg-white/40")} />
                  ))}
                </div>
              </>
            )}
            {/* Expand icon */}
            <button onClick={(e) => { e.stopPropagation(); openLightbox(placeImgs, currentGalleryIdx); }} className="absolute top-2 left-auto right-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors">
              <LucideReact.Maximize2 className="w-3 h-3 text-white/80" />
            </button>
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
              {hasMultipleImgs && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                  <LucideReact.Images className="w-2.5 h-2.5" />{placeImgs.length}
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
        <div className="text-xs text-gray-400 mt-1.5 line-clamp-3 leading-[1.6]">{place.description}</div>
        {place.highlights && place.highlights.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {place.highlights.slice(0, 3).map((h, i) => (
              <span key={i} className="text-[9px] bg-white/[0.06] text-gray-400 px-2 py-0.5 rounded-full border border-white/[0.04] font-medium">{h}</span>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 mt-2.5">
          <Button variant="ghost" onClick={() => setSelectedPlace(place)}>
            <LucideReact.Info className="w-3 h-3 mr-1" />Details
          </Button>
          {place.mapUrl && (
            <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-white/5 transition-colors">
              <LucideReact.MapPin className="w-3 h-3" /> Map
            </a>
          )}
          {place.streetViewUrl && (
            <a href={place.streetViewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 px-2 py-1 rounded hover:bg-white/5 transition-colors">
              <LucideReact.Eye className="w-3 h-3" /> Street View
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
    const featuredVideo = playingVideo || items[0];
    const remainingVideos = playingVideo ? items : items.slice(1);

    return (
      <div className="space-y-3">
        {/* Featured / playing video — large cinema-style embed */}
        <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/20">
          {playingVideo && toYouTubeEmbedUrl(playingVideo.url) ? (
            <div className="w-full" style={{ aspectRatio: "16/9" }}>
              <iframe
                src={toYouTubeEmbedUrl(playingVideo.url)}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ border: "none" }}
              />
            </div>
          ) : (
            <div className="relative cursor-pointer" onClick={() => setPlayingVideo(featuredVideo)}>
              {featuredVideo.thumbnail && (
                <div className="w-full" style={{ aspectRatio: "16/9" }}>
                  <img src={featuredVideo.thumbnail} alt={featuredVideo.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 40%, transparent 60%)" }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 backdrop-blur-sm flex items-center justify-center shadow-2xl shadow-red-600/40 hover:scale-110 transition-all duration-300 border border-red-400/30">
                      <LucideReact.Play className="w-7 h-7 text-white ml-1 drop-shadow-lg" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="p-3.5 bg-gray-900/60">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-100 line-clamp-2 leading-snug">{featuredVideo.title}</div>
                {featuredVideo.description && <div className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{featuredVideo.description}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {featuredVideo.creator && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <LucideReact.User className="w-3 h-3 shrink-0" />{featuredVideo.creator}
                    </span>
                  )}
                  {featuredVideo.duration && <Badge variant="default">{featuredVideo.duration}</Badge>}
                  {featuredVideo.age && <span className="text-[10px] text-gray-500">{featuredVideo.age}</span>}
                </div>
              </div>
              {playingVideo && (
                <Button variant="ghost" onClick={() => setPlayingVideo(null)}>
                  <LucideReact.X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Remaining videos — horizontal scrollable strip + grid */}
        {remainingVideos.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <LucideReact.Play className="w-3 h-3" /> More Videos
              <span className="text-gray-600">({remainingVideos.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {remainingVideos.map((vid, idx) => (
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
                          <div className="w-10 h-10 rounded-full bg-red-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-red-600/30">
                            <LucideReact.Play className="w-4 h-4 text-white ml-0.5" />
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
        )}
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
    if (!country && !currency && !language && !bestSeason && !population) return null;
    const items = [
      country && { icon: LucideReact.Globe, label: country, color: "text-blue-400" },
      population && { icon: LucideReact.Users, label: population, color: "text-teal-400" },
      currency && { icon: LucideReact.Wallet, label: currency, color: "text-emerald-400" },
      language && { icon: LucideReact.MessageCircle, label: language, color: "text-violet-400" },
      bestSeason && { icon: LucideReact.Sun, label: bestSeason, color: "text-amber-400" },
    ].filter(Boolean);
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1.5 hover:bg-white/[0.06] transition-colors">
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
    const tipIconBgs = ["bg-amber-500/15", "bg-emerald-500/15", "bg-blue-500/15", "bg-purple-500/15", "bg-rose-500/15", "bg-cyan-500/15", "bg-fuchsia-500/15"];
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mb-1">
          <LucideReact.Lightbulb className="w-3 h-3" /> Insider Tips
          <span className="text-gray-600">({tips.length})</span>
        </div>
        {tips.map((tip, i) => {
          const TipIcon = iconMap[tip.icon] || LucideReact.Info;
          return (
            <div key={i} className={"rounded-xl p-3.5 border bg-gradient-to-br " + tipColors[i % tipColors.length]}>
              <div className="flex gap-3 items-start">
                <div className={"w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " + tipIconBgs[i % tipIconBgs.length]}>
                  <TipIcon className={"w-5 h-5 " + tipIconColors[i % tipIconColors.length]} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-gray-100">{tip.title}</div>
                  <div className="text-[11px] text-gray-400 mt-1 leading-[1.6]">{tip.text}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── City History — Rich Multimedia Timeline ──
  const CityHistorySection = () => {
    if (!cityHistory) return <EmptyState icon="BookOpen" title="No history available" description="History data not available for this city" />;
    const eraColors = {
      Ancient: { bg: "from-amber-900/25 to-amber-800/10", border: "border-amber-600/25", dot: "bg-amber-400", text: "text-amber-400", glow: "shadow-amber-500/30" },
      Medieval: { bg: "from-red-900/25 to-red-800/10", border: "border-red-600/25", dot: "bg-red-400", text: "text-red-400", glow: "shadow-red-500/30" },
      Renaissance: { bg: "from-emerald-900/25 to-emerald-800/10", border: "border-emerald-600/25", dot: "bg-emerald-400", text: "text-emerald-400", glow: "shadow-emerald-500/30" },
      Colonial: { bg: "from-orange-900/25 to-orange-800/10", border: "border-orange-600/25", dot: "bg-orange-400", text: "text-orange-400", glow: "shadow-orange-500/30" },
      Modern: { bg: "from-blue-900/25 to-blue-800/10", border: "border-blue-600/25", dot: "bg-blue-400", text: "text-blue-400", glow: "shadow-blue-500/30" },
      Contemporary: { bg: "from-violet-900/25 to-violet-800/10", border: "border-violet-600/25", dot: "bg-violet-400", text: "text-violet-400", glow: "shadow-violet-500/30" },
    };
    const timeline = Array.isArray(cityHistory.timeline) ? cityHistory.timeline : [];
    const famousFor = Array.isArray(cityHistory.famousFor) ? cityHistory.famousFor : [];
    return (
      <div className="space-y-5">
        {/* Founding story — cinematic card with background icon watermark */}
        {cityHistory.founding && (
          <div className="rounded-2xl overflow-hidden border border-amber-500/20 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-600/5" />
            <div className="absolute top-2 right-2 w-28 h-28 opacity-[0.04]">
              <LucideReact.Scroll className="w-full h-full text-amber-300" />
            </div>
            <div className="relative p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 flex items-center justify-center shadow-lg shadow-amber-500/10 border border-amber-500/20">
                  <LucideReact.Scroll className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-100 tracking-tight">Origin Story</div>
                  <div className="text-[10px] text-amber-400/50 uppercase tracking-[0.15em] font-semibold">How it all began</div>
                </div>
              </div>
              <div className="text-[13px] text-gray-200/90 leading-[1.75]">{cityHistory.founding}</div>
            </div>
          </div>
        )}

        {/* Rich narrative — editorial longform style */}
        {cityHistory.narrative && (
          <div className="rounded-2xl border border-indigo-500/15 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-blue-950/20 to-slate-950/30" />
            <div className="absolute bottom-2 left-2 w-32 h-32 opacity-[0.03]">
              <LucideReact.BookOpen className="w-full h-full text-indigo-300" />
            </div>
            <div className="relative p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-blue-500/20 flex items-center justify-center shadow-lg shadow-indigo-500/10 border border-indigo-500/20">
                  <LucideReact.BookOpen className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <div className="text-sm font-bold text-indigo-100 tracking-tight">Through the Ages</div>
                  <div className="text-[10px] text-indigo-400/50 uppercase tracking-[0.15em] font-semibold">The story of {city}</div>
                </div>
              </div>
              <div className="text-[13px] text-gray-300/90 leading-[1.8]">{cityHistory.narrative}</div>
            </div>
          </div>
        )}

        {/* Famous for — gradient glass pills */}
        {famousFor.length > 0 && (
          <div className="space-y-2.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
              <LucideReact.Award className="w-3 h-3" /> Historically Famous For
            </div>
            <div className="flex flex-wrap gap-2">
              {famousFor.map((item, i) => {
                const tagColors = [
                  "bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-200 border-amber-500/25",
                  "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-200 border-emerald-500/25",
                  "bg-gradient-to-r from-blue-500/15 to-blue-500/5 text-blue-200 border-blue-500/25",
                  "bg-gradient-to-r from-purple-500/15 to-purple-500/5 text-purple-200 border-purple-500/25",
                  "bg-gradient-to-r from-rose-500/15 to-rose-500/5 text-rose-200 border-rose-500/25",
                ];
                return (
                  <span key={i} className={"text-xs px-3.5 py-1.5 rounded-full border font-medium " + tagColors[i % tagColors.length]}>{item}</span>
                );
              })}
            </div>
          </div>
        )}

        {/* Cultural identity — warm soul card */}
        {cityHistory.culturalIdentity && (
          <div className="rounded-2xl border border-rose-500/15 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-950/30 via-pink-950/20 to-fuchsia-950/20" />
            <div className="absolute top-2 right-2 w-24 h-24 opacity-[0.04]">
              <LucideReact.Heart className="w-full h-full text-rose-300" />
            </div>
            <div className="relative p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/30 to-pink-500/20 flex items-center justify-center shadow-lg shadow-rose-500/10 border border-rose-500/20">
                  <LucideReact.Palette className="w-5 h-5 text-rose-300" />
                </div>
                <div>
                  <div className="text-sm font-bold text-rose-100 tracking-tight">Cultural Soul</div>
                  <div className="text-[10px] text-rose-400/50 uppercase tracking-[0.15em] font-semibold">What makes it unique</div>
                </div>
              </div>
              <div className="text-[13px] text-gray-200/90 leading-[1.75]">{cityHistory.culturalIdentity}</div>
            </div>
          </div>
        )}

        {/* Timeline — vertical with glowing dots and era-colored segments */}
        {timeline.length > 0 && (
          <div className="space-y-2.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
              <LucideReact.Clock className="w-3 h-3" /> Historical Timeline
              <span className="text-gray-600 normal-case tracking-normal font-normal">({timeline.length} pivotal moments)</span>
            </div>
            <div className="relative">
              {/* Vertical timeline line with rainbow gradient */}
              <div className="absolute left-[17px] top-4 bottom-4 w-[2px] rounded-full" style={{ background: "linear-gradient(to bottom, #f59e0b, #ef4444, #10b981, #f97316, #3b82f6, #8b5cf6)" }} />
              <div className="space-y-1.5">
                {timeline.map((event, i) => {
                  const colors = eraColors[event.era] || eraColors.Modern;
                  return (
                    <div key={i} className="relative pl-11 py-3 rounded-xl transition-all hover:bg-white/[0.02]">
                      {/* Timeline dot with glow */}
                      <div className={"absolute left-[11px] top-[20px] w-[14px] h-[14px] rounded-full border-[3px] border-gray-950/90 " + colors.dot + " shadow-md " + colors.glow} />
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={"text-xs font-bold tracking-wide " + colors.text}>{event.year}</span>
                        <span className={"text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] " + colors.text}>{event.era}</span>
                      </div>
                      <div className="text-[13px] font-semibold text-gray-100 leading-tight">{event.title}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{event.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
          <div key={i} className={"rounded-xl p-2.5 text-center border border-white/[0.05] relative overflow-hidden group " + s.bg + (s.onClick ? " cursor-pointer hover:border-white/10 hover:scale-[1.02] transition-all duration-200" : "")} onClick={s.onClick}>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-white/[0.03] to-transparent" />
            <s.icon className={"w-4.5 h-4.5 mx-auto relative " + s.color} />
            <div className="text-lg font-extrabold text-gray-100 mt-1 relative">{s.count}</div>
            <div className="text-[10px] text-gray-500 font-medium relative">{s.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const PlaceDetailDialog = () => {
    if (!selectedPlace) return null;
    const detailImgs = getPlaceImages(selectedPlace);
    const detailGalleryIdx = galleryIdx["detail_" + selectedPlace.name] || 0;
    const detailCurrentImg = detailImgs[detailGalleryIdx] || detailImgs[0];
    const hasDetailImgs = detailImgs.length > 0 && !imgErrors[selectedPlace.name];
    const hasMultiDetail = detailImgs.length > 1;
    const mapEmbedUrl = selectedPlace.mapUrl ? selectedPlace.mapUrl.replace("/maps/search/", "/maps/embed/v1/place?key=&q=").replace("https://www.google.com/maps/embed/v1/place?key=&q=", "") : "";

    return (
      <Dialog open={!!selectedPlace} onClose={() => setSelectedPlace(null)} title={selectedPlace.name}>
        <div className="space-y-3">
          {/* Image gallery carousel */}
          {hasDetailImgs && (
            <div className="w-full overflow-hidden rounded-xl relative h-52">
              <img src={detailCurrentImg} alt={selectedPlace.name} className="w-full h-full object-cover cursor-pointer" onClick={() => openLightbox(detailImgs, detailGalleryIdx)} onLoad={() => handleImgLoad(selectedPlace.name)} onError={() => handleImgError(selectedPlace.name)} referrerPolicy="no-referrer" />
              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)" }} />
              {selectedPlace.priceLevel && (
                <div className="absolute top-2.5 right-2.5 bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">{selectedPlace.priceLevel}</div>
              )}
              {/* Gallery navigation */}
              {hasMultiDetail && (
                <>
                  <button onClick={() => prevGalleryImg("detail_" + selectedPlace.name, detailImgs.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                    <LucideReact.ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => nextGalleryImg("detail_" + selectedPlace.name, detailImgs.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                    <LucideReact.ChevronRight className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1">
                    {detailImgs.map((_, i) => (
                      <button key={i} onClick={() => setGalleryIdx((prev) => ({ ...prev, ["detail_" + selectedPlace.name]: i }))}
                        className={"w-2 h-2 rounded-full transition-all " + (i === detailGalleryIdx ? "bg-white" : "bg-white/40")} />
                    ))}
                  </div>
                </>
              )}
              {/* Fullscreen button */}
              <button onClick={() => openLightbox(detailImgs, detailGalleryIdx)} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                <LucideReact.Maximize2 className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}
          {/* Image thumbnails strip */}
          {hasMultiDetail && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {detailImgs.map((img, i) => (
                <button key={i} onClick={() => setGalleryIdx((prev) => ({ ...prev, ["detail_" + selectedPlace.name]: i }))}
                  className={"w-14 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-all " + (i === detailGalleryIdx ? "border-blue-400 ring-1 ring-blue-400/30" : "border-transparent opacity-60 hover:opacity-100")}>
                  <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
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
          {/* Inline map preview */}
          {selectedPlace.mapUrl && (
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <a href={selectedPlace.mapUrl} target="_blank" rel="noopener noreferrer" className="block relative group">
                <div className="h-32 bg-gradient-to-br from-blue-900/30 to-indigo-900/30 flex items-center justify-center">
                  <div className="text-center">
                    <LucideReact.Map className="w-8 h-8 text-blue-400/60 mx-auto mb-1.5" />
                    <div className="text-[11px] text-blue-400/80 font-medium">View on Google Maps</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{selectedPlace.location || selectedPlace.name}</div>
                  </div>
                </div>
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <LucideReact.ExternalLink className="w-5 h-5 text-blue-400" />
                </div>
              </a>
            </div>
          )}
          <div className="flex gap-2 pt-1 flex-wrap">
            {selectedPlace.mapUrl && (
              <a href={selectedPlace.mapUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[120px]">
                <Button variant="primary">
                  <LucideReact.MapPin className="w-3.5 h-3.5 mr-1.5" /> Maps
                </Button>
              </a>
            )}
            {selectedPlace.streetViewUrl && (
              <a href={selectedPlace.streetViewUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[120px]">
                <Button variant="outline">
                  <LucideReact.Eye className="w-3.5 h-3.5 mr-1.5" /> Street View
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
      { name: "Paris", emoji: "\u{1F1EB}\u{1F1F7}", desc: "City of Light", sub: "Art, cuisine & romance", color: "from-blue-500/15 to-indigo-500/10", border: "border-blue-500/10" },
      { name: "Tokyo", emoji: "\u{1F1EF}\u{1F1F5}", desc: "Neon & tradition", sub: "Ancient temples meet tech", color: "from-rose-500/15 to-pink-500/10", border: "border-rose-500/10" },
      { name: "New York", emoji: "\u{1F1FA}\u{1F1F8}", desc: "The Big Apple", sub: "Where dreams take shape", color: "from-amber-500/15 to-orange-500/10", border: "border-amber-500/10" },
      { name: "Rome", emoji: "\u{1F1EE}\u{1F1F9}", desc: "Eternal City", sub: "2,700 years of history", color: "from-emerald-500/15 to-teal-500/10", border: "border-emerald-500/10" },
      { name: "Barcelona", emoji: "\u{1F1EA}\u{1F1F8}", desc: "Gaudi's dream", sub: "Mediterranean masterpiece", color: "from-purple-500/15 to-violet-500/10", border: "border-purple-500/10" },
      { name: "Istanbul", emoji: "\u{1F1F9}\u{1F1F7}", desc: "East meets West", sub: "Crossroads of civilizations", color: "from-cyan-500/15 to-sky-500/10", border: "border-cyan-500/10" },
    ];
    return (
      <div className="space-y-5 py-1">
        <div className="text-center space-y-3 py-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-purple-500/10 border border-white/[0.04] relative overflow-hidden">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 20% 80%, rgba(99,102,241,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.08) 0%, transparent 40%)" }} />
          <div className="relative">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/25">
                <LucideReact.Compass className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-lg font-extrabold text-gray-100 tracking-tight">City Explorer</div>
              <div className="text-xs text-gray-400 max-w-[300px] mx-auto mt-1.5 leading-relaxed">Discover restaurants, photo spots, landmarks, city history, video guides & insider travel tips</div>
            </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {suggestions.map((s) => (
                <div key={s.name} className={"rounded-xl p-3.5 cursor-pointer transition-all border hover:border-white/15 bg-gradient-to-br hover:scale-[1.02] " + s.color + " " + s.border} onClick={() => onAction("explore", { city: s.name })}>
                  <div className="text-lg mb-1">{s.emoji}</div>
                  <div className="text-sm font-bold text-gray-100">{s.name}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 font-medium">{s.desc}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{s.sub}</div>
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
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onAction("explore", { city: "" })}>
            <LucideReact.Home className="w-3.5 h-3.5 mr-1" />Home
          </Button>
          <Button variant="primary" onClick={() => onAction("explore", { city })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Overview
          </Button>
        </div>
      </div>
    );
  }

  // ── Photo Gallery component ──
  const [galleryFilter, setGalleryFilter] = useState("all");
  const PhotoGallery = () => {
    if (allGalleryImages.length === 0) {
      return <EmptyState icon="Camera" title="No photos" description="No images available yet" />;
    }
    const categoryColors = { restaurants: "border-amber-500/30", photo_spots: "border-purple-500/30", landmarks: "border-cyan-500/30" };
    const categoryLabelsMap = { restaurants: "Restaurants", photo_spots: "Photo Spots", landmarks: "Landmarks" };
    const categoryFilterColors = { all: "bg-white/10 text-gray-100", restaurants: "bg-amber-500/15 text-amber-300 border-amber-500/20", photo_spots: "bg-purple-500/15 text-purple-300 border-purple-500/20", landmarks: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20" };
    const categories = ["all", ...new Set(allGalleryImages.map((img) => img.category).filter(Boolean))];
    const filteredImages = galleryFilter === "all" ? allGalleryImages : allGalleryImages.filter((img) => img.category === galleryFilter);
    return (
      <div className="space-y-3">
        {/* Category filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const count = cat === "all" ? allGalleryImages.length : allGalleryImages.filter((img) => img.category === cat).length;
            return (
              <button key={cat} onClick={() => setGalleryFilter(cat)}
                className={"text-[11px] px-2.5 py-1.5 rounded-lg transition-all border whitespace-nowrap font-medium " +
                  (galleryFilter === cat
                    ? (categoryFilterColors[cat] || "bg-white/10 text-gray-100") + " border-white/10"
                    : "bg-white/[0.02] text-gray-500 border-transparent hover:bg-white/5"
                  )}>
                {cat === "all" ? "All" : (categoryLabelsMap[cat] || cat)} <span className="text-[9px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-gray-500 font-medium">{filteredImages.length} photos{galleryFilter !== "all" ? " in " + (categoryLabelsMap[galleryFilter] || galleryFilter) : " from " + places.length + " places"}</div>
        <div className="columns-2 sm:columns-3 gap-2.5 space-y-2.5">
          {filteredImages.map((img, i) => (
            <div key={i} className={"break-inside-avoid rounded-xl overflow-hidden border-2 cursor-pointer group relative shadow-md shadow-black/10 hover:shadow-lg hover:shadow-black/20 transition-all duration-300 " + (categoryColors[img.category] || "border-white/[0.06]")} onClick={() => openLightbox(filteredImages.map((g) => g.url), i)}>
              <img src={img.url} alt={img.placeName} className="w-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out" onError={(e) => { e.target.parentElement.style.display = "none"; }} referrerPolicy="no-referrer" style={{ minHeight: "90px" }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <div className="text-[11px] text-white font-semibold truncate drop-shadow-lg">{img.placeName}</div>
                  <div className="text-[9px] text-white/60 mt-0.5 font-medium">{categoryLabelsMap[img.category] || img.category}</div>
                </div>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <LucideReact.Maximize2 className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Overview view ──
  if (isOverview) {
    const searchSources = Array.isArray(data?.searchSources) ? data.searchSources : [];
    const overviewTabs = [
      { value: "places", label: "Places", icon: "MapPin" },
      cityHistory ? { value: "history", label: "History", icon: "BookOpen" } : null,
      allGalleryImages.length > 0 ? { value: "gallery", label: "Gallery", icon: "Images" } : null,
      videos.length > 0 ? { value: "videos", label: "Videos", icon: "Play" } : null,
      travelTips.length > 0 ? { value: "tips", label: "Tips", icon: "Lightbulb" } : null,
    ].filter(Boolean);

    const hasHeroImg = heroImageUrl && !heroError;

    return (
      <div className="space-y-3.5">
        {/* Hero banner with city image */}
        <div className="rounded-2xl overflow-hidden relative border border-white/[0.06] shadow-xl shadow-black/20">
          {hasHeroImg && (
            <div className="absolute inset-0">
              <img src={heroImageUrl} alt={city} className={"w-full h-full object-cover transition-opacity duration-700 " + (heroLoaded ? "opacity-100" : "opacity-0")} onLoad={() => setHeroLoaded(true)} onError={() => setHeroError(true)} referrerPolicy="no-referrer" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.85) 80%, rgba(15,10,40,0.95) 100%)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(99,102,241,0.08) 0%, transparent 50%)" }} />
            </div>
          )}
          {!hasHeroImg && (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-blue-800/25 to-purple-900/30">
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(139,92,246,0.1) 0%, transparent 40%)" }} />
            </div>
          )}
          <div className="relative p-5" style={{ minHeight: hasHeroImg ? "180px" : "auto" }}>
            <div className="flex items-start justify-between">
              <div className="max-w-[65%]">
                <div className="text-[10px] text-blue-300/80 uppercase tracking-[0.2em] font-semibold mb-2 flex items-center gap-1.5">
                  <LucideReact.Compass className="w-3 h-3" />City Explorer
                </div>
                <div className={"font-extrabold tracking-tight leading-tight " + (hasHeroImg ? "text-2xl text-white drop-shadow-lg" : "text-xl text-gray-50")}>{city}</div>
                {famousNickname && <div className="text-xs text-indigo-300/80 mt-1 italic font-medium">"{famousNickname}"</div>}
                {country && !famousNickname && <div className="text-xs text-gray-300/70 mt-1 font-medium">{country}</div>}
                {fromHistory && (
                  <div className="flex items-center gap-1 mt-2 bg-white/5 rounded-full px-2 py-0.5 w-fit">
                    <LucideReact.BookOpen className="w-3 h-3 text-blue-300/70" />
                    <span className="text-[10px] text-blue-300/70 font-medium">Saved research</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button variant="ghost" onClick={() => onAction("explore", { city: "" })}>
                  <LucideReact.Home className="w-3.5 h-3.5" />
                </Button>
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
            {/* Hero image thumbnails strip */}
            {heroImageUrls.length > 1 && heroLoaded && (
              <div className="flex gap-1.5 mt-4 overflow-x-auto pb-0.5">
                {heroImageUrls.slice(0, 5).map((url, i) => (
                  <button key={i} className="w-14 h-9 rounded-lg overflow-hidden shrink-0 border border-white/20 hover:border-white/50 transition-all opacity-75 hover:opacity-100 hover:scale-105" onClick={() => openLightbox(heroImageUrls, i)}>
                    <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
                {heroImageUrls.length > 5 && (
                  <button className="w-14 h-9 rounded-lg shrink-0 bg-white/10 border border-white/20 flex items-center justify-center text-[10px] text-white/70 font-medium hover:bg-white/15 transition-all" onClick={() => openLightbox(heroImageUrls, 5)}>
                    +{heroImageUrls.length - 5}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <CityInfoBar />
        <StatsRow />

        {summary && (
          <div className="rounded-xl bg-gradient-to-r from-indigo-500/[0.07] via-blue-500/[0.03] to-transparent border border-indigo-500/10 p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 opacity-[0.03]">
              <LucideReact.Sparkles className="w-full h-full text-indigo-300" />
            </div>
            <div className="flex gap-3 items-start relative">
              <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-indigo-400 via-blue-400 to-purple-500 shrink-0" />
              <div className="text-[13px] text-gray-300 leading-[1.7]">{summary}</div>
            </div>
          </div>
        )}

        {/* Tab bar with icons */}
        <div className="flex gap-0.5 bg-white/[0.03] rounded-2xl p-1 border border-white/[0.05] shadow-inner shadow-black/10">
          {overviewTabs.map((tab) => {
            const tabIconMap = { places: LucideReact.MapPin, history: LucideReact.BookOpen, gallery: LucideReact.Images, videos: LucideReact.Play, tips: LucideReact.Lightbulb };
            const TabIcon = tabIconMap[tab.value] || LucideReact.Circle;
            const countMap = { places: places.length, history: cityHistory?.timeline?.length, gallery: allGalleryImages.length, videos: videos.length, tips: travelTips.length };
            const count = countMap[tab.value];
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={"flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-2.5 rounded-xl transition-all duration-200 " +
                  (activeTab === tab.value
                    ? "bg-gradient-to-b from-white/[0.1] to-white/[0.05] text-gray-100 shadow-sm border border-white/[0.08]"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent")}
              >
                <TabIcon className={"w-3.5 h-3.5 " + (activeTab === tab.value ? "opacity-90" : "opacity-50")} />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && <span className={"text-[9px] rounded-full px-1.5 py-0.5 " + (activeTab === tab.value ? "bg-white/10 text-gray-300" : "opacity-50")}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "history" && <CityHistorySection />}
        {activeTab === "gallery" && <PhotoGallery />}
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
                  <div className={"flex items-center justify-between rounded-xl px-3.5 py-2.5 bg-gradient-to-r border " + catBg}>
                    <div className="flex items-center gap-2.5">
                      <div className={"w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.06]"}>
                        <CatIcon className={"w-4 h-4 " + catColor} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-100">{section.label}</div>
                        <div className="text-[10px] text-gray-500 font-medium">{secPlaces.length} discovered</div>
                      </div>
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
        <Lightbox />
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
      <div className={"rounded-2xl overflow-hidden bg-gradient-to-br border p-4 shadow-lg shadow-black/10 " + (catGradients[category] || "from-blue-600/20 to-indigo-600/10 border-blue-500/15")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => onAction("explore", { city })}>
              <LucideReact.ArrowLeft className="w-4 h-4" />
            </Button>
            <div className={"w-10 h-10 rounded-xl flex items-center justify-center " + (accent === "amber" ? "bg-amber-500/15" : accent === "purple" ? "bg-purple-500/15" : "bg-cyan-500/15")}>
              <CatIcon className={"w-5 h-5 " + (accent === "amber" ? "text-amber-400" : accent === "purple" ? "text-purple-400" : "text-cyan-400")} />
            </div>
            <div>
              <div className="text-base font-extrabold text-gray-100">{categoryLabel}</div>
              <div className="text-[11px] text-gray-400">{city} \u00B7 {places.length} found</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="ghost" onClick={() => onAction("explore", { city: "" })}>
              <LucideReact.Home className="w-3.5 h-3.5" />
            </Button>
            <Button variant="primary" onClick={() => setEmailOpen(true)}>
              <LucideReact.Mail className="w-3.5 h-3.5 mr-1" />Email
            </Button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/[0.06] to-transparent border border-indigo-500/10 p-3.5">
          <div className="flex gap-3 items-start">
            <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-indigo-400 to-purple-500 shrink-0" />
            <div className="text-[13px] text-gray-300 leading-relaxed">{summary}</div>
          </div>
        </div>
      )}

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
      <Lightbox />
    </div>
  );
}`;
