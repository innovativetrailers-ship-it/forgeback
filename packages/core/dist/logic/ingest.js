"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestConsentError = exports.INGEST_EMBED_SOURCE = exports.INGEST_UNDERSTAND_SOURCE = exports.INGEST_TYPES = void 0;
exports.isIngestType = isIngestType;
exports.assertIngestConsent = assertIngestConsent;
exports.detectType = detectType;
exports.sniffTextType = sniffTextType;
exports.parseFountainLocal = parseFountainLocal;
exports.chunkText = chunkText;
exports.mergePremiseLocks = mergePremiseLocks;
exports.premiseFromTreatmentText = premiseFromTreatmentText;
exports.matchEntityName = matchEntityName;
exports.measuredLookFromPalette = measuredLookFromPalette;
exports.parseUnderstandJson = parseUnderstandJson;
const premiseLock_1 = require("./premiseLock");
const importRights_1 = require("./importRights");
exports.INGEST_TYPES = [
    'script',
    'treatment',
    'character_ref',
    'location_ref',
    'rough_cut',
    'style_ref',
    'link',
    'pdf',
    'audio_sample',
    'unknown',
];
exports.INGEST_UNDERSTAND_SOURCE = 'ingest.understand';
exports.INGEST_EMBED_SOURCE = 'ingest.embed';
function isIngestType(value) {
    return exports.INGEST_TYPES.includes(value);
}
class IngestConsentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IngestConsentError';
    }
}
exports.IngestConsentError = IngestConsentError;
/** Uploaded media is the user's. Platform models are not trained on it. */
function assertIngestConsent(consent) {
    if (consent !== true) {
        throw new IngestConsentError('Confirm this upload is yours before ingesting it into the project');
    }
    if (importRights_1.PLATFORM_TRAINS_ON_USER_CONTENT) {
        throw new IngestConsentError('Platform training on user content is forbidden');
    }
}
const IMAGE_MIME = /^image\//i;
const VIDEO_MIME = /^video\//i;
const AUDIO_MIME = /^audio\//i;
const PDF_MIME = /pdf/i;
const SCENE_HEADING = /^\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)(?:\s|$)/im;
const CHARACTER_CUE = /^[A-Z][A-Z0-9 '#.-]{1,48}$/;
function detectType(input) {
    const filename = (input.filename ?? '').toLowerCase();
    const mime = (input.mime ?? '').toLowerCase();
    const url = (input.url ?? '').trim();
    const text = input.text ?? '';
    const magic = (input.magic ?? '').toLowerCase();
    if (url && !filename && !mime && !text && !looksLikeFileUrl(url))
        return 'link';
    if (magic === 'pdf' || mime.includes('pdf') || filename.endsWith('.pdf')) {
        if (SCENE_HEADING.test(text))
            return 'script';
        if (looksLikeTreatment(text, filename))
            return 'treatment';
        return 'pdf';
    }
    if (AUDIO_MIME.test(mime) || magic === 'audio' || /\.(wav|mp3|m4a|aac|ogg|flac)$/.test(filename)) {
        return 'audio_sample';
    }
    if (VIDEO_MIME.test(mime) || magic === 'video' || /\.(mp4|mov|webm|m4v|mkv)$/.test(filename)) {
        if (/(rough|cut|assembly|edit|offline)/.test(filename))
            return 'rough_cut';
        if (/(style|look|mood|grade|ref)/.test(filename))
            return 'style_ref';
        if (/(character|cast|portrait|headshot|actor)/.test(filename))
            return 'character_ref';
        return 'rough_cut';
    }
    if (IMAGE_MIME.test(mime) || magic === 'image' || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(filename)) {
        if (/(location|plate|establishing|set|exterior|interior|venue)/.test(filename))
            return 'location_ref';
        if (/(style|look|mood|grade|palette|lut|refboard)/.test(filename))
            return 'style_ref';
        return 'character_ref';
    }
    const sniffed = sniffTextType(text, filename);
    if (sniffed !== 'unknown')
        return sniffed;
    if (url && looksLikeFileUrl(url))
        return detectType({ filename: urlPath(url), mime, text, magic });
    if (url)
        return 'link';
    return 'unknown';
}
function sniffTextType(text, filename = '') {
    const name = filename.toLowerCase();
    if (name.endsWith('.fountain') || name.endsWith('.fdx'))
        return 'script';
    if (SCENE_HEADING.test(text) || countCharacterCues(text) >= 3)
        return 'script';
    if (looksLikeTreatment(text, name))
        return 'treatment';
    if (text.trim())
        return 'unknown';
    return 'unknown';
}
function parseFountainLocal(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const scenes = [];
    const characters = new Set();
    const locations = new Set();
    let current = null;
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (SCENE_HEADING.test(line)) {
            if (current)
                scenes.push(current);
            current = { heading: line.trim(), body: '' };
            const loc = line.replace(SCENE_HEADING, '').replace(/\s*-\s*(DAY|NIGHT|DAWN|DUSK|CONTINUOUS).*$/i, '').trim();
            if (loc)
                locations.add(titleCase(loc));
            continue;
        }
        if (current)
            current.body += (current.body ? '\n' : '') + line;
        const cue = line.trim();
        if (CHARACTER_CUE.test(cue) && !SCENE_HEADING.test(cue) && cue.length < 40 && !/^(INT|EXT|FADE|CUT|DISSOLVE)/.test(cue)) {
            characters.add(titleCase(cue.replace(/\s*\(.*\)$/, '').trim()));
        }
    }
    if (current)
        scenes.push(current);
    return {
        scenes,
        characters: [...characters],
        locations: [...locations],
        text,
    };
}
function chunkText(text, size = 1200, overlap = 120) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean)
        return [];
    if (clean.length <= size)
        return [clean];
    const chunks = [];
    let start = 0;
    while (start < clean.length) {
        const end = Math.min(clean.length, start + size);
        chunks.push(clean.slice(start, end));
        if (end >= clean.length)
            break;
        start = Math.max(end - overlap, start + 1);
    }
    return chunks;
}
function mergePremiseLocks(base, incoming) {
    return {
        characters: mergeElements(base.characters, incoming.characters),
        settings: mergeElements(base.settings, incoming.settings),
        story: incoming.story.trim() || base.story,
        genre: incoming.genre.trim() || base.genre,
        tone: incoming.tone.trim() || base.tone,
    };
}
function premiseFromTreatmentText(text) {
    const story = text.replace(/\s+/g, ' ').trim().slice(0, 800);
    if (story.length < 12)
        return null;
    return (0, premiseLock_1.parsePremiseLock)({
        characters: [],
        settings: [],
        story,
        genre: pickField(text, /genre\s*[:—-]\s*(.+)/i),
        tone: pickField(text, /tone\s*[:—-]\s*(.+)/i),
    });
}
function matchEntityName(name, existing) {
    const needle = name.trim().toLowerCase();
    if (!needle)
        return null;
    const exact = existing.find((row) => row.trim().toLowerCase() === needle);
    if (exact)
        return exact;
    const contained = existing.find((row) => {
        const hay = row.trim().toLowerCase();
        return hay.includes(needle) || needle.includes(hay);
    });
    return contained ?? null;
}
function measuredLookFromPalette(rgb, framing = 'unspecified') {
    const palette = rgb.slice(0, 5).map((c) => rgbHex(c.r, c.g, c.b));
    const lumas = rgb.map((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    const mean = lumas.reduce((a, b) => a + b, 0) / Math.max(lumas.length, 1);
    const variance = lumas.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lumas.length, 1);
    const stdev = Math.sqrt(variance);
    const contrast = stdev > 70 ? 'high' : stdev < 28 ? 'low' : 'medium';
    const summary = [
        palette.length ? `palette ${palette.join(', ')}` : '',
        `${contrast} contrast`,
        framing !== 'unspecified' ? framing : '',
    ].filter(Boolean).join('; ');
    return { palette, contrast, framing, summary };
}
function parseUnderstandJson(raw, fallbackType) {
    if (!raw || typeof raw !== 'object') {
        return { role: fallbackType, description: '', type: fallbackType, links: {} };
    }
    const row = raw;
    const type = typeof row.type === 'string' && isIngestType(row.type) ? row.type : fallbackType;
    const linksRaw = row.links && typeof row.links === 'object' ? row.links : {};
    return {
        role: typeof row.role === 'string' && row.role.trim() ? row.role.trim() : type,
        description: typeof row.description === 'string' ? row.description.trim() : '',
        type,
        links: {
            characterName: str(linksRaw.characterName),
            locationName: str(linksRaw.locationName),
            scene: str(linksRaw.scene),
            style: str(linksRaw.style),
        },
    };
}
function looksLikeTreatment(text, filename) {
    if (/(treatment|brief|logline|tone bible)/i.test(filename))
        return true;
    if (text.length < 80)
        return false;
    if (SCENE_HEADING.test(text) && countCharacterCues(text) >= 3)
        return false;
    return /(logline|treatment|tone|premise|genre)\s*[:—-]/i.test(text) || text.length > 400;
}
function countCharacterCues(text) {
    return text.split('\n').filter((line) => CHARACTER_CUE.test(line.trim())).length;
}
function looksLikeFileUrl(url) {
    try {
        const path = new URL(url).pathname.toLowerCase();
        return /\.[a-z0-9]{2,5}$/.test(path);
    }
    catch {
        return /\.[a-z0-9]{2,5}(\?|$)/i.test(url);
    }
}
function urlPath(url) {
    try {
        return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url);
    }
    catch {
        return url.split('/').pop() ?? url;
    }
}
function mergeElements(base, incoming) {
    const map = new Map();
    for (const el of [...base, ...incoming]) {
        const key = el.name.trim().toLowerCase();
        if (!key)
            continue;
        const prev = map.get(key);
        map.set(key, prev
            ? { ...prev, description: el.description.trim() || prev.description }
            : el);
    }
    return [...map.values()];
}
function pickField(text, re) {
    const match = text.match(re);
    return match?.[1]?.split('\n')[0]?.trim().slice(0, 80) ?? '';
}
function titleCase(value) {
    return value
        .toLowerCase()
        .replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
}
function rgbHex(r, g, b) {
    const n = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${n(r)}${n(g)}${n(b)}`;
}
function str(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
//# sourceMappingURL=ingest.js.map