/** Shared location-scout ranking. Web and desktop both call this. No network. */
export interface GeoHit {
    lat: number;
    lng: number;
    displayName: string;
    street?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    kind: string;
    bbox?: [number, number, number, number];
    line?: Array<[number, number]>;
}
export interface ScoutFrame {
    id: string;
    thumbUrl: string;
    fullUrl: string;
    capturedAt: string;
    lat: number;
    lng: number;
    compassAngle?: number;
    isPano: boolean;
    cameraType: string;
    width: number;
    height: number;
    licence: string;
    source: 'mapillary' | 'upload';
    filteredReason?: string;
}
export declare function rankGeoHits(hits: GeoHit[], query: string): GeoHit[];
export declare function sampleAlong(line: Array<[number, number]> | undefined, fallback: {
    lat: number;
    lng: number;
}, spacingM?: number, cap?: number): Array<{
    lat: number;
    lng: number;
}>;
export declare function scoutDropReason(cameraType: string, width: number): string | null;
export declare function rankScoutFrames(frames: ScoutFrame[]): {
    shown: ScoutFrame[];
    filtered: ScoutFrame[];
};
export declare const MAPILLARY_LICENCE = "CC BY-SA 4.0 \u2014 attribute Mapillary contributors";
export declare const GOOGLE_IMAGERY_NOTE = "Google Maps Content may not be cached or used to create new content (Maps Platform Terms, No Caching / No Creating Content From Google Maps Content). Street View is not connected and is never saved.";
export declare function scoutPlatePrompt(input: {
    name: string;
    note?: string;
    lat?: number;
    lng?: number;
    street?: string;
    height?: number;
    heading?: number;
    pitch?: number;
    fov?: number;
    time?: string;
    season?: string;
    weather?: string;
}): string;
