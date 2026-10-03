"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOLUTION_STATES = exports.ENTITY_KINDS = void 0;
exports.detectIngestRichness = detectIngestRichness;
exports.normalizeBreakdown = normalizeBreakdown;
exports.breakdownFromShotRows = breakdownFromShotRows;
exports.breakdownFromIdea = breakdownFromIdea;
exports.resolutionKey = resolutionKey;
exports.resolveEntity = resolveEntity;
exports.resolveFilm = resolveFilm;
exports.orderReferenceDag = orderReferenceDag;
exports.referenceDagFor = referenceDagFor;
exports.referenceDagCredits = referenceDagCredits;
exports.familyConsistency = familyConsistency;
exports.decideConsistency = decideConsistency;
exports.autoGenSelection = autoGenSelection;
exports.compileProductionPlan = compileProductionPlan;
exports.landCompiledShots = landCompiledShots;
const chainContinuity_1 = require("./chainContinuity");
const timelineContract_1 = require("./timelineContract");
const trainerRegistry_1 = require("./trainerRegistry");
exports.ENTITY_KINDS = ['character', 'location', 'asset'];
exports.RESOLUTION_STATES = ['unresolved', 'imported', 'generated', 'trained'];
const SCREENPLAY = /(^|\n)\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i;
function detectIngestRichness(text) {
    const raw = text.trim();
    if (!raw)
        return 'idea';
    if (raw.startsWith('{') || raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object')
                return 'plan';
        }
        catch {
            /* a brace that is not JSON is still prose */
        }
    }
    if (SCREENPLAY.test(raw))
        return 'screenplay';
    return 'idea';
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function textOf(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function numOf(value, fallback) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function kindOf(value) {
    const raw = textOf(value);
    return exports.ENTITY_KINDS.includes(raw) ? raw : 'asset';
}
function slug(kind, name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entity';
    return `${kind}:${base}`;
}
function refFromItem(item) {
    if (typeof item === 'string' && item.trim())
        return { entityId: item.trim() };
    const row = asRecord(item);
    if (!row)
        return null;
    const entityId = textOf(row.entityId) || textOf(row.id);
    if (!entityId)
        return null;
    const variantId = textOf(row.variantId);
    return variantId ? { entityId, variantId } : { entityId };
}
function shotFromRow(row, index, sceneId) {
    const id = textOf(row.id) || `${sceneId}-shot-${index}`;
    const refs = Array.isArray(row.entityRefs)
        ? row.entityRefs.map(refFromItem).filter((item) => Boolean(item))
        : [];
    const continuity = row.continuity === 'continuous' || row.continuity === 'cut' ? row.continuity : undefined;
    return {
        id,
        type: textOf(row.type) || textOf(row.shotSize) || undefined,
        angle: textOf(row.angle) || textOf(row.cameraAngle) || undefined,
        movement: textOf(row.movement) || textOf(row.cameraMove) || undefined,
        duration: numOf(row.duration, 5),
        description: textOf(row.description) || textOf(row.visualPrompt) || textOf(row.prompt) || 'Cinematic shot',
        entityRefs: refs,
        continuity,
    };
}
function stateOf(value) {
    const raw = textOf(value);
    return exports.RESOLUTION_STATES.includes(raw) ? raw : 'unresolved';
}
function variationFromRow(row, entityId) {
    const variantId = textOf(row.variantId) || textOf(row.id);
    if (!variantId)
        return null;
    const label = textOf(row.label) || variantId;
    return {
        variantId,
        label,
        generatedFrom: textOf(row.generatedFrom) || entityId,
        modifierPrompt: textOf(row.modifierPrompt) || label,
        generatedImage: textOf(row.generatedImage) || null,
        resolutionState: stateOf(row.resolutionState),
        appearsInShots: Array.isArray(row.appearsInShots)
            ? row.appearsInShots.filter((item) => typeof item === 'string')
            : [],
    };
}
function entityFromRow(row, index) {
    const name = textOf(row.name);
    if (!name)
        return null;
    const kind = kindOf(row.kind);
    const id = textOf(row.id) || slug(kind, name);
    const appears = Array.isArray(row.appearsInShots)
        ? row.appearsInShots.filter((item) => typeof item === 'string')
        : [];
    const variations = Array.isArray(row.variations)
        ? row.variations
            .map((item) => variationFromRow(asRecord(item) ?? {}, id))
            .filter((item) => Boolean(item))
        : [];
    return {
        id,
        kind,
        name,
        descriptor: textOf(row.descriptor) || textOf(row.description) || name,
        appearsInShots: appears,
        isPrimary: row.isPrimary === false ? false : true,
        variations,
    };
}
/** Accepts a full plan, a shot array, or a partial object. Missing fields stay optional. */
function normalizeBreakdown(input) {
    if (Array.isArray(input))
        return breakdownFromShotRows(input);
    const root = asRecord(input);
    if (!root) {
        return { scenes: [], entities: [] };
    }
    const sceneRows = Array.isArray(root.scenes) ? root.scenes : Array.isArray(root.shots) ? [{ shots: root.shots }] : [];
    const scenes = sceneRows.map((item, sceneIndex) => {
        const scene = asRecord(item) ?? {};
        const id = textOf(scene.id) || `scene-${sceneIndex + 1}`;
        const shots = (Array.isArray(scene.shots) ? scene.shots : []).map((shot, shotIndex) => {
            return shotFromRow(asRecord(shot) ?? {}, shotIndex, id);
        });
        return {
            id,
            location: textOf(scene.location) || undefined,
            timeOfDay: textOf(scene.timeOfDay) || undefined,
            description: textOf(scene.description) || undefined,
            shots,
        };
    }).filter((scene) => scene.shots.length > 0);
    const declared = (Array.isArray(root.entities) ? root.entities : [])
        .map((item, index) => entityFromRow(asRecord(item) ?? {}, index))
        .filter((item) => Boolean(item));
    return linkEntities({ scenes, entities: declared });
}
function breakdownFromShotRows(rows) {
    const scenes = [];
    rows.forEach((item, index) => {
        const row = asRecord(item) ?? {};
        const sceneNumber = numOf(row.sceneNumber, index + 1);
        const sceneId = `scene-${sceneNumber}`;
        let scene = scenes.find((candidate) => candidate.id === sceneId);
        if (!scene) {
            scene = {
                id: sceneId,
                location: textOf(row.location) || (Array.isArray(row.locationsPresent) ? textOf(row.locationsPresent[0]) : '') || undefined,
                description: textOf(row.sceneDescription) || undefined,
                shots: [],
            };
            scenes.push(scene);
        }
        const shot = shotFromRow(row, scene.shots.length, scene.id);
        const names = [
            ...nameRefs(row.charactersPresent, 'character'),
            ...nameRefs(row.locationsPresent, 'location'),
        ];
        const seen = new Set(shot.entityRefs.map((ref) => ref.entityId));
        for (const entity of names) {
            if (seen.has(entity.id))
                continue;
            seen.add(entity.id);
            shot.entityRefs.push({ entityId: entity.id });
        }
        scene.shots.push(shot);
    });
    const named = rows.flatMap((item) => {
        const row = asRecord(item) ?? {};
        return [
            ...nameRefs(row.charactersPresent, 'character'),
            ...nameRefs(row.locationsPresent, 'location'),
        ];
    });
    return linkEntities({ scenes, entities: named });
}
function nameRefs(value, kind) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        const name = typeof item === 'string' ? item.trim() : textOf(asRecord(item)?.name);
        if (!name)
            return [];
        return [{ id: slug(kind, name), kind, name, descriptor: name, appearsInShots: [] }];
    });
}
function linkEntities(breakdown) {
    const byId = new Map();
    for (const entity of breakdown.entities) {
        const prev = byId.get(entity.id);
        if (!prev)
            byId.set(entity.id, { ...entity, appearsInShots: [...entity.appearsInShots] });
        else if (!prev.descriptor && entity.descriptor)
            prev.descriptor = entity.descriptor;
    }
    for (const scene of breakdown.scenes) {
        for (const shot of scene.shots) {
            for (const ref of shot.entityRefs) {
                const entity = byId.get(ref.entityId);
                if (!entity)
                    continue;
                if (!entity.appearsInShots.includes(shot.id))
                    entity.appearsInShots.push(shot.id);
                if (!ref.variantId)
                    continue;
                const variation = entity.variations?.find((item) => item.variantId === ref.variantId);
                if (variation && !variation.appearsInShots.includes(shot.id))
                    variation.appearsInShots.push(shot.id);
            }
        }
    }
    return { scenes: breakdown.scenes, entities: [...byId.values()] };
}
/** A loose idea still yields one scene, one shot, and no required entities. */
function breakdownFromIdea(text, duration = 5) {
    const description = text.trim() || 'Untitled idea';
    return normalizeBreakdown({
        scenes: [{
                id: 'scene-1',
                description,
                shots: [{
                        id: 'scene-1-shot-0',
                        duration,
                        description,
                        entityRefs: [],
                        continuity: 'cut',
                    }],
            }],
        entities: [],
    });
}
function resolutionKey(entityId, variantId) {
    return variantId ? `${entityId}::${variantId}` : entityId;
}
function resolveEntity(entity, variantId) {
    const variation = variantId
        ? entity.variations?.find((item) => item.variantId === variantId)
        : undefined;
    const text = [
        entity.sourcePrompt || entity.descriptor || entity.name || 'Cinematic subject',
        variation?.modifierPrompt,
    ].filter(Boolean).join('. ').trim();
    const lora = entity.trainedLoRA;
    const trained = Boolean(lora?.weightsKey && lora.baseModel && lora.baseVersion && lora.baseBackupKey);
    if (trained && lora) {
        console.log('[variation_carrier]', JSON.stringify({ entityId: entity.id, variantId: variantId ?? null, carrier: 'lora' }));
        return {
            entityId: entity.id,
            variantId,
            level: 'trained',
            text,
            imageUrl: variation?.generatedImage?.trim()
                || entity.generatedImage?.trim()
                || entity.sourceRefs?.find((ref) => ref.trim())
                || undefined,
            lora,
            resolutionState: 'trained',
            carrier: 'lora',
        };
    }
    const variationImage = variation?.generatedImage?.trim();
    if (variationImage) {
        console.log('[variation_carrier]', JSON.stringify({ entityId: entity.id, variantId, carrier: 'variation' }));
        return {
            entityId: entity.id,
            variantId,
            level: 'reference',
            text,
            imageUrl: variationImage,
            resolutionState: variation?.resolutionState === 'unresolved' ? 'generated' : (variation?.resolutionState ?? 'generated'),
            carrier: 'variation',
        };
    }
    const primaryImage = entity.generatedImage?.trim() || entity.sourceRefs?.find((ref) => ref.trim());
    if (variantId && !variationImage) {
        console.warn('[variation_fallback]', JSON.stringify({
            entityId: entity.id,
            variantId,
            reason: primaryImage ? 'variation image missing; using primary' : 'parent reference missing; prompt-only',
        }));
    }
    if (primaryImage) {
        return {
            entityId: entity.id,
            variantId,
            level: 'reference',
            text,
            imageUrl: primaryImage,
            resolutionState: entity.resolutionState === 'generated' || entity.resolutionState === 'imported'
                ? entity.resolutionState
                : entity.generatedImage ? 'generated' : 'imported',
            carrier: 'primary',
        };
    }
    return {
        entityId: entity.id,
        variantId,
        level: (entity.sourcePrompt || '').trim() ? 'prompt' : 'generate-fresh',
        text,
        resolutionState: entity.resolutionState ?? 'unresolved',
        carrier: 'prompt',
    };
}
/** One resolution per (entity, variant) for the whole film. */
function resolveFilm(entities, shots = []) {
    const cache = new Map();
    const put = (entity, variantId) => {
        const key = resolutionKey(entity.id, variantId);
        if (!cache.has(key))
            cache.set(key, resolveEntity(entity, variantId));
    };
    for (const entity of entities)
        put(entity);
    for (const shot of shots) {
        for (const ref of shot.entityRefs) {
            const entity = entities.find((item) => item.id === ref.entityId);
            if (entity)
                put(entity, ref.variantId);
        }
    }
    return cache;
}
function orderReferenceDag(nodes) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
        if (node.dependsOn && !byId.has(node.dependsOn)) {
            throw new Error(`variation ${node.variantId ?? node.id} has no parent reference`);
        }
    }
    const incoming = new Map(nodes.map((node) => [node.id, node.dependsOn ? 1 : 0]));
    const children = new Map();
    for (const node of nodes) {
        if (!node.dependsOn)
            continue;
        const list = children.get(node.dependsOn) ?? [];
        list.push(node.id);
        children.set(node.dependsOn, list);
    }
    const ready = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
    const ordered = [];
    while (ready.length) {
        const id = ready.shift();
        if (!id)
            break;
        const node = byId.get(id);
        if (!node)
            continue;
        ordered.push(node);
        for (const child of children.get(id) ?? []) {
            const left = (incoming.get(child) ?? 1) - 1;
            incoming.set(child, left);
            if (left === 0)
                ready.push(child);
        }
    }
    if (ordered.length !== nodes.length)
        throw new Error('variation lineage cycle');
    return ordered;
}
function referenceDagFor(entities) {
    const nodes = [];
    for (const entity of entities) {
        nodes.push({
            id: `primary:${entity.id}`,
            kind: 'primary',
            entityId: entity.id,
            dependsOn: null,
            prompt: entity.descriptor,
        });
        for (const variation of entity.variations ?? []) {
            const fromPrimary = !variation.generatedFrom || variation.generatedFrom === entity.id;
            nodes.push({
                id: `variation:${entity.id}:${variation.variantId}`,
                kind: 'variation',
                entityId: entity.id,
                variantId: variation.variantId,
                dependsOn: fromPrimary
                    ? `primary:${entity.id}`
                    : `variation:${entity.id}:${variation.generatedFrom}`,
                prompt: variation.modifierPrompt || variation.label,
            });
        }
    }
    return orderReferenceDag(nodes);
}
function referenceDagCredits(nodes) {
    if (nodes.length === 0)
        return 0;
    const credits = nodes.length;
    if (!Number.isFinite(credits) || credits <= 0) {
        throw new Error('Cost estimate was not a finite credit number');
    }
    return credits;
}
function familyConsistency(modelId) {
    return {
        lora: (0, trainerRegistry_1.loraCapableBases)().includes(modelId),
        videoRef: chainContinuity_1.VIDEO_REFERENCE_MODELS.includes(modelId),
    };
}
function decideConsistency(input) {
    const caps = familyConsistency(input.modelId);
    let choice;
    if (input.wantsLora && input.wantsVideoRef && caps.lora && caps.videoRef) {
        choice = { useLora: true, useVideoRef: true, reason: 'both' };
    }
    else if (input.wantsLora && input.wantsVideoRef) {
        if (input.continuous && !input.entityCritical && caps.videoRef) {
            choice = { useLora: false, useVideoRef: true, reason: 'feed-forward' };
        }
        else if (input.entityCritical && caps.lora) {
            choice = { useLora: true, useVideoRef: false, reason: 'lora' };
        }
        else if (input.entityCritical && !caps.lora) {
            choice = { useLora: false, useVideoRef: false, reason: 'lora-unavailable' };
        }
        else if (caps.videoRef) {
            choice = { useLora: false, useVideoRef: true, reason: 'feed-forward' };
        }
        else {
            choice = { useLora: false, useVideoRef: false, reason: 'text' };
        }
    }
    else if (input.wantsLora && !caps.lora) {
        choice = { useLora: false, useVideoRef: false, reason: 'lora-unavailable' };
    }
    else {
        choice = {
            useLora: input.wantsLora && caps.lora,
            useVideoRef: input.wantsVideoRef && caps.videoRef,
            reason: (input.wantsLora && caps.lora) || (input.wantsVideoRef && caps.videoRef) ? 'available' : 'text',
        };
    }
    console.log('[consistency_choice]', JSON.stringify({ modelId: input.modelId, ...choice, caps }));
    return choice;
}
function autoGenSelection(entities, explicitIds) {
    if (explicitIds) {
        const wanted = new Set(explicitIds);
        return {
            selected: entities.filter((entity) => wanted.has(entity.id)),
            skipped: entities.filter((entity) => !wanted.has(entity.id)),
        };
    }
    const selected = entities
        .filter((entity) => entity.kind === 'character' || entity.kind === 'location')
        .sort((a, b) => b.appearsInShots.length - a.appearsInShots.length);
    const selectedIds = new Set(selected.map((entity) => entity.id));
    return {
        selected,
        skipped: entities.filter((entity) => !selectedIds.has(entity.id)),
    };
}
function compileProductionPlan(input) {
    const shotsInPlan = input.breakdown.scenes.flatMap((scene) => scene.shots);
    const cache = resolveFilm(input.entities, shotsInPlan);
    const modelId = input.modelId ?? 'wan-2.7';
    const shots = [];
    for (const scene of input.breakdown.scenes) {
        scene.shots.forEach((shot, index) => {
            const resolutions = shot.entityRefs
                .map((ref) => cache.get(resolutionKey(ref.entityId, ref.variantId)))
                .filter((row) => Boolean(row));
            const image = resolutions.find((row) => row.imageUrl);
            const trained = resolutions.some((row) => row.level === 'trained');
            const descriptors = resolutions.map((row) => row.text).filter(Boolean);
            const continuity = shot.continuity ?? (index === 0 ? 'cut' : 'continuous');
            const decision = decideConsistency({
                modelId,
                wantsLora: trained,
                wantsVideoRef: continuity === 'continuous' && index > 0,
                continuous: continuity === 'continuous' && index > 0,
                entityCritical: trained,
            });
            const keepImage = Boolean(image) && decision.reason !== 'feed-forward';
            shots.push({
                id: shot.id,
                sceneId: scene.id,
                description: shot.description,
                duration: shot.duration,
                continuity,
                entityIds: shot.entityRefs.map((ref) => ref.entityId),
                mode: keepImage ? 'reference' : 'text',
                prompt: [shot.description, ...descriptors].filter(Boolean).join('. '),
                imageUrl: keepImage ? image?.imageUrl : undefined,
                useLora: decision.useLora,
                useVideoRef: decision.useVideoRef,
                consistencyReason: decision.reason,
                modelId,
            });
        });
    }
    return { shots, resolutions: [...cache.values()] };
}
function landCompiledShots(input) {
    return (0, timelineContract_1.mergeTimelineClips)({
        clips: input.existing,
        incoming: input.incoming,
        suppressedIds: input.suppressedIds,
    });
}
//# sourceMappingURL=productionWorkflow.js.map