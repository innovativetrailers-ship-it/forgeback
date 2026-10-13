"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalModelRefusal = void 0;
exports.buildLocalTaskPayload = buildLocalTaskPayload;
exports.assertLocalPayloadClosed = assertLocalPayloadClosed;
exports.assertLocalEndpoint = assertLocalEndpoint;
exports.localRequestHeaders = localRequestHeaders;
exports.injectWorkflowSlots = injectWorkflowSlots;
exports.validateLocalResult = validateLocalResult;
exports.submitLocalTask = submitLocalTask;
const chokepoints_1 = require("../adapters/chokepoints");
const PAYLOAD_KEYS = new Set(['shotPrompt', 'seed', 'referenceImages', 'duration', 'params']);
const FORBIDDEN_PARAM = /^(system|systemprompt|script|breakdown|shots|othershots|dag|reasoning|moe|userid|email|falkey|apikey|token|authorization|secret|password|session|billing|entitlement|orchestrator)$/i;
const MAX_HTTP_URL = 8_000;
const MAX_MEDIA_BLOB = 1_500_000;
const MAX_PARAM_TEXT = 500;
const MAX_REFS = 8;
class LocalModelRefusal extends Error {
    shotError;
    constructor(message, endpoint) {
        super(message);
        this.name = 'LocalModelRefusal';
        this.shotError = {
            model: 'local',
            endpoint,
            stage: 'completion',
            rawError: message,
            timestamp: new Date().toISOString(),
        };
    }
}
exports.LocalModelRefusal = LocalModelRefusal;
function mediaUrl(value, max) {
    if (value.length > max)
        return false;
    if (value.startsWith('data:image/') || value.startsWith('data:video/'))
        return true;
    try {
        const url = new URL(value);
        if (url.username || url.password)
            return false;
        return url.protocol === 'https:' || url.protocol === 'http:';
    }
    catch {
        return false;
    }
}
/** Whitelist builder. Unknown fields are dropped, including system text and other shots. */
function buildLocalTaskPayload(input) {
    const shotPrompt = typeof input.shotPrompt === 'string'
        ? input.shotPrompt
        : typeof input.prompt === 'string' ? input.prompt : '';
    if (!shotPrompt.trim())
        throw new LocalModelRefusal('A local model needs the shot prompt only', 'local');
    const payload = { shotPrompt: shotPrompt.trim() };
    if (typeof input.seed === 'number' && Number.isFinite(input.seed))
        payload.seed = input.seed;
    if (typeof input.duration === 'number' && input.duration > 0 && input.duration <= 60)
        payload.duration = input.duration;
    if (Array.isArray(input.referenceImages)) {
        const images = input.referenceImages
            .filter((item) => typeof item === 'string' && mediaUrl(item, MAX_MEDIA_BLOB))
            .slice(0, MAX_REFS);
        if (images.length)
            payload.referenceImages = images;
    }
    if (input.params && typeof input.params === 'object' && !Array.isArray(input.params)) {
        const params = {};
        for (const [key, value] of Object.entries(input.params)) {
            if (FORBIDDEN_PARAM.test(key))
                continue;
            if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
                params[key] = value;
            else if (typeof value === 'string' && value.length <= MAX_PARAM_TEXT)
                params[key] = value;
        }
        if (Object.keys(params).length)
            payload.params = params;
    }
    return payload;
}
function assertLocalPayloadClosed(payload) {
    for (const key of Object.keys(payload)) {
        if (!PAYLOAD_KEYS.has(key))
            throw new LocalModelRefusal(`Local payload refused an extra field: ${key}`, 'local');
    }
}
/** Localhost, or an origin the user typed. No userinfo, no Forge credentials. */
function assertLocalEndpoint(endpoint, allow = []) {
    let url;
    try {
        url = new URL(endpoint);
    }
    catch {
        throw new LocalModelRefusal('Local endpoint is not a URL', endpoint);
    }
    if (url.username || url.password)
        throw new LocalModelRefusal('A local endpoint cannot carry credentials', endpoint);
    const host = url.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const listed = allow.some((item) => {
        try {
            return new URL(item).origin === url.origin;
        }
        catch {
            return false;
        }
    });
    if (!local && !listed)
        throw new LocalModelRefusal('Local models only run on localhost or an allow-listed endpoint', endpoint);
    return url;
}
function localRequestHeaders() {
    return { 'content-type': 'application/json', accept: 'application/json' };
}
/** ComfyUI workflow JSON is data. Slot text is substituted. Nothing is executed. */
function injectWorkflowSlots(workflow, shotPrompt) {
    if (typeof workflow === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(workflow);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Workflow JSON is not data';
            throw new LocalModelRefusal(message, 'local');
        }
        return injectWorkflowSlots(parsed, shotPrompt);
    }
    if (Array.isArray(workflow))
        return workflow.map((item) => injectWorkflowSlots(item, shotPrompt));
    if (!workflow || typeof workflow !== 'object')
        return workflow;
    const next = {};
    for (const [key, value] of Object.entries(workflow)) {
        next[key] = typeof value === 'string' ? value.replaceAll('{{PROMPT}}', shotPrompt) : injectWorkflowSlots(value, shotPrompt);
    }
    return next;
}
/** A return is a media URL or it is rejected. It is never treated as code. */
function validateLocalResult(value, endpoint = 'local') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new LocalModelRefusal('Local model returned a non-media payload', endpoint);
    }
    const row = value;
    if (typeof row.error === 'string' && row.error.trim()) {
        throw new LocalModelRefusal(row.error.trim().slice(0, 400), endpoint);
    }
    const media = [row.url, row.video?.url, row.image?.url].find((item) => typeof item === 'string');
    if (!media)
        throw new LocalModelRefusal('Local model returned a non-media payload', endpoint);
    const cap = media.startsWith('data:') ? MAX_MEDIA_BLOB : MAX_HTTP_URL;
    if (!mediaUrl(media, cap))
        throw new LocalModelRefusal('Local model returned a non-media payload', endpoint);
    return { mediaUrl: media };
}
/** Posts the whitelist only. Records a zero-cost local call. Does not send Forge credentials. */
async function submitLocalTask(input, fetchImpl = fetch) {
    if ((0, chokepoints_1.generationPausedFromEnv)(input.pausedEnv ?? process.env.GENERATION_PAUSED)) {
        throw new chokepoints_1.GenerationPausedError('Blocked: GENERATION_PAUSED is ON. local model');
    }
    const enabled = (input.enabledEnv ?? process.env.LOCAL_MODELS_ENABLED ?? '').trim().toLowerCase();
    if (enabled !== 'true' && enabled !== '1' && enabled !== 'on') {
        throw new LocalModelRefusal('Local models stay off until LOCAL_MODELS_ENABLED is on', input.endpoint);
    }
    const url = assertLocalEndpoint(input.endpoint, input.allow ?? []);
    const task = buildLocalTaskPayload(input.task);
    assertLocalPayloadClosed(task);
    const body = input.workflow
        ? { task, workflow: injectWorkflowSlots(input.workflow, task.shotPrompt) }
        : task;
    console.log('[local_call]', JSON.stringify({ costUsd: 0, endpoint: url.origin }));
    const res = await fetchImpl(url.toString(), {
        method: 'POST',
        headers: localRequestHeaders(),
        body: JSON.stringify(body),
    });
    let json;
    try {
        json = await res.json();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Local model returned a non-media payload';
        throw new LocalModelRefusal(message, url.origin);
    }
    if (!res.ok) {
        throw new LocalModelRefusal(`Local model returned HTTP ${res.status}`, url.origin);
    }
    return validateLocalResult(json, url.origin);
}
//# sourceMappingURL=localIsolation.js.map