import { type ChainLink, type GateDecision, type GateMode } from './chainContinuity';
import { type DelegateProject, type DelegateResult, type DelegateShot } from './delegate';
import type { LearnedByPurpose } from './modelKnowledge';
import type { PremiseLock, ShotPurpose } from './premiseLock';
export declare const ORCHESTRATE_STAGES: readonly ["premise", "interpret", "delegate", "generate", "gate", "learn", "assemble"];
export type OrchestrateStage = (typeof ORCHESTRATE_STAGES)[number];
export type OrchestrateShot = DelegateShot & {
    chainLink?: ChainLink;
};
export interface OrchestrateProject extends DelegateProject {
    gateMode: GateMode;
    skipInterpret?: boolean;
    directedShots?: OrchestrateShot[];
    premise?: PremiseLock;
}
export interface OrchestrateHost {
    premiseLock(script: string): Promise<PremiseLock>;
    interpretToShots(script: string, premise: PremiseLock): Promise<{
        shots: OrchestrateShot[];
    }>;
    generateShot(shot: OrchestrateShot, delegated: DelegateResult): Promise<{
        ok: boolean;
        failed?: boolean;
    }>;
    qualityGate(shot: OrchestrateShot, gateMode: GateMode): Promise<GateDecision>;
    recordOutcome(shot: OrchestrateShot, delegated: DelegateResult, signal: string): Promise<void>;
    assemble(shots: Array<OrchestrateShot & {
        delegation: DelegateResult;
    }>): Promise<{
        ok: boolean;
    }>;
    /** Production batch render (chains, escrow, stitch). Runs once after delegate, before per-shot gate. */
    afterDelegate?(shots: Array<OrchestrateShot & {
        delegation: DelegateResult;
    }>): Promise<void>;
}
export interface OrchestrateResult {
    premise: PremiseLock;
    shots: Array<OrchestrateShot & {
        delegation: DelegateResult;
    }>;
    stages: readonly OrchestrateStage[];
    skippedInterpret: boolean;
}
export declare function emptyPremise(story?: string): PremiseLock;
export declare function scheduleDAG(plan: {
    shots: Array<{
        id: string;
        chainLink?: ChainLink;
        chainFrom?: string | null;
    }>;
}): {
    chains: import("./chainContinuity").ContinuityChainGroup[];
    independents: import("./chainContinuity").ScheduledShot[];
};
export declare function handleGate(gate: GateDecision): 'continue' | 'regenerate' | 'await_user';
export declare function resolveBypass(project: OrchestrateProject, shot: OrchestrateShot): {
    skipInterpret: boolean;
    manualModel: string | null;
    gateMode: GateMode;
};
/**
 * Compose interpret → delegate → generate/gate → learn → assemble.
 * Hosts supply generate/assemble. Manual override and skipInterpret stay user-owned.
 */
export declare function orchestrate(script: string, project: OrchestrateProject, host: OrchestrateHost, pool?: readonly string[], learned?: Record<string, Partial<LearnedByPurpose>>): Promise<OrchestrateResult>;
/** True when a rating overlay moves the top model for that purpose. */
export declare function delegationShiftsForPurpose(purpose: ShotPurpose, pool: readonly string[], overlay: Record<string, Partial<LearnedByPurpose>>, project: Pick<DelegateProject, 'qualityTier' | 'taste'>): {
    before: string;
    after: string;
    shifted: boolean;
};
