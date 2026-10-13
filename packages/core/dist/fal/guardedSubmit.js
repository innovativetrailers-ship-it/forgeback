"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardedFalSubmit = guardedFalSubmit;
const client_1 = require("@fal-ai/client");
const chokepoints_1 = require("../adapters/chokepoints");
const runLedger_1 = require("../llm/runLedger");
/** The one FAL queue submit. Web and desktop both call this. */
async function guardedFalSubmit(input) {
    const source = (0, chokepoints_1.requireCallerSource)(input.source);
    const started = Date.now();
    if ((0, chokepoints_1.generationPausedFromEnv)(input.pausedEnv)) {
        throw new chokepoints_1.GenerationPausedError(`Blocked: GENERATION_PAUSED is ON. endpoint=${input.endpoint}`);
    }
    const key = input.falKey.trim();
    if (!key)
        throw new Error('AI gateway key is not configured.');
    client_1.fal.config({ credentials: key });
    const res = await client_1.fal.queue.submit(input.endpoint, {
        input: input.input,
        ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    });
    void source;
    const requestId = res.request_id;
    const statusUrl = res.status_url;
    const responseUrl = res.response_url;
    if (!requestId || !statusUrl || !responseUrl) {
        throw new Error(`FAL submit to ${input.endpoint} returned incomplete submission`);
    }
    (0, runLedger_1.recordPaidCall)({
        kind: (0, runLedger_1.falCallKind)(input.endpoint),
        purpose: source,
        model: input.endpoint,
        ms: Date.now() - started,
        caller: source,
    });
    return {
        requestId,
        statusUrl,
        responseUrl,
        cancelUrl: res.cancel_url ?? '',
        endpoint: input.endpoint,
    };
}
//# sourceMappingURL=guardedSubmit.js.map