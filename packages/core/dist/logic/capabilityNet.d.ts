export declare const CONTROL_STATUSES: readonly ["wired", "ui-only", "stub", "absent"];
export type ControlStatus = (typeof CONTROL_STATUSES)[number];
export declare const CONTROL_SYSTEMS: readonly ["generation", "color", "lighting", "editing", "vfx", "cgi", "audio", "style", "production", "intelligence"];
export type ControlSystem = (typeof CONTROL_SYSTEMS)[number];
export declare const GATED_CONTROLS: readonly ["lastFrame", "firstFrame", "voice", "audioToggle", "seed", "negative", "reference"];
export type GatedControl = (typeof GATED_CONTROLS)[number];
export interface ControlRecord {
    id: string;
    name: string;
    system: ControlSystem;
    status: ControlStatus;
    falseClaim?: boolean;
    file?: string;
    note?: string;
}
export interface CapabilityCaps {
    lastFrame: boolean;
    firstFrame: boolean;
    voice: string;
    audioToggle: boolean;
    seed: boolean;
    negative: boolean;
    reference: boolean;
}
export interface ControlGate {
    visible: boolean;
    reason?: string;
}
export interface ClaimCheck {
    id: string;
    label: string;
    claimed: number;
    backed: number;
    unit: string;
}
export declare const SPEC_SYSTEM_FILES: Array<{
    file: string;
    system: ControlSystem;
}>;
/** Documented UI-ONLY controls. A new id not in this list is a regression. */
export declare const KNOWN_UI_ONLY: readonly ["generation/native-audio-toggle", "generation/quality-tier-draft-studio-blockbuster", "editing/jkl-trim", "vfx/web-green-screen-apply", "cgi/web-ai-template"];
export declare const KNOWN_STUBS: readonly ["audio/stem-separation", "audio/dubbing", "audio/per-language-re-lipsync", "audio/parametric-eq", "style/genre-lut-pack", "cgi/planar-track", "vfx/4-point-planar-track", "vfx/lens-flare", "production/subtitle-translation", "editing/multicam-2-up-4-up", "editing/sync-by-timecode", "editing/sync-by-waveform", "editing/audio-sync", "editing/camera-raw-import-braw-r3d-arri-mxf-crm-n-raw-s-raw", "editing/prores-import", "lighting/skin-tone-line"];
export declare const KNOWN_FALSE_CLAIMS: readonly ["cgi/200-effect-library", "vfx/100-effect-rack"];
export declare const KNOWN_DEAD_HANDLERS: readonly ["src/components/panels/GreenScreenPanel.tsx", "src/components/panels/SFXMakeupPanel.tsx"];
export declare function isControlStatus(value: string): value is ControlStatus;
export declare function controlSlug(system: string, name: string): string;
export declare function parseControlHeading(line: string): {
    name: string;
    status: ControlStatus;
    falseClaim: boolean;
} | null;
export declare function parseAuditHeader(text: string): {
    wired: number;
    uiOnly: number;
    stub: number;
    absent: number;
} | null;
export declare function parseSpecControls(markdown: string, system: ControlSystem): ControlRecord[];
export declare function countByStatus(rows: ControlRecord[]): Record<ControlStatus, number>;
export declare function deadControls(rows: ControlRecord[]): ControlRecord[];
export declare function unlistedIds(found: string[], known: readonly string[]): string[];
export declare function auditCountsMatch(parsed: Record<ControlStatus, number>, header: {
    wired: number;
    uiOnly: number;
    stub: number;
    absent: number;
}): boolean;
export declare function gateModelControl(caps: CapabilityCaps, control: GatedControl): ControlGate;
export declare function claimMatches(claimed: number, backed: number): boolean;
export declare function claimOverstated(claimed: number, backed: number): boolean;
export declare function claimHonesty(checks: ClaimCheck[]): ClaimCheck[];
