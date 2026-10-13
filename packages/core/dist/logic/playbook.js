"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAYBOOK_CLASSIFY_SOURCE = void 0;
exports.isUnsafePlaybookRule = isUnsafePlaybookRule;
exports.stripUnsafeRules = stripUnsafeRules;
exports.parsePlaybook = parsePlaybook;
exports.mergePlaybooks = mergePlaybooks;
exports.classifyRule = classifyRule;
exports.classifyRules = classifyRules;
exports.effectiveRules = effectiveRules;
exports.applyPlaybookToShots = applyPlaybookToShots;
exports.playbookToQualityConstraint = playbookToQualityConstraint;
exports.resolveWithPlaybook = resolveWithPlaybook;
exports.biasCandidates = biasCandidates;
exports.suggestPlaybookAdditions = suggestPlaybookAdditions;
exports.parseClassifiedRuleJson = parseClassifiedRuleJson;
const premiseLock_1 = require("./premiseLock");
const genrePresets_1 = require("./genrePresets");
exports.PLAYBOOK_CLASSIFY_SOURCE = 'playbook.classify';
const UNSAFE = [
    /\bdisable\b.{0,24}\b(billing|credits?|pause|moderation|safety|gate)\b/i,
    /\bskip\b.{0,24}\b(quality gate|moderation|billing|pause|credits?)\b/i,
    /\bsuppress\b.{0,24}\b(error|flag|honest|problem)\b/i,
    /\b(hide|ignore)\b.{0,24}\b(error|flag|safety|pause|billing)\b/i,
    /\bbypass\b.{0,24}\b(billing|gate|credits?|pause|chokepoint)\b/i,
    /\bforce\s+(pass|approve)\b/i,
    /\bGENERATION_PAUSED\b/i,
    /\bno quality gate\b/i,
    /\brefund\b/i,
];
function isUnsafePlaybookRule(text) {
    return UNSAFE.some((re) => re.test(text));
}
function stripUnsafeRules(rules) {
    const kept = [];
    const rejected = [];
    for (const rule of rules) {
        const text = rule.trim();
        if (!text)
            continue;
        if (isUnsafePlaybookRule(text))
            rejected.push(text);
        else
            kept.push(text);
    }
    return { kept, rejected };
}
function parsePlaybook(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const row = raw;
    const id = str(row.id);
    const userId = str(row.userId);
    const name = str(row.name);
    if (!id || !userId || !name)
        return null;
    const rules = stringList(row.rules);
    const { kept } = stripUnsafeRules(rules);
    return {
        id,
        userId,
        projectId: str(row.projectId) || null,
        name,
        style: parseStyle(row.style),
        generation: parseGeneration(row.generation),
        language: parseLanguage(row.language),
        rules: kept,
        classifiedRules: parseClassified(row.classifiedRules ?? row.ruleActions),
    };
}
/** Project playbook overlays the user-global default. Explicit empty objects stay empty. */
function mergePlaybooks(global, project) {
    if (!project && !global)
        return null;
    if (!project)
        return global;
    if (!global)
        return project;
    const rules = stripUnsafeRules([...(global.rules ?? []), ...(project.rules ?? [])]).kept;
    return {
        id: project.id,
        userId: project.userId,
        projectId: project.projectId,
        name: project.name,
        style: { ...global.style, ...project.style },
        generation: {
            defaultQualityTier: project.generation?.defaultQualityTier ?? global.generation?.defaultQualityTier,
            maxShotDuration: project.generation?.maxShotDuration ?? global.generation?.maxShotDuration,
            defaultDuration: project.generation?.defaultDuration ?? global.generation?.defaultDuration,
            modelPreferences: { ...global.generation?.modelPreferences, ...project.generation?.modelPreferences },
        },
        language: { ...global.language, ...project.language },
        rules,
        classifiedRules: [...(global.classifiedRules ?? []), ...(project.classifiedRules ?? [])],
    };
}
function classifyRule(text) {
    const trimmed = text.trim();
    if (isUnsafePlaybookRule(trimmed)) {
        return { text: trimmed, kind: 'hard', action: { type: 'rejected', reason: 'safety' } };
    }
    const lower = trimmed.toLowerCase();
    const dur = lower.match(/(?:under|max(?:imum)?|keep shots?(?: to| under)?|no longer than)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/);
    if (dur) {
        return { text: trimmed, kind: 'hard', action: { type: 'max_duration', seconds: Number(dur[1]) } };
    }
    if (/no on[- ]screen text|no titles?|no captions?|no lower[- ]thirds?|no overlay text/.test(lower)) {
        return { text: trimmed, kind: 'hard', action: { type: 'no_onscreen_text' } };
    }
    if (/no dialogue in establishing/.test(lower)) {
        return { text: trimmed, kind: 'hard', action: { type: 'no_dialogue_establishing' } };
    }
    const chain = lower.match(/chains? under (\d+)/);
    if (chain) {
        return { text: trimmed, kind: 'hard', action: { type: 'max_chain', shots: Number(chain[1]) } };
    }
    if (/end scenes? on a wide/.test(lower)) {
        return { text: trimmed, kind: 'hard', action: { type: 'end_scene_wide' } };
    }
    return { text: trimmed, kind: 'soft', action: { type: 'prompt_inject', fragment: trimmed } };
}
function classifyRules(rules) {
    return stripUnsafeRules(rules).kept.map(classifyRule);
}
function effectiveRules(playbook) {
    if (!playbook)
        return [];
    if (playbook.classifiedRules?.length) {
        return playbook.classifiedRules.filter((rule) => rule.action.type !== 'rejected');
    }
    return classifyRules(playbook.rules ?? []);
}
function applyPlaybookToShots(shots, playbook) {
    if (!playbook || !shots.length)
        return shots;
    const rules = effectiveRules(playbook);
    const soft = rules
        .filter((rule) => rule.kind === 'soft' && rule.action.type === 'prompt_inject')
        .map((rule) => rule.action.fragment);
    const styleLine = stylePromptLine(playbook);
    const fragment = [...soft, styleLine].filter(Boolean).join(' ');
    const maxFromGen = playbook.generation?.maxShotDuration;
    const maxFromRules = rules.reduce((max, rule) => {
        if (rule.action.type === 'max_duration')
            return Math.min(max, rule.action.seconds);
        return max;
    }, Number.POSITIVE_INFINITY);
    const maxDuration = Number.isFinite(maxFromRules) ? Math.min(maxFromGen ?? maxFromRules, maxFromRules) : maxFromGen;
    const defaultDuration = playbook.generation?.defaultDuration;
    const noText = rules.some((rule) => rule.action.type === 'no_onscreen_text');
    const noEstDialogue = rules.some((rule) => rule.action.type === 'no_dialogue_establishing');
    const endWide = rules.some((rule) => rule.action.type === 'end_scene_wide');
    const maxChain = rules.find((rule) => rule.action.type === 'max_chain');
    const chainCap = maxChain && maxChain.action.type === 'max_chain' ? maxChain.action.shots : undefined;
    const lastInScene = new Set();
    if (endWide) {
        const last = new Map();
        for (const shot of shots) {
            const scene = shot.sceneNumber ?? 0;
            last.set(scene, shot.shotIndex ?? 0);
        }
        for (const index of last.values())
            lastInScene.add(index);
    }
    let chainCount = 0;
    let lastGroup;
    return shots.map((shot) => {
        let duration = shot.duration;
        if (duration == null && defaultDuration != null)
            duration = defaultDuration;
        if (maxDuration != null && duration != null)
            duration = Math.min(duration, maxDuration);
        let visualPrompt = shot.visualPrompt ?? '';
        if (noText)
            visualPrompt = stripOnscreenText(visualPrompt);
        const establishing = /establishing|aerial_establishing/.test(shot.contentType ?? '');
        const hasDialogue = noEstDialogue && establishing ? false : shot.hasDialogue;
        const hasAudio = noEstDialogue && establishing ? false : shot.hasAudio;
        let shotSize = shot.shotSize;
        if (endWide && lastInScene.has(shot.shotIndex ?? -1) && !shotSize?.trim())
            shotSize = 'WS';
        let continuityGroup = shot.continuityGroup;
        if (chainCap != null && continuityGroup != null) {
            if (lastGroup !== continuityGroup) {
                lastGroup = continuityGroup;
                chainCount = 1;
            }
            else {
                chainCount += 1;
                if (chainCount > chainCap) {
                    continuityGroup = (continuityGroup + 50) + (shot.shotIndex ?? 0);
                    chainCount = 1;
                    lastGroup = continuityGroup;
                }
            }
        }
        const genrePresetId = shot.genrePresetId?.trim() || playbook.style?.genrePreset || shot.genrePresetId;
        const aspectRatio = shot.aspectRatio?.trim() || playbook.style?.aspectRatio || shot.aspectRatio;
        return {
            ...shot,
            duration,
            visualPrompt,
            hasDialogue,
            hasAudio,
            shotSize,
            continuityGroup,
            genrePresetId,
            aspectRatio,
            playbookFragment: [shot.playbookFragment, fragment].filter(Boolean).join(' ') || undefined,
        };
    });
}
function playbookToQualityConstraint(tier) {
    if (tier === 'draft')
        return 'draft';
    if (tier === 'blockbuster')
        return 'blockbuster';
    if (tier === 'studio')
        return 'standard';
    return undefined;
}
/** Explicit run/shot value wins. Playbook fills when the explicit value is absent. */
function resolveWithPlaybook(explicit, playbookValue, system) {
    if (explicit != null && explicit !== '')
        return explicit;
    if (playbookValue != null && playbookValue !== '')
        return playbookValue;
    return system;
}
function biasCandidates(candidates, purpose, playbook, suggestedModel) {
    if (!candidates.length)
        return candidates;
    const ranked = candidates.map((row) => ({ ...row }));
    if (suggestedModel?.trim()) {
        const idx = ranked.findIndex((row) => row.model === suggestedModel.trim());
        if (idx >= 0) {
            const [need] = ranked.splice(idx, 1);
            return [need, ...ranked];
        }
    }
    const pref = playbook?.generation?.modelPreferences?.[purpose];
    if (!pref)
        return ranked;
    const hit = ranked.find((row) => row.model === pref);
    if (hit)
        hit.fitScore += 0.12;
    return ranked.sort((a, b) => b.fitScore - a.fitScore);
}
function suggestPlaybookAdditions(taste) {
    const out = [];
    if (taste.qualityVsSpeedLean >= 0.4) {
        out.push({
            text: 'Default to Blockbuster quality',
            reason: 'You keep rating higher-tier shots up.',
            patch: { generation: { defaultQualityTier: 'blockbuster' } },
        });
    }
    else if (taste.qualityVsSpeedLean <= -0.4) {
        out.push({
            text: 'Default to Draft quality',
            reason: 'You keep preferring faster, cheaper takes.',
            patch: { generation: { defaultQualityTier: 'draft' } },
        });
    }
    const top = Object.entries(taste.modelPreference).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) {
        out.push({
            text: `Prefer ${top[0]} for hero shots`,
            reason: `You keep rating ${top[0]} up.`,
            patch: { generation: { modelPreferences: { hero: top[0] } } },
        });
    }
    if ((taste.dimensionSensitivity.wrong_style ?? 0) >= 2) {
        out.push({
            text: 'Keep the genre preset locked',
            reason: 'Style misses keep showing up in ratings.',
            patch: { rules: ['keep the current grade and genre look'] },
        });
    }
    if ((taste.dimensionSensitivity.bad_lighting ?? 0) >= 2) {
        out.push({
            text: 'Prefer motivated practical lighting',
            reason: 'Lighting keeps getting marked down.',
            patch: { rules: ['prefer motivated practical lighting'] },
        });
    }
    if ((taste.dimensionSensitivity.character_drifted ?? 0) >= 2) {
        out.push({
            text: 'Prefer Seedance for character shots',
            reason: 'Character consistency keeps failing.',
            patch: { generation: { modelPreferences: { consistency: 'seedance-2.0' } } },
        });
    }
    return out;
}
function parseClassifiedRuleJson(raw, fallbackType) {
    if (!raw || typeof raw !== 'object')
        return classifyRule(String(fallbackType));
    const row = raw;
    const text = str(row.text) || str(row.rule) || '';
    if (!text)
        return classifyRule('');
    const kind = row.kind === 'hard' || row.kind === 'soft' ? row.kind : classifyRule(text).kind;
    const action = parseAction(row.action) ?? classifyRule(text).action;
    if (action.type === 'rejected' || isUnsafePlaybookRule(text)) {
        return { text, kind: 'hard', action: { type: 'rejected', reason: 'safety' } };
    }
    return { text, kind, action };
}
function stylePromptLine(playbook) {
    const bits = [];
    if (playbook.style?.grade)
        bits.push(`${playbook.style.grade} grade`);
    if (playbook.style?.grain)
        bits.push(playbook.style.grain);
    if (playbook.style?.aspectRatio)
        bits.push(`framed ${playbook.style.aspectRatio}`);
    if (playbook.style?.lut)
        bits.push(`LUT ${playbook.style.lut}`);
    return bits.join(', ');
}
function stripOnscreenText(prompt) {
    return prompt
        .replace(/\b(title cards?|lower[- ]thirds?|on[- ]screen text|burn[- ]in captions?|subtitles?)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
function parseStyle(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const row = raw;
    const genre = str(row.genrePreset);
    return {
        aspectRatio: str(row.aspectRatio),
        grade: str(row.grade),
        genrePreset: genre && (0, genrePresets_1.isGenrePresetId)(genre) ? genre : undefined,
        grain: str(row.grain),
        lut: str(row.lut),
    };
}
function parseGeneration(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const row = raw;
    const tier = str(row.defaultQualityTier);
    const prefsRaw = row.modelPreferences && typeof row.modelPreferences === 'object'
        ? row.modelPreferences
        : {};
    const modelPreferences = {};
    for (const [key, value] of Object.entries(prefsRaw)) {
        if ((0, premiseLock_1.isShotPurpose)(key) && typeof value === 'string' && value.trim()) {
            modelPreferences[key] = value.trim();
        }
    }
    return {
        defaultQualityTier: tier === 'draft' || tier === 'studio' || tier === 'blockbuster' ? tier : undefined,
        modelPreferences: Object.keys(modelPreferences).length ? modelPreferences : undefined,
        maxShotDuration: num(row.maxShotDuration),
        defaultDuration: num(row.defaultDuration),
    };
}
function parseLanguage(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const row = raw;
    return {
        narrationLanguage: str(row.narrationLanguage),
        voiceDefaults: str(row.voiceDefaults),
    };
}
function parseClassified(raw) {
    if (!Array.isArray(raw))
        return undefined;
    const out = raw.map((item) => parseClassifiedRuleJson(item, '')).filter((rule) => rule.text);
    return out.length ? out : undefined;
}
function parseAction(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const row = raw;
    const type = str(row.type);
    if (type === 'max_duration' && num(row.seconds) != null)
        return { type: 'max_duration', seconds: num(row.seconds) };
    if (type === 'no_onscreen_text')
        return { type: 'no_onscreen_text' };
    if (type === 'no_dialogue_establishing')
        return { type: 'no_dialogue_establishing' };
    if (type === 'max_chain' && num(row.shots) != null)
        return { type: 'max_chain', shots: num(row.shots) };
    if (type === 'end_scene_wide')
        return { type: 'end_scene_wide' };
    if (type === 'prompt_inject' && str(row.fragment))
        return { type: 'prompt_inject', fragment: str(row.fragment) };
    if (type === 'rejected')
        return { type: 'rejected', reason: str(row.reason) || 'safety' };
    return null;
}
function str(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function num(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
//# sourceMappingURL=playbook.js.map