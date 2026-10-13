/**
 * WF-03 / SPEC-A1 — roles, LWW-CRDT document merge, generation claim.
 * Hosts transport over SSE (not WebSockets). Generation/billing are
 * server-authoritative; the shared doc is the canonical recipe.
 */
export declare const PROJECT_ROLES: readonly ["owner", "director", "editor", "writer", "reviewer", "viewer"];
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export declare const CLAIM_STALE_MS: number;
export declare function isProjectRole(value: unknown): value is ProjectRole;
export declare function roleCanGenerate(role: ProjectRole): boolean;
export declare function roleCanEditDoc(role: ProjectRole): boolean;
export declare function roleCanComment(role: ProjectRole): boolean;
export declare function roleCanAssignRoles(role: ProjectRole): boolean;
export interface Clocked {
    clock: number;
    actor: string;
    at: number;
    deleted?: boolean;
}
export interface CollabClip {
    id: string;
    trackId: string;
    startTime: number;
    endTime: number;
    sourceUrl?: string;
    proxyUrl?: string;
    posterUrl?: string;
    prompt?: string;
    characterId?: string;
    locationId?: string;
    modelUsed?: string;
    metadata?: Record<string, unknown>;
}
export interface CollabTrack {
    id: string;
    type: string;
    label?: string;
    muted?: boolean;
    locked?: boolean;
    solo?: boolean;
    volume?: number;
    clips: CollabClip[];
}
export interface CollabRecipe {
    id: string;
    projectId: string;
    fps?: number;
    resolution?: {
        width: number;
        height: number;
    };
    durationSeconds?: number;
    colorSpace?: string;
    tracks: CollabTrack[];
}
export interface CastMember {
    id: string;
    name: string;
}
export interface ShotPlanEntry {
    id: string;
    prompt?: string;
    duration?: number;
}
export interface CollabDocument {
    projectId: string;
    recipe: CollabRecipe;
    clipClocks: Record<string, Clocked>;
    script: Clocked & {
        value: string;
    };
    cast: Record<string, Clocked & {
        value: CastMember;
    }>;
    shotPlan: Record<string, Clocked & {
        value: ShotPlanEntry;
    }>;
    playbookId: Clocked & {
        value: string | null;
    };
    docClock: number;
}
export interface MergeWarning {
    type: 'same_clip_overwrite';
    clipId: string;
    winner: string;
    loser: string;
}
export interface MergeResult {
    doc: CollabDocument;
    warnings: MergeWarning[];
}
export interface PresencePayload {
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    color?: string;
    role?: ProjectRole;
    cursor?: {
        x: number;
        y: number;
    } | null;
    selection?: {
        kind: 'clip' | 'shot' | 'script';
        id?: string;
    } | null;
    editing?: {
        kind: string;
        id: string;
    } | null;
    typing?: boolean;
    playheadTime?: number;
    selectedClipId?: string | null;
    at: number;
}
export interface ClaimState {
    clipId: string;
    status: string;
    videoUrl: string | null;
    falRequestId: string | null;
    generateClaimJobId: string | null;
    generateClaimedBy: string | null;
    generateClaimedAt: number | null;
    generatingAt: number | null;
}
export type ClaimDecision = {
    kind: 'skip-completed';
    videoUrl: string;
} | {
    kind: 'attach';
    jobId: string;
    claimedBy: string | null;
} | {
    kind: 'claim';
} | {
    kind: 'refuse-inflight';
    reason: string;
};
export declare function emptyCollabDocument(projectId: string, recipe?: CollabRecipe): CollabDocument;
export declare function clipsById(recipe: CollabRecipe): Map<string, CollabClip>;
export declare function mergeClocked<T>(a: Clocked & {
    value: T;
}, b: Clocked & {
    value: T;
}): Clocked & {
    value: T;
};
/** Per-clip LWW. Different clips both apply; same clip last-write + warning. */
export declare function mergeRecipes(base: CollabRecipe, incoming: CollabRecipe, baseClocks: Record<string, Clocked>, incomingClocks: Record<string, Clocked>): {
    recipe: CollabRecipe;
    clipClocks: Record<string, Clocked>;
    warnings: MergeWarning[];
};
export declare function mergeCollabDocument(base: CollabDocument, incoming: CollabDocument): MergeResult;
/** Bump clocks on clips whose JSON changed. A missing clip stays; collab does not delete it. */
export declare function clocksFromRecipePatch(prev: CollabDocument, incomingRecipe: CollabRecipe, actor: string, at: number): Record<string, Clocked>;
export declare function applyRecipePatch(prev: CollabDocument, incomingRecipe: CollabRecipe, actor: string, at: number, extras?: Partial<Pick<CollabDocument, 'script' | 'cast' | 'shotPlan' | 'playbookId'>>): MergeResult;
/**
 * First trigger claims. Later triggers attach to the in-flight job.
 * Completed+videoUrl never submits again (BP-02).
 */
export declare function decideShotClaim(state: ClaimState, now: number, staleMs?: number): ClaimDecision;
/** Two sequential decideShotClaim calls: first claims, second attaches after applyClaim. */
export declare function applyClaim(state: ClaimState, jobId: string, actor: string, at: number): ClaimState;
export declare function asCollabRecipe(value: unknown): CollabRecipe | null;
