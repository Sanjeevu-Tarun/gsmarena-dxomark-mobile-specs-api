export interface ISearchResult {
    name: string;
    slug: string;
    imageUrl?: string;   // HD bigpic URL
    thumbUrl?: string;   // Small thumbnail — reliable fallback if bigpic 404s
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
    category: string;
    url: string;
    thumbnailUrl?: string;
    caption?: string;
}

/** One gallery section found on a review page */
export interface IReviewGallerySection {
    section: string;
    images: ICameraSample[];
}

/** Full review page data */
export interface IReviewDetails {
    device: string;
    reviewUrl: string;
    heroImages: string[];
    articleImages: IReviewGallerySection[];
    cameraSamples: ICameraSampleCategory[];
}

/** A parsed lens detail from the article-blurb-findings list */
export interface ILensDetail {
    role: string;
    detail: string;
    sectionImageUrl?: string;
}

/** One tab from the camera samples section */
export interface ICameraSampleCategory {
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
    lensDetails: ILensDetail[];
}
  
/** One color variant from the GSMArena pictures page 3D model section */
export interface IColorVariant {
    colorName: string;
    imageUrl: string;
    isDefault: boolean;
}

/** All data scraped from the GSMArena pictures page */
export interface IPicturesPageData {
    officialImages: string[];
    colorVariants: IColorVariant[];
    picturesPageUrl: string;
}
