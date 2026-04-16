var section = (params.section || "overview").trim();

// Printique Layflat Album Specifications
var SIZES = [
  { name: "8x8", spreads: "10-40", basePrice: 119, perExtraSpread: 5, includedSpreads: 10, description: "Compact — great for themed mini albums" },
  { name: "10x10", spreads: "10-50", basePrice: 149, perExtraSpread: 6, includedSpreads: 10, description: "Classic square — versatile for any subject" },
  { name: "12x12", spreads: "10-50", basePrice: 179, perExtraSpread: 7, includedSpreads: 10, recommended: true, description: "Large square — premium presentation, ideal for landscapes and travel" },
  { name: "11x14", spreads: "10-50", basePrice: 199, perExtraSpread: 8, includedSpreads: 10, description: "Panoramic horizontal — cinematic, great for wide shots" }
];

var PAPERS = [
  { name: "Silk", description: "Matte with a subtle sheen. Most natural look, no glare. Best for fine art and travel photography.", recommended: true, finish: "Semi-matte", fingerprints: "Minimal", colorRendition: "Warm and natural" },
  { name: "Pearl", description: "Slight texture with a soft metallic sheen. Vivid colors with depth. Great for landscape and nature.", finish: "Lustre/pearl", fingerprints: "Low", colorRendition: "Rich and vibrant" },
  { name: "Linen", description: "Textured matte finish resembling linen fabric. Artistic and tactile. Best for black & white or moody work.", finish: "Textured matte", fingerprints: "None", colorRendition: "Subtle and artistic" }
];

var COVERS = [
  { name: "Leather", colors: ["Black", "Brown", "Burgundy", "Navy", "White"], priceAddon: 0, description: "Classic and durable. Professional look and feel." },
  { name: "Linen", colors: ["Natural", "Gray", "Navy", "Black", "Blush"], priceAddon: 0, recommended: true, description: "Textured fabric. Modern, elegant. Best for gift albums." },
  { name: "Photo Cover", colors: ["N/A — custom image"], priceAddon: 20, description: "Full wrap-around photo cover. Maximum visual impact." },
  { name: "Silk", colors: ["Ivory", "Champagne", "Black"], priceAddon: 10, description: "Smooth, luxurious fabric. Understated elegance." }
];

// Resolution requirements
var RESOLUTION = {
  sonyA7RV: { sensor: "61.0 MP", maxRes: "9504 x 6336", ppi300: "31.7\" x 21.1\"", verdict: "Exceptional — covers any album size with massive headroom" },
  leicaQ3: { sensor: "60.3 MP", maxRes: "9520 x 6336", ppi300: "31.7\" x 21.1\"", verdict: "Exceptional — identical coverage to Sony A7R V" },
  minimumFor12x12: { required: "3600 x 3600 px at 300 PPI", actual: "Your cameras produce 9504 x 6336 px", headroom: "2.6x more resolution than needed — crop freely" }
};

// Lightroom export settings
var EXPORT_SETTINGS = {
  format: "JPEG (Quality 100) or TIFF (8-bit, no compression)",
  colorSpace: "sRGB (Printique standard) or Adobe RGB (if soft-proofing)",
  resolution: "300 PPI",
  resizeToFit: "Do NOT resize — export at original resolution",
  sharpening: "Sharpen for: Matte Paper, Amount: Standard",
  metadata: "Include copyright only (strip EXIF for smaller files, or include all)",
  fileNaming: "Sequential numbering matching your album order (001_opening.jpg, etc.)",
  notes: "For TIFF export, use 8-bit to keep file sizes manageable. Printique handles 16-bit but 8-bit is sufficient for prints."
};

// Recommended first-album spec
var RECOMMENDED = {
  size: "12x12",
  paper: "Silk",
  cover: "Linen",
  coverColor: "Natural or Gray",
  spreads: 25,
  pages: 50,
  binding: "Layflat (seamless spreads)",
  estimatedBasePrice: 179,
  extraSpreadsCost: 105,
  totalEstimate: 284,
  currency: "USD",
  shippingEstimate: "15-25",
  totalWithShipping: "299-309",
  productionTime: "5-10 business days",
  shippingTime: "3-7 business days depending on method",
  whyThisSpec: [
    "12x12 gives photos room to breathe — the larger format showcases detail",
    "Silk paper eliminates glare and fingerprints — best for gift albums viewed by many hands",
    "Linen cover is elegant and durable — it ages beautifully",
    "25 spreads (50 pages) is perfect for 40-50 images with varied layouts",
    "Layflat binding means images span seamlessly across two-page spreads"
  ]
};

// Cost breakdown calculator
var costBreakdown = [];
for (var i = 0; i < SIZES.length; i++) {
  var size = SIZES[i];
  var spreads25 = size.basePrice + Math.max(0, 25 - size.includedSpreads) * size.perExtraSpread;
  var spreads20 = size.basePrice + Math.max(0, 20 - size.includedSpreads) * size.perExtraSpread;
  var spreads30 = size.basePrice + Math.max(0, 30 - size.includedSpreads) * size.perExtraSpread;
  costBreakdown.push({
    size: size.name,
    base: size.basePrice,
    "20spreads": spreads20,
    "25spreads": spreads25,
    "30spreads": spreads30,
    recommended: size.recommended || false
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_pipeline_printique_guide",
      guide: {
        section: section,
        sizes: SIZES,
        papers: PAPERS,
        covers: COVERS,
        resolution: RESOLUTION,
        exportSettings: EXPORT_SETTINGS,
        recommended: RECOMMENDED,
        costBreakdown: costBreakdown,
        proTips: [
          "Sign up for Printique emails — they run 20-40% off sales several times a year",
          "Order a sample pack first ($10) to see paper quality in person",
          "Printique offers free design revisions if you're not happy with the proof",
          "Layflat binding adds ~$40 vs. regular flush mount — absolutely worth it for photo albums",
          "Consider ordering 2 copies: one to gift, one to keep"
        ]
      }
    })
  }]
};