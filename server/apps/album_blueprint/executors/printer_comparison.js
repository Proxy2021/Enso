var selectedPrinter = (params.printer || "").trim().toLowerCase();
var pageCount = typeof params.pageCount === "number" ? params.pageCount : 40;

if (pageCount < 20) pageCount = 20;
if (pageCount > 100) pageCount = 100;

var printers = [
  {
    id: "printique",
    name: "Printique",
    formerly: "Adorama Prints",
    region: "US-based, ships worldwide",
    tier: "Professional",
    website: "printique.com",
    rating: 4.5,
    formats: [
      { name: "10×10\" Hardcover", pages: { included: 20, max: 100 }, basePrice: 49.99, extraPagePrice: 1.99, currency: "USD" },
      { name: "12×12\" Hardcover", pages: { included: 20, max: 100 }, basePrice: 69.99, extraPagePrice: 2.49, currency: "USD" },
      { name: "11×8.5\" Landscape", pages: { included: 20, max: 100 }, basePrice: 44.99, extraPagePrice: 1.79, currency: "USD" },
      { name: "8×10\" Softcover", pages: { included: 20, max: 60 }, basePrice: 29.99, extraPagePrice: 1.49, currency: "USD" }
    ],
    paperOptions: [
      { name: "Lustre", description: "Semi-gloss finish — versatile, reduces fingerprints, rich colors. Best all-around choice.", recommended: true },
      { name: "Glossy", description: "High shine, maximum color saturation. Shows fingerprints. Best for vibrant travel shots." },
      { name: "Matte", description: "No reflections, soft tones. Best for portraits and fine art. Slightly lower contrast." },
      { name: "Pearl", description: "Subtle shimmer between lustre and glossy. Premium feel." }
    ],
    bindingOptions: [
      { name: "Layflat", description: "Pages open completely flat — no gutter loss. Essential for panoramic spreads.", priceAdd: 20, recommended: true },
      { name: "Standard", description: "Traditional binding with slight gutter. More affordable." }
    ],
    coverOptions: [
      { name: "Photo Cover (Hardcover)", description: "Your image wrapped around the cover. Most impactful for gifts.", recommended: true },
      { name: "Linen Cover", description: "Fabric cover with optional photo window. Elegant and durable." },
      { name: "Leather Cover", description: "Premium leather wrap. Classic feel. Additional $25." }
    ],
    turnaround: { production: "5-7 business days", shipping: "3-5 days US / 7-14 international" },
    pros: ["Excellent US-based quality", "Layflat binding option", "Wide range of sizes", "Frequent promotions (30-50% off)"],
    cons: ["International shipping can be slow", "Higher base prices before discounts", "Website UX could be better"],
    bestFor: "First-time album creators who want professional quality with a safety net of promotions"
  },
  {
    id: "saal_digital",
    name: "Saal Digital",
    formerly: null,
    region: "EU-based (Germany), ships EU-wide + UK",
    tier: "Professional",
    website: "saal-digital.com",
    rating: 4.7,
    formats: [
      { name: "28×28cm Professional Line", pages: { included: 26, max: 200 }, basePrice: 59.95, extraPagePrice: 1.25, currency: "EUR" },
      { name: "30×21cm Landscape Pro", pages: { included: 26, max: 200 }, basePrice: 54.95, extraPagePrice: 1.15, currency: "EUR" },
      { name: "21×28cm Portrait Pro", pages: { included: 26, max: 200 }, basePrice: 54.95, extraPagePrice: 1.15, currency: "EUR" },
      { name: "30×30cm Professional Line", pages: { included: 26, max: 200 }, basePrice: 69.95, extraPagePrice: 1.45, currency: "EUR" }
    ],
    paperOptions: [
      { name: "Fuji Pearl Lustre", description: "Industry standard for professional photo books. Excellent color accuracy, subtle texture. The default choice.", recommended: true },
      { name: "Fuji Matte", description: "Smooth matte finish. Beautiful for landscapes and fine art. No reflections under any lighting." },
      { name: "Hahnemühle Fine Art", description: "Museum-grade cotton paper. Unmatched tactile quality. Premium option (+€15)." }
    ],
    bindingOptions: [
      { name: "Layflat (Professional Line)", description: "All Professional Line books are layflat by default. Seamless double-page spreads.", recommended: true },
      { name: "Standard (Economy Line)", description: "Traditional binding for budget option. Not recommended for gift albums." }
    ],
    coverOptions: [
      { name: "Photo Cover", description: "Full image wrap with protective lamination. Sharp and durable.", recommended: true },
      { name: "Acrylic Cover", description: "Photo behind glass-like acrylic. Ultra-premium look. +€25." },
      { name: "Linen Cover", description: "Elegant fabric with optional photo window. Classic." }
    ],
    turnaround: { production: "2-3 business days", shipping: "2-4 days EU / 5-8 days UK" },
    pros: ["Fastest production in the industry", "Layflat standard on Pro line", "Hahnemühle paper option", "Excellent free design software", "No DPI penalty — ICC profiles provided"],
    cons: ["Limited availability outside EU/UK", "Software is Windows/Mac only (no browser)", "Fewer cover material options than competitors"],
    bestFor: "EU-based photographers wanting the best price-to-quality ratio with professional layflat binding"
  },
  {
    id: "whitewall",
    name: "WhiteWall",
    formerly: null,
    region: "EU-based (Germany), ships worldwide",
    tier: "Ultra-Premium",
    website: "whitewall.com",
    rating: 4.8,
    formats: [
      { name: "30×30cm Coffee Table Book", pages: { included: 24, max: 200 }, basePrice: 69.90, extraPagePrice: 1.50, currency: "EUR" },
      { name: "30×21cm Landscape", pages: { included: 24, max: 200 }, basePrice: 59.90, extraPagePrice: 1.30, currency: "EUR" },
      { name: "A4 Portrait (21×30cm)", pages: { included: 24, max: 200 }, basePrice: 59.90, extraPagePrice: 1.30, currency: "EUR" },
      { name: "A3 Landscape (42×30cm)", pages: { included: 24, max: 120 }, basePrice: 119.90, extraPagePrice: 2.50, currency: "EUR" }
    ],
    paperOptions: [
      { name: "Premium Lustre", description: "WhiteWall's proprietary lustre with wider color gamut than standard. Rich without being glossy." },
      { name: "Fine Art Matte", description: "Heavyweight matte stock. Archival quality. Exceptional for B&W and landscapes.", recommended: true },
      { name: "Premium Glossy", description: "Maximum vibrancy and sharpness. For color-rich travel and nature photography." }
    ],
    bindingOptions: [
      { name: "Layflat", description: "Seamless full-spread printing. Standard on all WhiteWall books.", recommended: true }
    ],
    coverOptions: [
      { name: "Photo Hardcover", description: "Laminated photo wrap. Clean, modern look." },
      { name: "Linen Hardcover", description: "17 fabric color options. Embossing available. +€15.", recommended: true },
      { name: "Leather Hardcover", description: "Genuine leather in 6 colors. Debossing available. +€45." },
      { name: "Acrylic Glass Cover", description: "Gallery-quality acrylic. Ultimate premium statement. +€35." }
    ],
    turnaround: { production: "5-8 business days", shipping: "3-5 days EU / 7-12 days worldwide" },
    pros: ["Gallery-standard print quality", "Widest cover material selection", "All books are layflat", "Worldwide shipping", "TIPA award winner"],
    cons: ["Most expensive option", "Slower production", "Premium paper adds to cost significantly", "No bundled promotions"],
    bestFor: "The definitive gift album — when quality and presentation matter more than budget"
  }
];

var estimatePrice = function(printer, pages) {
  var estimates = [];
  for (var f = 0; f < printer.formats.length; f++) {
    var fmt = printer.formats[f];
    var extraPages = Math.max(0, pages - fmt.pages.included);
    var total = fmt.basePrice + (extraPages * fmt.extraPagePrice);
    var withLayflat = total;
    if (printer.bindingOptions) {
      for (var b = 0; b < printer.bindingOptions.length; b++) {
        if (printer.bindingOptions[b].recommended && printer.bindingOptions[b].priceAdd) {
          withLayflat = total + printer.bindingOptions[b].priceAdd;
        }
      }
    }
    estimates.push({
      format: fmt.name,
      baseTotal: Math.round(total * 100) / 100,
      withLayflat: Math.round(withLayflat * 100) / 100,
      currency: fmt.currency,
      extraPages: extraPages
    });
  }
  return estimates;
};

for (var i = 0; i < printers.length; i++) {
  printers[i].estimates = estimatePrice(printers[i], pageCount);
}

var result = {
  tool: "enso_album_blueprint_printer_comparison",
  printers: printers,
  pageCount: pageCount,
  selectedPrinter: null,
  recommendation: {
    firstAlbum: {
      printerId: "saal_digital",
      reason: "Best balance of quality, speed, and price. Professional layflat binding included. Fastest production (2-3 days). Fuji Pearl paper is the industry standard for photo books."
    },
    giftAlbum: {
      printerId: "whitewall",
      reason: "Gallery-standard quality with premium cover options (linen with embossing). The recipient will know this is special. Worth the extra cost for a meaningful gift."
    },
    budget: {
      printerId: "printique",
      reason: "Watch for their frequent 40-50% promotions. A $110 book can become $55-65. Sign up for their email list and wait for a sale."
    }
  },
  paperAdvice: {
    lustre: "The safest choice for a first album. Handles all subjects well, resists fingerprints, and looks professional under any lighting.",
    matte: "Best for contemplative/art photography, B&W, and portraits. More subdued but more 'gallery' feel. No reflections.",
    glossy: "Maximum pop for vibrant travel photos. But fingerprints are a real issue for a book that will be handled.",
    fineArt: "The prestige option. If your photos deserve museum-grade paper, this is the statement. Usually +€10-20."
  }
};

if (selectedPrinter) {
  for (var j = 0; j < printers.length; j++) {
    if (printers[j].id === selectedPrinter) {
      result.selectedPrinter = printers[j];
      break;
    }
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};
