"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_MODEL_ROLES = void 0;
exports.routableLocalModels = routableLocalModels;
exports.upsertLocalModel = upsertLocalModel;
exports.setLocalModelEnabled = setLocalModelEnabled;
exports.localModelForRole = localModelForRole;
exports.requireLocalModel = requireLocalModel;
exports.probeLocalModel = probeLocalModel;
exports.runLocalShot = runLocalShot;
const localIsolation_1 = require("./localIsolation");
exports.LOCAL_MODEL_ROLES = ['t2v', 'i2v', 'image', 'upscale'];
function routableLocalModels(models) {
    return models.filter((model) => model.enabled && model.status !== 'down');
}
function upsertLocalModel(models, next) {
    return [...models.filter((model) => model.id !== next.id), next];
}
function setLocalModelEnabled(models, id, enabled) {
    return models.map((model) => model.id === id ? { ...model, enabled } : model);
}
function localModelForRole(models, role) {
    return routableLocalModels(models).find((model) => model.role === role) ?? null;
}
/** A chosen local model that is down fails here. Nothing else is substituted. */
function requireLocalModel(models, id) {
    const model = models.find((item) => item.id === id);
    if (!model)
        throw new localIsolation_1.LocalModelRefusal(`Unknown local model ${id}`, 'local');
    if (!model.enabled)
        throw new localIsolation_1.LocalModelRefusal(`${model.name} is disabled`, model.endpoint);
    if (model.status === 'down') {
        throw new localIsolation_1.LocalModelRefusal(`${model.name} is down`, model.endpoint);
    }
    return model;
}
async function probeLocalModel(endpoint, fetchImpl = fetch) {
    try {
        const url = new URL(endpoint);
        const res = await fetchImpl(url.origin, { method: 'GET' });
        return res.ok ? 'reachable' : 'down';
    }
    catch {
        return 'down';
    }
}
/** Leaf submit. The meter is $0. Pause still applies. The body is the whitelist only. */
async function runLocalShot(request, fetchImpl = fetch) {
    if (!request.model.enabled || request.model.status === 'down') {
        throw new localIsolation_1.LocalModelRefusal(`${request.model.name} is not routable`, request.model.endpoint);
    }
    const task = {
        shotPrompt: request.shotPrompt,
        seed: request.seed,
        referenceImages: request.referenceImages,
        duration: request.duration,
        params: request.model.lora ? { lora: request.model.lora } : undefined,
        system: 'must not leak',
        dag: { nodes: ['plan'] },
    };
    const result = await (0, localIsolation_1.submitLocalTask)({
        endpoint: request.model.endpoint,
        allow: [request.model.endpoint],
        task,
        workflow: request.model.workflow,
        pausedEnv: request.pausedEnv,
        enabledEnv: 'true',
    }, fetchImpl);
    return { mediaUrl: result.mediaUrl, costUsd: 0, libraryTake: true };
}
//# sourceMappingURL=localModels.js.map