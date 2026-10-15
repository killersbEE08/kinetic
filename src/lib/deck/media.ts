// Built-in photo library. All photos are CC0 or public domain (Wikimedia Commons), so no
// attribution is required; sources are recorded here and in public/media/CREDITS.md anyway.
// Each photo is served at two sizes: `${src}-640.jpg` and `${src}-1920.jpg`.

export interface MediaItem {
  id: string;
  src: string; // base path, no size suffix
  alt: string;
  focal: [number, number];
  source: string;
  license: "CC0" | "Public domain";
}

export const MEDIA: MediaItem[] = [
  { id: "boats", src: "/media/boats", alt: "Fishing boats at sea off the Indian coast", focal: [0.5, 0.55], source: "Rameswaram Fishing Harbour, Tamil Nadu, India (2007)", license: "Public domain" },
  { id: "sardines", src: "/media/sardines", alt: "Baskets of fresh sardines stacked on a fishing trawler", focal: [0.35, 0.1], source: "'Baskets of Sardines' stacked in a fishing trawler in Rameswaram Port", license: "CC0" },
  { id: "solar-field", src: "/media/solar-field", alt: "Solar panels on a long low roof in green countryside", focal: [0.5, 0.6], source: "Solar Energy Roof Solar Power Generation 2666770", license: "CC0" },
  { id: "solar-roof", src: "/media/solar-roof", alt: "Solar panels on a pitched tile roof", focal: [0.55, 0.45], source: "Solar panels on a roof", license: "Public domain" },
  { id: "leaf", src: "/media/leaf", alt: "Bright green leaf with sunlight shining through its veins", focal: [0.5, 0.5], source: "Translucent leaf in macro (Unsplash)", license: "CC0" },
  { id: "leaf-drops", src: "/media/leaf-drops", alt: "Water drops on a dark green leaf", focal: [0.5, 0.5], source: "Dew on a dark green leaf (Unsplash)", license: "CC0" },
  { id: "corridor", src: "/media/corridor", alt: "A long, bright hospital corridor", focal: [0.5, 0.5], source: "Hospital corridor, Wikimedia Commons", license: "CC0" },
  { id: "corridor-2", src: "/media/corridor-2", alt: "A clean hospital corridor with a red handrail", focal: [0.5, 0.5], source: "Hospital corridor, Wikimedia Commons", license: "CC0" },
  { id: "restaurant", src: "/media/restaurant", alt: "A restaurant dining room with warm pendant lights", focal: [0.5, 0.45], source: "Restaurant in Place D'Youville, Quebec City", license: "CC0" },
  { id: "ev-charging", src: "/media/ev-charging", alt: "An electric vehicle plugged into a charging cable", focal: [0.45, 0.5], source: "Electric charging of Tokyo Gas car 2", license: "CC0" },
  { id: "warehouse", src: "/media/warehouse", alt: "Warehouse racks stacked with boxed goods", focal: [0.5, 0.5], source: "Warehouse goods", license: "CC0" },
  { id: "shelves", src: "/media/shelves", alt: "Neatly stacked boxes on shop shelves", focal: [0.5, 0.5], source: "Crackers, Trader Joe's grocery store", license: "CC0" },
  { id: "aisle", src: "/media/aisle", alt: "A grocery aisle with shelves of eggs", focal: [0.5, 0.5], source: "GroceryStoreEggs2", license: "CC0" },
  { id: "desk", src: "/media/desk", alt: "A laptop on a wooden desk beside a white chair", focal: [0.6, 0.45], source: "Desktop after work (Unsplash)", license: "CC0" },
  { id: "desk-2", src: "/media/desk-2", alt: "A quiet desk with a laptop and notebook in soft light", focal: [0.5, 0.5], source: "Desktop with laptop and calculator (Unsplash)", license: "CC0" },
];

export type MediaId = (typeof MEDIA)[number]["id"];

/**
 * A photo source is either a built-in library photo ("/media/boats") or one the user uploaded
 * ("asset:<id>"). Uploaded files are only ever fetched through our own API with the user's
 * session, so a deck can never point at an outside URL.
 */
export const MEDIA_SRC_RX = /^(?:\/media\/[a-z0-9-]{2,40}|asset:[a-z0-9_-]{8,32})$/;

export const ASSET_PREFIX = "asset:";

export function isAssetSrc(src: string): boolean {
  return src.startsWith(ASSET_PREFIX);
}

export function assetIdOf(src: string): string | null {
  return isAssetSrc(src) ? src.slice(ASSET_PREFIX.length) : null;
}

export function getMedia(id: string): MediaItem | undefined {
  return MEDIA.find((m) => m.id === id);
}

/** Library photo URL at a given width (640 or 1920). Not valid for uploads. */
export function libraryUrl(src: string, size: 640 | 1920): string {
  return `${src}-${size}.jpg`;
}
