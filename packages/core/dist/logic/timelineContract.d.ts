export interface TimelineClipContract {
    id: string;
    sourceUrl: string;
    startTime: number;
    endTime: number;
    shotPlanId?: string | null;
}
/**
 * Merge incoming clips onto a track.
 * A clip leaves only when its id or shot id is in suppressedIds (an explicit delete).
 */
export declare function mergeTimelineClips<T extends TimelineClipContract>(input: {
    clips: T[];
    incoming: T[];
    suppressedIds?: readonly string[];
}): {
    clips: T[];
    added: number;
    updated: number;
};
