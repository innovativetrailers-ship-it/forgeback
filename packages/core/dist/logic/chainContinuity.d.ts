/**
 * Chained continuity. A shot feeds the previous shot's video forward only when
 * the scene continues, the model accepts a video reference, and the shot is
 * worth the sequential wait.
 * Wan 3.0 reference-to-video (OpenAPI 200): reference_video_urls max 5, described
 * as totaling at most 15 seconds. Duration is an integer 2-30. That input has no
 * start_image_url or end_image_url. The fed clip stays 3 seconds, inside the 15s
 * cap, and output is clamped so clip + output stays within 30.
 */
export declare const CHAIN_CLIP_SECONDS = 3;
export declare const WAN30_REF_VIDEO_MAX_SECONDS = 15;
export declare const WAN30_OUTPUT_MIN = 2;
export declare const WAN30_OUTPUT_MAX = 30;
export declare const CHAIN_REGEN_LIMIT = 1;
/** Reference-to-video model for a continuous link. Wave 4 swaps this one line to open-weight Wan 2.2. */
export declare const CONTINUITY_MODEL_ID = "wan-2.7";
export declare const CONTINUITY_SCORE_MIN = 0.62;
export declare const VIDEO_REFERENCE_MODELS: readonly ["wan-2.7", "seedance-2.0", "gemini-omni", "wan-3.0"];
export type ContinuityPriority = 'low' | 'normal';
export type ChainLink = 'video' | 'still' | 'none';
export type GateMode = 'auto' | 'manual' | 'both';
export type GateDecision = 'pass' | 'regenerate' | 'await_user';
export interface ContinuityShot {
    id: string;
    sceneId: string;
    isCut?: boolean;
    continuityPriority?: ContinuityPriority;
}
export declare function isVideoReferenceCapable(modelId: string): boolean;
export declare function continuityPriorityFor(contentType: string | undefined): ContinuityPriority;
export declare function shouldChain(shot: ContinuityShot, prev: ContinuityShot | null | undefined, model: {
    videoReferenceCapable: boolean;
}): boolean;
export declare function chainLink(shot: ContinuityShot, prev: ContinuityShot | null | undefined, videoReferenceCapable: boolean): ChainLink;
export type ContinuityFlag = 'continuous' | 'cut';
/** Same place and time continues. A cut, a new scene, or a location change breaks. */
export declare function shotContinuityFlag(args: {
    hasPrev: boolean;
    sameScene: boolean;
    sameLocation: boolean;
    hardCut: boolean;
    lowPriority: boolean;
}): ContinuityFlag;
/** The routed model wins when it can take video. Otherwise the one config line, if it was selected. */
export declare function chainModelChoice(routedModel: string, selectedModels: readonly string[]): string | null;
export interface ScheduledShot {
    id: string;
    link: ChainLink;
}
export interface ContinuityChainGroup {
    shots: ScheduledShot[];
}
export declare function partitionContinuity(shots: ScheduledShot[]): {
    chains: ContinuityChainGroup[];
    independents: ScheduledShot[];
};
/** Wan 3.0 output seconds. The 3s clip counts against the 30s clip+output budget. */
export declare function wanChainOutputSeconds(shotSeconds: number | undefined, clipSeconds?: number): number;
export declare function gateChainLink(gateMode: GateMode, autoPassed: boolean | null, regenerationsUsed: number): GateDecision;
