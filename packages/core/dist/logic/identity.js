"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cameraSentence = cameraSentence;
exports.maxPromptCharsForEndpoint = maxPromptCharsForEndpoint;
exports.capPromptText = capPromptText;
exports.composeShotPrompt = composeShotPrompt;
function cameraSentence(camera) {
    if (!camera)
        return undefined;
    const parts = [camera.shotSize, camera.angle, camera.lens, camera.movement, camera.speed]
        .map((part) => part?.trim())
        .filter((part) => Boolean(part));
    if (!parts.length)
        return undefined;
    return `Camera: ${parts.join(', ')}.`;
}
function alreadyMentions(prompt, name) {
    return prompt.toLowerCase().includes(name.trim().toLowerCase());
}
function characterClause(character) {
    const look = character.descriptor?.trim();
    const wardrobe = character.wardrobe?.trim();
    const who = look ? `${character.name} (${look})` : character.name;
    const line = wardrobe ? `${who} wearing ${wardrobe}` : who;
    return capPromptText(line, 180);
}
/** OpenAPI maxLength wins. Known families cover cached schemas that omitted it. */
function maxPromptCharsForEndpoint(endpoint, schemaMax) {
    if (typeof schemaMax === 'number' && Number.isFinite(schemaMax) && schemaMax > 0)
        return schemaMax;
    if (/kling/i.test(endpoint))
        return 2500;
    if (/wan/i.test(endpoint))
        return 5000;
    if (/grok-imagine-video/i.test(endpoint))
        return 4096;
    if (/pixverse/i.test(endpoint))
        return 2048;
    if (/happy-horse/i.test(endpoint))
        return 2500;
    if (/ltx-2\.3/i.test(endpoint))
        return 5000;
    return undefined;
}
/** Shorten on a word boundary. A single oversized token is cut at the limit. */
function capPromptText(text, max) {
    const trimmed = text.trim();
    if (!Number.isFinite(max) || max < 1 || trimmed.length <= max)
        return trimmed;
    const slice = trimmed.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= Math.floor(max * 0.6))
        return slice.slice(0, lastSpace).trim();
    return slice.trim();
}
function budgetPrompt(base, extras, max) {
    let result = base.trim();
    if (max && result.length > max)
        return capPromptText(result, max);
    for (const extra of extras) {
        const piece = extra.trim();
        if (!piece)
            continue;
        if (!result) {
            result = max ? capPromptText(piece, max) : piece;
            if (max && piece.length > max)
                break;
            continue;
        }
        const candidate = `${result} ${piece}`;
        if (!max || candidate.length <= max) {
            result = candidate;
            continue;
        }
        const room = max - result.length - 1;
        if (room >= 24) {
            const trimmed = capPromptText(piece, room);
            if (trimmed)
                result = `${result} ${trimmed}`;
        }
        break;
    }
    return result.trim();
}
/**
 * Deterministic prompt merge. No model call.
 * Base action stays first. Camera, then a short character clause, then
 * location are added only while they fit maxChars.
 */
function composeShotPrompt(prompt, characters, location, camera, maxChars, style) {
    const base = prompt.trim();
    const cameraLine = cameraSentence(camera);
    const cameraBlock = cameraLine && !alreadyMentions(base, 'Camera:') ? cameraLine : '';
    const missing = characters.filter((character) => character.name.trim() && !alreadyMentions(base, character.name));
    const characterBlock = missing.length ? `${missing.map(characterClause).join(', ')}.` : '';
    const label = location?.label?.trim();
    let locationBlock = '';
    if (label && !alreadyMentions(base, label)) {
        const detail = location?.descriptor?.trim();
        const place = detail ? `${label}: ${capPromptText(detail, 120)}` : label;
        locationBlock = `at [${place}]`;
    }
    const styleBlock = style?.trim() && !alreadyMentions(base, 'Look:') ? style.trim() : '';
    const limit = maxChars && maxChars > 0 ? maxChars : undefined;
    if (!base)
        return budgetPrompt('', [cameraBlock, characterBlock, locationBlock, styleBlock], limit);
    return budgetPrompt(base, [cameraBlock, characterBlock, locationBlock, styleBlock], limit);
}
//# sourceMappingURL=identity.js.map