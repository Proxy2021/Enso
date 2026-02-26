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
  const [imgErrors, setImgErrors] = useState({});
  const [cityInput, setCityInput] = useState("");

  const city = String(data?.city ?? "");
  const category = String(data?.category ?? "overview");
  const places = Array.isArray(data?.places) ? data.places : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const summary = String(data?.summary ?? "");
  const isWelcome = category === "welcome" || (!city && places.length === 0);
  const isOverview = !isWelcome && (data?.tool === "enso_city_explore" || sections.length > 0);
  const isRestaurants = data?.tool === "enso_city_restaurants" || category === "restaurants";
  const isPhotoSpots = data?.tool === "enso_city_photo_spots" || category === "photo_spots";
  const isLandmarks = data?.tool === "enso_city_landmarks" || category === "landmarks";
  const isEmail = data?.tool === "enso_city_send_email";

  const accentMap = { restaurants: "amber", photo_spots: "purple", landmarks: "cyan", overview: "blue" };
  const accent = accentMap[category] || "blue";
  const iconMap = { restaurants: "UtensilsCrossed", photo_spots: "Camera", landmarks: "Landmark" };

  const handleImgError = (name) => setImgErrors((prev) => ({ ...prev, [name]: true }));

  const PlaceCard = ({ place, idx }) => {
    const hasImg = place.imageUrl && !imgErrors[place.name];
    return (
      <UICard key={idx} accent={accentMap[place.category] || accent}>
        {hasImg && (
          <div className="w-full h-32 overflow-hidden rounded-t-lg -mt-3 -mx-3 mb-2" style={{ width: "calc(100% + 1.5rem)" }}>
            <img
              src={place.imageUrl}
              alt={place.name}
              className="w-full h-full object-cover"
              onError={() => handleImgError(place.name)}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-100 truncate">{place.name}</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {place.category && <Badge variant="info">{place.category}</Badge>}
              {place.rating && <Badge variant="success">{place.rating}</Badge>}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-1.5 line-clamp-2">{place.description}</div>
        <div className="flex gap-1.5 mt-2">
          <Button variant="ghost" onClick={() => setSelectedPlace(place)}>Details</Button>
          {place.sourceUrl && (
            <Button variant="ghost" onClick={() => {}}>
              <span className="text-[10px] opacity-60">Source</span>
            </Button>
          )}
        </div>
      </UICard>
    );
  };

  const PlaceGrid = ({ items, emptyMsg }) => {
    const filtered = filter
      ? items.filter((p) =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          (p.category || "").toLowerCase().includes(filter.toLowerCase())
        )
      : items;
    if (filtered.length === 0) {
      return <EmptyState icon="Search" title="No results" description={emptyMsg || "Try a different search"} />;
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {filtered.map((place, idx) => <PlaceCard key={place.name + idx} place={place} idx={idx} />)}
      </div>
    );
  };

  // ── Welcome / city input view ──
  if (isWelcome) {
    const handleExplore = () => {
      const c = cityInput.trim();
      if (c) onAction("explore", { city: c });
    };
    const suggestions = ["Paris", "Tokyo", "New York", "Rome", "Barcelona", "Istanbul"];
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <div className="text-lg font-semibold text-gray-100">City Planner</div>
          <div className="text-xs text-gray-400">Discover top restaurants, photo spots, and landmarks</div>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Enter a city name..."
            value={cityInput}
            onChange={(val) => setCityInput(val)}
            onKeyDown={(e) => { if (e.key === "Enter") handleExplore(); }}
            icon="Search"
          />
          <Button variant="primary" onClick={handleExplore}>Explore</Button>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">Popular cities</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <Button key={s} variant="outline" onClick={() => onAction("explore", { city: s })}>
                {s}
              </Button>
            ))}
          </div>
        </div>
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
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Stat label="City Research" value={city} accent="blue" change={places.length + " places found"} />
          <Button variant="primary" onClick={() => setEmailOpen(true)}>Email Report</Button>
        </div>
        {summary && <div className="text-xs text-gray-400 px-1">{summary}</div>}
        {sections.map((section, sIdx) => {
          const secAccent = accentMap[section.category] || "blue";
          const secPlaces = Array.isArray(section.places) ? section.places : [];
          return (
            <div key={sIdx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-200">{section.label} ({secPlaces.length})</div>
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
        <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + city + " Report"} footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category: "overview", places, summary }); }}>Send</Button>
          </div>
        }>
          <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
        </Dialog>
        <Dialog open={!!selectedPlace} onClose={() => setSelectedPlace(null)} title={selectedPlace?.name ?? ""}>
          {selectedPlace && (
            <div className="space-y-2">
              {selectedPlace.imageUrl && !imgErrors[selectedPlace.name] && (
                <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="w-full h-40 object-cover rounded-lg" onError={() => handleImgError(selectedPlace.name)} referrerPolicy="no-referrer" />
              )}
              <div className="flex gap-1 flex-wrap">
                {selectedPlace.category && <Badge variant="info">{selectedPlace.category}</Badge>}
                {selectedPlace.rating && <Badge variant="success">{selectedPlace.rating}</Badge>}
                {selectedPlace.location && <Badge variant="outline">{selectedPlace.location}</Badge>}
              </div>
              <div className="text-sm text-gray-200">{selectedPlace.description}</div>
              {selectedPlace.highlights && selectedPlace.highlights.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-400 font-medium">Highlights</div>
                  {selectedPlace.highlights.map((h, i) => (
                    <div key={i} className="text-xs text-gray-300 pl-2 border-l border-gray-600">{h}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Dialog>
      </div>
    );
  }

  // ── Deep dive views (restaurants, photo_spots, landmarks) ──
  const categoryLabels = { restaurants: "Restaurants", photo_spots: "Photo Spots", landmarks: "Landmarks" };
  const categoryLabel = categoryLabels[category] || category;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Stat label={categoryLabel} value={city} accent={accent} change={places.length + " found"} />
        <div className="flex gap-1.5">
          <Button variant="ghost" onClick={() => onAction("explore", { city })}>Overview</Button>
          <Button variant="primary" onClick={() => setEmailOpen(true)}>Email</Button>
        </div>
      </div>
      {summary && <div className="text-xs text-gray-400 px-1">{summary}</div>}
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
            ]}
            placeholder="Cuisine"
            onChange={(val) => { if (val) onAction("restaurants", { city, cuisine: val }); }}
          />
        )}
      </div>
      <PlaceGrid items={places} emptyMsg={"No " + categoryLabel.toLowerCase() + " found"} />
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email " + categoryLabel + " Report"} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEmailOpen(false); onAction("send_email", { recipient: emailAddr, city, category, places, summary }); }}>Send</Button>
        </div>
      }>
        <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
      </Dialog>
      <Dialog open={!!selectedPlace} onClose={() => setSelectedPlace(null)} title={selectedPlace?.name ?? ""}>
        {selectedPlace && (
          <div className="space-y-2">
            {selectedPlace.imageUrl && !imgErrors[selectedPlace.name] && (
              <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="w-full h-40 object-cover rounded-lg" onError={() => handleImgError(selectedPlace.name)} referrerPolicy="no-referrer" />
            )}
            <div className="flex gap-1 flex-wrap">
              {selectedPlace.category && <Badge variant="info">{selectedPlace.category}</Badge>}
              {selectedPlace.rating && <Badge variant="success">{selectedPlace.rating}</Badge>}
              {selectedPlace.location && <Badge variant="outline">{selectedPlace.location}</Badge>}
            </div>
            <div className="text-sm text-gray-200">{selectedPlace.description}</div>
            {selectedPlace.highlights && selectedPlace.highlights.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-gray-400 font-medium">Highlights</div>
                {selectedPlace.highlights.map((h, i) => (
                  <div key={i} className="text-xs text-gray-300 pl-2 border-l border-gray-600">{h}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}`;
