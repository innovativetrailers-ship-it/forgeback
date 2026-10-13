"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORCHESTRATE_STAGES = void 0;
exports.emptyPremise = emptyPremise;
exports.scheduleDAG = scheduleDAG;
exports.handleGate = handleGate;
exports.resolveBypass = resolveBypass;
exports.orchestrate = orchestrate;
exports.delegationShiftsForPurpose = delegationShiftsForPurpose;
const chainContinuity_1 = require("./chainContinuity");
const delegate_1 = require("./delegate");
const modelKnowledge_1 = require("./modelKnowledge");
const playbook_1 = require("./playbook");
exports.ORCHESTRATE_STAGES = [
    'premise',
    'interpret',
    'delegate',
    'generate',
    'gate',
    'learn',
    'assemble',
];
function emptyPremise(story = 'Directed shot') {
    return { characters: [], settings: [], story, genre: '', tone: '' };
}
function scheduleDAG(plan) {
    return (0, chainContinuity_1.partitionContinuity)(plan.shots.map((shot) => ({
        id: shot.id,
        link: shot.chainLink ?? (shot.chainFrom ? 'video' : 'none'),
    })));
}
function handleGate(gate) {
    if (gate === 'pass')
        return 'continue';
    return gate;
}
function resolveBypass(project, shot) {
    return {
        skipInterpret: Boolean(project.skipInterpret),
        manualModel: shot.modelOverride?.trim() || null,
        gateMode: project.gateMode,
    };
}
function shotId(shot, index) {
    return shot.id ?? `shot-${index}`;
}
/**
 * Compose interpret → delegate → generate/gate → learn → assemble.
 * Hosts supply generate/assemble. Manual override and skipInterpret stay user-owned.
 */
async function orchestrate(script, project, host, pool, learned) {
    let premise;
    let planned;
    if (project.skipInterpret) {
        if (!project.directedShots?.length) {
            throw new Error('Direct a shot to skip interpretation');
        }
        premise = project.premise ?? emptyPremise(script.trim() || 'Directed shot');
        planned = project.directedShots;
    }
    else {
        premise = await host.premiseLock(script);
        planned = (await host.interpretToShots(script, premise)).shots;
    }
    planned = (0, playbook_1.applyPlaybookToShots)(planned, project.playbook);
    const shots = [];
    for (const shot of planned) {
        const delegation = await (0, delegate_1.delegate)(shot, project, pool, learned);
        shots.push({ ...shot, delegation });
    }
    const scheduled = scheduleDAG({
        shots: shots.map((shot, index) => ({
            id: shotId(shot, index),
            chainLink: shot.chainLink,
            chainFrom: shot.chainFrom,
        })),
    });
    const byId = new Map(shots.map((shot, index) => [shotId(shot, index), shot]));
    if (host.afterDelegate)
        await host.afterDelegate(shots);
    async function runUnit(id) {
        const shot = byId.get(id);
        if (!shot)
            return;
        let result = await host.generateShot(shot, shot.delegation);
        if (result.failed) {
            await host.recordOutcome(shot, shot.delegation, 'failed');
            return;
        }
        let gate = await host.qualityGate(shot, project.gateMode);
        let action = handleGate(gate);
        if (action === 'regenerate') {
            await host.recordOutcome(shot, shot.delegation, 'regenerate');
            result = await host.generateShot(shot, shot.delegation);
            if (result.failed) {
                await host.recordOutcome(shot, shot.delegation, 'failed');
                return;
            }
            gate = await host.qualityGate(shot, project.gateMode);
            action = handleGate(gate);
        }
        if (action === 'await_user')
            return;
        await host.recordOutcome(shot, shot.delegation, 'approved_at_gate');
    }
    for (const chain of scheduled.chains) {
        for (const unit of chain.shots)
            await runUnit(unit.id);
    }
    await Promise.all(scheduled.independents.map((unit) => runUnit(unit.id)));
    await host.assemble(shots);
    return {
        premise,
        shots,
        stages: exports.ORCHESTRATE_STAGES,
        skippedInterpret: Boolean(project.skipInterpret),
    };
}
/** True when a rating overlay moves the top model for that purpose. */
function delegationShiftsForPurpose(purpose, pool, overlay, project) {
    const need = {
        purpose,
        needs: { mode: 'text', audio: purpose === 'dialogue' },
        constraint: { tier: project.qualityTier },
    };
    const before = (0, modelKnowledge_1.queryModelRAG)(need, pool, undefined, project.taste);
    const after = (0, modelKnowledge_1.queryModelRAG)(need, pool, overlay, project.taste);
    const first = before[0]?.model ?? '';
    const next = after[0]?.model ?? '';
    return { before: first, after: next, shifted: Boolean(first && next && first !== next) };
}
//# sourceMappingURL=orchestrate.js.map