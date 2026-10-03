"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_DEAD_HANDLERS = exports.KNOWN_FALSE_CLAIMS = exports.KNOWN_STUBS = exports.KNOWN_UI_ONLY = exports.SPEC_SYSTEM_FILES = exports.GATED_CONTROLS = exports.CONTROL_SYSTEMS = exports.CONTROL_STATUSES = void 0;
exports.isControlStatus = isControlStatus;
exports.controlSlug = controlSlug;
exports.parseControlHeading = parseControlHeading;
exports.parseAuditHeader = parseAuditHeader;
exports.parseSpecControls = parseSpecControls;
exports.countByStatus = countByStatus;
exports.deadControls = deadControls;
exports.unlistedIds = unlistedIds;
exports.auditCountsMatch = auditCountsMatch;
exports.gateModelControl = gateModelControl;
exports.claimMatches = claimMatches;
exports.claimOverstated = claimOverstated;
exports.claimHonesty = claimHonesty;
exports.CONTROL_STATUSES = ['wired', 'ui-only', 'stub', 'absent'];
exports.CONTROL_SYSTEMS = [
    'generation',
    'color',
    'lighting',
    'editing',
    'vfx',
    'cgi',
    'audio',
    'style',
    'production',
    'intelligence',
];
exports.GATED_CONTROLS = [
    'lastFrame',
    'firstFrame',
    'voice',
    'audioToggle',
    'seed',
    'negative',
    'reference',
];
exports.SPEC_SYSTEM_FILES = [
    { file: 'SPEC-01-generation-camera.md', system: 'generation' },
    { file: 'SPEC-02-color-grading.md', system: 'color' },
    { file: 'SPEC-03-lighting-shading.md', system: 'lighting' },
    { file: 'SPEC-04-editing-nle.md', system: 'editing' },
    { file: 'SPEC-05-vfx-compositing.md', system: 'vfx' },
    { file: 'SPEC-06-cgi-overlays.md', system: 'cgi' },
    { file: 'SPEC-07-audio.md', system: 'audio' },
    { file: 'SPEC-08-style-look.md', system: 'style' },
    { file: 'SPEC-09-production-delivery.md', system: 'production' },
    { file: 'SPEC-10-llm-intelligence.md', system: 'intelligence' },
];
/** Documented UI-ONLY controls. A new id not in this list is a regression. */
exports.KNOWN_UI_ONLY = [
    'generation/native-audio-toggle',
    'generation/quality-tier-draft-studio-blockbuster',
    'editing/jkl-trim',
    'vfx/web-green-screen-apply',
    'cgi/web-ai-template',
];
exports.KNOWN_STUBS = [
    'audio/stem-separation',
    'audio/dubbing',
    'audio/per-language-re-lipsync',
    'audio/parametric-eq',
    'style/genre-lut-pack',
    'cgi/planar-track',
    'vfx/4-point-planar-track',
    'vfx/lens-flare',
    'production/subtitle-translation',
    'editing/multicam-2-up-4-up',
    'editing/sync-by-timecode',
    'editing/sync-by-waveform',
    'editing/audio-sync',
    'editing/camera-raw-import-braw-r3d-arri-mxf-crm-n-raw-s-raw',
    'editing/prores-import',
    'lighting/skin-tone-line',
];
exports.KNOWN_FALSE_CLAIMS = [
    'cgi/200-effect-library',
    'vfx/100-effect-rack',
];
exports.KNOWN_DEAD_HANDLERS = [
    'src/components/panels/GreenScreenPanel.tsx',
    'src/components/panels/SFXMakeupPanel.tsx',
];
const HEADING = /^###\s+(.+?)\s+\[(WIRED|UI-ONLY|STUB|ABSENT)(?:\/FALSE-CLAIM)?[^\]]*\]/;
function isControlStatus(value) {
    return exports.CONTROL_STATUSES.includes(value);
}
function controlSlug(system, name) {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${system}/${slug}`;
}
function parseControlHeading(line) {
    const match = line.match(HEADING);
    if (!match)
        return null;
    const status = match[2].toLowerCase();
    return {
        name: match[1].trim(),
        status,
        falseClaim: /FALSE-CLAIM/i.test(line),
    };
}
function parseAuditHeader(text) {
    const match = text.match(/Audit:\s*(\d+)\s*WIRED\s*\/\s*(\d+)\s*UI-ONLY\s*\/\s*(\d+)\s*STUB\s*\/\s*(\d+)\s*ABSENT/i);
    if (!match)
        return null;
    return {
        wired: Number(match[1]),
        uiOnly: Number(match[2]),
        stub: Number(match[3]),
        absent: Number(match[4]),
    };
}
function parseSpecControls(markdown, system) {
    const rows = [];
    for (const line of markdown.split('\n')) {
        const parsed = parseControlHeading(line);
        if (!parsed)
            continue;
        rows.push({
            id: controlSlug(system, parsed.name),
            name: parsed.name,
            system,
            status: parsed.status,
            falseClaim: parsed.falseClaim || undefined,
        });
    }
    return rows;
}
function countByStatus(rows) {
    const counts = { wired: 0, 'ui-only': 0, stub: 0, absent: 0 };
    for (const row of rows)
        counts[row.status] += 1;
    return counts;
}
function deadControls(rows) {
    return rows.filter((row) => row.status === 'ui-only' || row.status === 'stub' || row.falseClaim);
}
function unlistedIds(found, known) {
    const allow = new Set(known);
    return found.filter((id) => !allow.has(id));
}
function auditCountsMatch(parsed, header) {
    return (parsed.wired === header.wired
        && parsed['ui-only'] === header.uiOnly
        && parsed.stub === header.stub
        && parsed.absent === header.absent);
}
function gateModelControl(caps, control) {
    switch (control) {
        case 'lastFrame':
            return caps.lastFrame
                ? { visible: true }
                : { visible: false, reason: 'This model has no last-frame field.' };
        case 'firstFrame':
            return caps.firstFrame
                ? { visible: true }
                : { visible: false, reason: 'This model has no first-frame field.' };
        case 'voice':
            return caps.voice && caps.voice !== 'none'
                ? { visible: true }
                : { visible: false, reason: 'This model has no voice field.' };
        case 'audioToggle':
            return caps.audioToggle
                ? { visible: true }
                : { visible: false, reason: 'Native audio is locked off for this model.' };
        case 'seed':
            return caps.seed
                ? { visible: true }
                : { visible: false, reason: 'This model has no seed field.' };
        case 'negative':
            return caps.negative
                ? { visible: true }
                : { visible: false, reason: 'This model has no negative-prompt field.' };
        case 'reference':
            return caps.reference
                ? { visible: true }
                : { visible: false, reason: 'This model has no reference field.' };
    }
}
function claimMatches(claimed, backed) {
    return claimed === backed;
}
function claimOverstated(claimed, backed) {
    return claimed > backed;
}
function claimHonesty(checks) {
    return checks.filter((row) => claimOverstated(row.claimed, row.backed) || !claimMatches(row.claimed, row.backed));
}
//# sourceMappingURL=capabilityNet.js.map