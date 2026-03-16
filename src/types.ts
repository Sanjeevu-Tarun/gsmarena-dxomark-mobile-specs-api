export interface ISearchResult {
    name: string;
    slug: string;
    imageUrl?: string;
    detail_url: string;
}
  
export type TSpecCategory = Record<string, string>;
  
export interface IPhoneDetails {
    brand: string;
    model: string;
    imageUrl?: string;
    device_images: IDeviceImage[];
    release_date: string;
    dimensions: string;
    os: string;
    storage: string;
    specifications: Record<string, TSpecCategory>;
    review_url?: string;
}
  
export interface IBrandDetails {
    brand_id: number;
    brand_slug: string;
    device_count: number;
    detail_url: string;
}
  
export interface IPhoneListItem {
    name: string;
    slug: string;
    imageUrl?: string;
    detail_url: string;
    rank?: number;
    hits?: number;
}

/** A single image on the device specs page (colour variants) */
export interface IDeviceImage {
    color: string;
    url: string;
}

/** One camera sample image with its category label */
export interface ICameraSample {
    /** e.g. "Main camera", "Selfie camera", "Zoom", "Night", "Video", etc. */
    category: string;
    /** Full-resolution image URL */
    url: string;
    /** Optional thumbnail URL */
    thumbnailUrl?: string;
    /** Alt / caption text if available */
    caption?: string;
}

/** One gallery section found on a review page */
export interface IReviewGallerySection {
    /** Section heading e.g. "Photo quality", "Video quality", "Daylight", "Night", "Zoom" */
    section: string;
    images: ICameraSample[];
}

/** Full review page data */
export interface IReviewDetails {
    device: string;
    reviewUrl: string;
    /** Hero / header images at the top of the review */
    heroImages: string[];
    /** All in-article images grouped by their nearest heading */
    articleImages: IReviewGallerySection[];
    /** Camera sample pages – one entry per tab/category */
    cameraSamples: ICameraSampleCategory[];
}

/** A parsed lens detail from the article-blurb-findings list */
export interface ILensDetail {
    /** e.g. "Wide (main)", "Telephoto 3.5x", "Ultrawide", "Front camera" */
    role: string;
    /** Full detail text e.g. "50MP Sony Lytia LYT-828 (1/1.28"), f/1.57, 24mm, OIS; 4K@120" */
    detail: string;
    /** First inline-image found in the same camera section, used as representative thumbnail */
    sectionImageUrl?: string;
}

/** One tab from the camera samples section */
export interface ICameraSampleCategory {
    /** e.g. "Main Camera", "Selfie", "Zoom 3x", "Night mode", "Video" */
    label: string;
    images: ICameraSample[];
}

/** Structured result returned by /review/:slug */
export interface IReviewResult {
    device: string;
    reviewSlug: string;
    reviewUrl: string;
    heroImages: string[];
    articleImages: IReviewGallerySection[];
    cameraSamples: ICameraSampleCategory[];
    /** Lens details parsed from article-blurb-findings list on the camera review page */
    lensDetails: ILensDetail[];
}
  