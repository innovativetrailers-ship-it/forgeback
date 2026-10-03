"use strict";
/**
 * WF-03 / SPEC-A1 — roles, LWW-CRDT document merge, generation claim.
 * Hosts transport over SSE (not WebSockets). Generation/billing are
 * server-authoritative; the shared doc is the canonical recipe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAIM_STALE_MS = exports.PROJECT_ROLES = void 0;
exports.isProjectRole = isProjectRole;
exports.roleCanGenerate = roleCanGenerate;
exports.roleCanEditDoc = roleCanEditDoc;
exports.roleCanComment = roleCanComment;
exports.roleCanAssignRoles = roleCanAssignRoles;
exports.emptyCollabDocument = emptyCollabDocument;
exports.clipsById = clipsById;
exports.mergeClocked = mergeClocked;
exports.mergeRecipes = mergeRecipes;
exports.mergeCollabDocument = mergeCollabDocument;
exports.clocksFromRecipePatch = clocksFromRecipePatch;
exports.applyRecipePatch = applyRecipePatch;
exports.decideShotClaim = decideShotClaim;
exports.applyClaim = applyClaim;
exports.asCollabRecipe = asCollabRecipe;
exports.PROJECT_ROLES = [
    'owner',
    'director',
    'editor',
    'writer',
    'reviewer',
    'viewer',
];
exports.CLAIM_STALE_MS = 15 * 60 * 1000;
function isProjectRole(value) {
    return typeof value === 'string' && exports.PROJECT_ROLES.includes(value);
}
function roleCanGenerate(role) {
    return role === 'owner' || role === 'director' || role === 'editor';
}
function roleCanEditDoc(role) {
    return roleCanGenerate(role) || role === 'writer';
}
function roleCanComment(role) {
    return roleCanEditDoc(role) || role === 'reviewer';
}
function roleCanAssignRoles(role) {
    return role === 'owner';
}
function clockWins(a, b) {
    if (b.clock > a.clock)
        return 'b';
    if (a.clock > b.clock)
        return 'a';
    if (b.at > a.at)
        return 'b';
    if (a.at > b.at)
        return 'a';
    if (b.actor > a.actor)
        return 'b';
    if (a.actor > b.actor)
        return 'a';
    return 'tie';
}
function emptyClock(actor = 'server') {
    return { clock: 0, actor, at: 0 };
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function asClip(value) {
    if (!isRecord(value) || typeof value.id !== 'string')
        return null;
    return {
        id: value.id,
        trackId: typeof value.trackId === 'string' ? value.trackId : '',
        startTime: typeof value.startTime === 'number' ? value.startTime : 0,
        endTime: typeof value.endTime === 'number' ? value.endTime : 0,
        sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : undefined,
        proxyUrl: typeof value.proxyUrl === 'string' ? value.proxyUrl : undefined,
        posterUrl: typeof value.posterUrl === 'string' ? value.posterUrl : undefined,
        prompt: typeof value.prompt === 'string' ? value.prompt : undefined,
        characterId: typeof value.characterId === 'string' ? value.characterId : undefined,
        locationId: typeof value.locationId === 'string' ? value.locationId : undefined,
        modelUsed: typeof value.modelUsed === 'string' ? value.modelUsed : undefined,
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}
function preferServerMedia(winner, loser) {
    if (!loser)
        return winner;
    if (winner.sourceUrl?.trim())
        return winner;
    if (!loser.sourceUrl?.trim())
        return winner;
    return {
        ...winner,
        sourceUrl: loser.sourceUrl,
        proxyUrl: loser.proxyUrl ?? winner.proxyUrl,
        posterUrl: loser.posterUrl ?? winner.posterUrl,
        modelUsed: loser.modelUsed ?? winner.modelUsed,
    };
}
function emptyCollabDocument(projectId, recipe) {
    const next = recipe ?? {
        id: projectId,
        projectId,
        tracks: [],
    };
    const clipClocks = {};
    for (const track of next.tracks) {
        for (const clip of track.clips) {
            clipClocks[clip.id] = emptyClock();
        }
    }
    return {
        projectId,
        recipe: next,
        clipClocks,
        script: { ...emptyClock(), value: '' },
        cast: {},
        shotPlan: {},
        playbookId: { ...emptyClock(), value: null },
        docClock: 0,
    };
}
function clipsById(recipe) {
    const map = new Map();
    for (const track of recipe.tracks) {
        for (const clip of track.clips)
            map.set(clip.id, clip);
    }
    return map;
}
function mergeClocked(a, b) {
    return clockWins(a, b) === 'b' ? b : a;
}
/** Per-clip LWW. Different clips both apply; same clip last-write + warning. */
function mergeRecipes(base, incoming, baseClocks, incomingClocks) {
    const warnings = [];
    const baseClips = clipsById(base);
    const incomingClips = clipsById(incoming);
    const ids = new Set([...baseClips.keys(), ...incomingClips.keys(), ...Object.keys(baseClocks), ...Object.keys(incomingClocks)]);
    const chosen = new Map();
    const nextClocks = { ...baseClocks };
    for (const id of ids) {
        const aClock = baseClocks[id] ?? emptyClock();
        const bClock = incomingClocks[id] ?? emptyClock();
        const winnerSide = clockWins(aClock, bClock) === 'b' ? 'b' : 'a';
        const winnerClock = winnerSide === 'b' ? bClock : aClock;
        const loserClock = winnerSide === 'b' ? aClock : bClock;
        nextClocks[id] = winnerClock;
        if (winnerClock.deleted) {
            const kept = (winnerSide === 'b' ? incomingClips.get(id) : baseClips.get(id))
                ?? (winnerSide === 'b' ? baseClips.get(id) : incomingClips.get(id));
            if (kept)
                chosen.set(id, kept);
            continue;
        }
        const winnerClip = winnerSide === 'b' ? incomingClips.get(id) : baseClips.get(id);
        const loserClip = winnerSide === 'b' ? baseClips.get(id) : incomingClips.get(id);
        if (!winnerClip) {
            if (loserClip && !winnerClock.deleted)
                chosen.set(id, loserClip);
            continue;
        }
        const sameClipBoth = Boolean(baseClips.get(id)) &&
            Boolean(incomingClips.get(id)) &&
            (aClock.clock > 0 || bClock.clock > 0) &&
            aClock.actor !== bClock.actor &&
            aClock.actor !== 'server' &&
            bClock.actor !== 'server';
        if (sameClipBoth) {
            warnings.push({
                type: 'same_clip_overwrite',
                clipId: id,
                winner: winnerClock.actor,
                loser: loserClock.actor,
            });
        }
        chosen.set(id, preferServerMedia(winnerClip, loserClip));
    }
    const incomingByTrack = new Map(incoming.tracks.map((t) => [t.id, t]));
    const baseByTrack = new Map(base.tracks.map((t) => [t.id, t]));
    const trackIds = [];
    for (const t of base.tracks)
        trackIds.push(t.id);
    for (const t of incoming.tracks) {
        if (!trackIds.includes(t.id))
            trackIds.push(t.id);
    }
    const tracks = trackIds.map((trackId) => {
        const incomingTrack = incomingByTrack.get(trackId);
        const baseTrack = baseByTrack.get(trackId);
        const template = incomingTrack ?? baseTrack;
        const clips = [...chosen.values()]
            .filter((c) => c.trackId === trackId || (!c.trackId && template?.clips.some((x) => x.id === c.id)))
            .sort((a, b) => a.startTime - b.startTime);
        return {
            id: trackId,
            type: template?.type ?? 'video',
            label: template?.label,
            muted: template?.muted,
            locked: template?.locked,
            solo: template?.solo,
            volume: template?.volume,
            clips,
        };
    });
    const orphan = [...chosen.values()].filter((c) => !trackIds.includes(c.trackId));
    if (orphan.length && tracks[0]) {
        tracks[0] = { ...tracks[0], clips: [...tracks[0].clips, ...orphan].sort((a, b) => a.startTime - b.startTime) };
    }
    return {
        recipe: {
            ...base,
            ...incoming,
            id: incoming.id || base.id,
            projectId: incoming.projectId || base.projectId,
            tracks,
        },
        clipClocks: nextClocks,
        warnings,
    };
}
function mergeCollabDocument(base, incoming) {
    const merged = mergeRecipes(base.recipe, incoming.recipe, base.clipClocks, incoming.clipClocks);
    const cast = { ...base.cast };
    for (const [id, entry] of Object.entries(incoming.cast)) {
        const prev = cast[id];
        cast[id] = prev ? mergeClocked(prev, entry) : entry;
        if (cast[id].deleted)
            delete cast[id];
    }
    const shotPlan = { ...base.shotPlan };
    for (const [id, entry] of Object.entries(incoming.shotPlan)) {
        const prev = shotPlan[id];
        shotPlan[id] = prev ? mergeClocked(prev, entry) : entry;
        if (shotPlan[id].deleted)
            delete shotPlan[id];
    }
    return {
        doc: {
            projectId: incoming.projectId || base.projectId,
            recipe: merged.recipe,
            clipClocks: merged.clipClocks,
            script: mergeClocked(base.script, incoming.script),
            cast,
            shotPlan,
            playbookId: mergeClocked(base.playbookId, incoming.playbookId),
            docClock: Math.max(base.docClock, incoming.docClock),
        },
        warnings: merged.warnings,
    };
}
/** Bump clocks on clips whose JSON changed. A missing clip stays; collab does not delete it. */
function clocksFromRecipePatch(prev, incomingRecipe, actor, at) {
    const prevClips = clipsById(prev.recipe);
    const nextClips = clipsById(incomingRecipe);
    const clocks = { ...prev.clipClocks };
    const bump = (id, deleted = false) => {
        const prevClock = clocks[id]?.clock ?? 0;
        return { clock: prevClock + 1, actor, at, ...(deleted ? { deleted: true } : {}) };
    };
    for (const [id, clip] of nextClips) {
        const before = prevClips.get(id);
        if (!before || JSON.stringify(before) !== JSON.stringify(clip)) {
            clocks[id] = bump(id);
        }
    }
    return clocks;
}
function applyRecipePatch(prev, incomingRecipe, actor, at, extras) {
    const incoming = {
        ...prev,
        recipe: incomingRecipe,
        clipClocks: clocksFromRecipePatch(prev, incomingRecipe, actor, at),
        script: extras?.script ?? prev.script,
        cast: extras?.cast ?? prev.cast,
        shotPlan: extras?.shotPlan ?? prev.shotPlan,
        playbookId: extras?.playbookId ?? prev.playbookId,
        docClock: prev.docClock + 1,
    };
    return mergeCollabDocument(prev, incoming);
}
function isCompleted(state) {
    const status = state.status.toUpperCase();
    return (status === 'COMPLETED' || status === 'COMPLETE') && Boolean(state.videoUrl?.trim());
}
function isStale(ts, now, staleMs) {
    if (ts == null)
        return true;
    return now - ts > staleMs;
}
/**
 * First trigger claims. Later triggers attach to the in-flight job.
 * Completed+videoUrl never submits again (BP-02).
 */
function decideShotClaim(state, now, staleMs = exports.CLAIM_STALE_MS) {
    if (isCompleted(state)) {
        return { kind: 'skip-completed', videoUrl: state.videoUrl };
    }
    const claimedAt = state.generateClaimedAt ?? state.generatingAt;
    const inflight = Boolean(state.generateClaimJobId) &&
        !isStale(claimedAt, now, staleMs);
    if (inflight && state.generateClaimJobId) {
        return {
            kind: 'attach',
            jobId: state.generateClaimJobId,
            claimedBy: state.generateClaimedBy,
        };
    }
    if (state.falRequestId?.trim() && !state.generateClaimJobId) {
        return {
            kind: 'refuse-inflight',
            reason: `Shot ${state.clipId} has falRequestId ${state.falRequestId} but no claim job — refusing a second submit`,
        };
    }
    const generating = state.status.toUpperCase() === 'GENERATING' &&
        !isStale(state.generatingAt, now, staleMs);
    if (generating && state.generateClaimJobId) {
        return {
            kind: 'attach',
            jobId: state.generateClaimJobId,
            claimedBy: state.generateClaimedBy,
        };
    }
    return { kind: 'claim' };
}
/** Two sequential decideShotClaim calls: first claims, second attaches after applyClaim. */
function applyClaim(state, jobId, actor, at) {
    return {
        ...state,
        status: 'GENERATING',
        generateClaimJobId: jobId,
        generateClaimedBy: actor,
        generateClaimedAt: at,
        generatingAt: at,
    };
}
function asCollabRecipe(value) {
    if (!isRecord(value) || typeof value.id !== 'string')
        return null;
    const tracksIn = Array.isArray(value.tracks) ? value.tracks : [];
    const tracks = tracksIn.map((t, i) => {
        const rec = isRecord(t) ? t : {};
        const clipsRaw = Array.isArray(rec.clips) ? rec.clips : [];
        const clips = clipsRaw.map((c) => asClip(c)).filter((c) => Boolean(c));
        return {
            id: typeof rec.id === 'string' ? rec.id : `track-${i}`,
            type: typeof rec.type === 'string' ? rec.type : 'video',
            label: typeof rec.label === 'string' ? rec.label : undefined,
            muted: typeof rec.muted === 'boolean' ? rec.muted : undefined,
            locked: typeof rec.locked === 'boolean' ? rec.locked : undefined,
            solo: typeof rec.solo === 'boolean' ? rec.solo : undefined,
            volume: typeof rec.volume === 'number' ? rec.volume : undefined,
            clips,
        };
    });
    return {
        id: value.id,
        projectId: typeof value.projectId === 'string' ? value.projectId : '',
        fps: typeof value.fps === 'number' ? value.fps : undefined,
        resolution: isRecord(value.resolution)
            ? {
                width: typeof value.resolution.width === 'number' ? value.resolution.width : 1920,
                height: typeof value.resolution.height === 'number' ? value.resolution.height : 1080,
            }
            : undefined,
        durationSeconds: typeof value.durationSeconds === 'number' ? value.durationSeconds : undefined,
        colorSpace: typeof value.colorSpace === 'string' ? value.colorSpace : undefined,
        tracks,
    };
}
//# sourceMappingURL=collab.js.map