"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainingCostUsd = trainingCostUsd;
exports.trainerStepsField = trainerStepsField;
exports.validateTrainingSet = validateTrainingSet;
exports.captionForFile = captionForFile;
exports.zipEntryName = zipEntryName;
exports.buildTrainerInput = buildTrainerInput;
exports.costsMatch = costsMatch;
function trainingCostUsd(trainer, steps) {
    const n = Number.isFinite(steps) ? Math.max(1, Math.round(steps)) : 1000;
    return Number((n * trainer.costPerStep).toFixed(4));
}
function trainerStepsField(trainer) {
    const id = trainer.id;
    if (id.includes('flux') || id.includes('z-image') || id.includes('wan-22-image'))
        return 'steps';
    return 'number_of_steps';
}
function validateTrainingSet(trainer, files, triggerPhrase) {
    const errors = [];
    const allowed = new Set(trainer.dataset.types);
    const usable = files.filter((file) => allowed.has(file.kind));
    if (usable.length < trainer.dataset.minItems) {
        errors.push(`Need at least ${trainer.dataset.minItems} ${trainer.dataset.types.join('/')} files (got ${usable.length})`);
    }
    const extra = files.filter((file) => !allowed.has(file.kind));
    if (extra.length) {
        errors.push(`Trainer ${trainer.id} does not accept ${[...new Set(extra.map((f) => f.kind))].join(', ')}`);
    }
    if (trainer.dataset.captions) {
        const missing = usable.filter((file) => !file.caption?.trim() && !triggerPhrase?.trim());
        if (missing.length) {
            errors.push('Captions are required (or a trigger phrase that stands in for uncaptioned files)');
        }
    }
    if (trainer.dataset.triggerPhrase && trainer.dataset.triggerField && !triggerPhrase?.trim() && trainer.dataset.captions) {
        // H3 t2v: captions OR trigger. Already covered.
    }
    else if (trainer.dataset.triggerPhrase && trainer.dataset.triggerField === 'trigger_word' && !triggerPhrase?.trim()) {
        errors.push('trigger_word is required');
    }
    else if (trainer.id.includes('wan-22-image') && !triggerPhrase?.trim()) {
        errors.push('trigger_phrase is required');
    }
    return errors;
}
function captionForFile(file, triggerPhrase) {
    const caption = file.caption?.trim();
    if (caption)
        return caption;
    return triggerPhrase?.trim() ?? '';
}
function zipEntryName(file, index) {
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : kindExt(file.kind);
    const base = `clip_${String(index + 1).padStart(3, '0')}`;
    return { media: `${base}${ext}`, caption: `${base}.txt` };
}
function kindExt(kind) {
    if (kind === 'video')
        return '.mp4';
    if (kind === 'audio')
        return '.wav';
    return '.jpg';
}
function buildTrainerInput(trainer, dataUrl, opts) {
    const input = {
        [trainer.dataset.urlField]: dataUrl,
    };
    const stepsField = trainerStepsField(trainer);
    input[stepsField] = opts.steps;
    if (trainer.dataset.triggerField && opts.triggerPhrase?.trim()) {
        input[trainer.dataset.triggerField] = opts.triggerPhrase.trim();
    }
    return input;
}
function costsMatch(expected, confirmed, epsilon = 0.01) {
    return Number.isFinite(confirmed) && Math.abs(expected - confirmed) <= epsilon;
}
//# sourceMappingURL=trainingSet.js.map