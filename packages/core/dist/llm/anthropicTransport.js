"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingWorkspaceError = exports.MissingApiKeyError = void 0;
exports.anthropicMessageText = anthropicMessageText;
exports.postAnthropicMessages = postAnthropicMessages;
const falRouter_1 = require("./falRouter");
class MissingApiKeyError extends Error {
    constructor() {
        super('FAL_KEY is not set — cannot reach the language router.');
        this.name = 'MissingApiKeyError';
    }
}
exports.MissingApiKeyError = MissingApiKeyError;
class MissingWorkspaceError extends Error {
    constructor() {
        super('FAL router call is missing a caller source.');
        this.name = 'MissingWorkspaceError';
    }
}
exports.MissingWorkspaceError = MissingWorkspaceError;
function anthropicMessageText(result) {
    return result.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text ?? '')
        .join('')
        .trim();
}
function blockText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content.map((block) => {
        if (!block || typeof block !== 'object')
            return '';
        const rec = block;
        return rec.type === 'text' && rec.text ? rec.text : '';
    }).filter(Boolean).join('\n');
}
function imageUrlFromBlock(block) {
    if (!block || typeof block !== 'object')
        return null;
    const rec = block;
    if (rec.type !== 'image' || !rec.source)
        return null;
    if (rec.source.type === 'url' && rec.source.url)
        return rec.source.url;
    if (rec.source.type === 'base64' && rec.source.data) {
        const media = rec.source.media_type || 'image/jpeg';
        return `data:${media};base64,${rec.source.data}`;
    }
    return null;
}
function toRouterMessages(system, messages) {
    const out = [];
    const systemText = blockText(system).trim();
    if (systemText)
        out.push({ role: 'system', content: systemText });
    for (const message of messages) {
        if (!message || typeof message !== 'object')
            continue;
        const rec = message;
        const role = rec.role === 'assistant' ? 'assistant' : 'user';
        const images = [];
        if (Array.isArray(rec.content)) {
            for (const block of rec.content) {
                const url = imageUrlFromBlock(block);
                if (url)
                    images.push(url);
            }
        }
        const text = blockText(rec.content).trim();
        if (images.length) {
            out.push({
                role,
                content: [
                    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
                    ...(text ? [{ type: 'text', text }] : []),
                ],
            });
        }
        else if (text) {
            out.push({ role, content: text });
        }
    }
    if (!out.some((message) => message.role !== 'system')) {
        throw new Error('FAL router call has no user message');
    }
    return out;
}
async function postAnthropicMessages(input) {
    const result = await (0, falRouter_1.postFalRouterChat)({
        model: input.model,
        messages: toRouterMessages(input.system, input.messages),
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        source: input.source,
        ignorePause: input.ignorePause,
        falKey: input.falKey,
        timeoutMs: input.timeoutMs,
        responseFormat: input.responseFormat,
    });
    return {
        id: '',
        type: 'message',
        role: 'assistant',
        model: result.model,
        content: [{ type: 'text', text: result.content }],
        stop_reason: 'end_turn',
        usage: {
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
        },
    };
}
//# sourceMappingURL=anthropicTransport.js.map