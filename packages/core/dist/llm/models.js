"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmModelForTier = llmModelForTier;
const routing_1 = require("./routing");
const TIER_TASK = {
    mechanical: 'mechanical',
    creative: 'script',
    hard: 'premise',
};
/** One place to retune director models. Env overrides the routing-table default. */
function llmModelForTier(tier = 'creative') {
    if (tier === 'mechanical') {
        return process.env.LLM_MECHANICAL?.trim() || (0, routing_1.llmModelForTask)('mechanical').model;
    }
    if (tier === 'hard') {
        return process.env.LLM_HARD?.trim() || (0, routing_1.llmModelForTask)('premise').model;
    }
    return process.env.LLM_CREATIVE?.trim() || (0, routing_1.llmModelForTask)(TIER_TASK.creative).model;
}
//# sourceMappingURL=models.js.map