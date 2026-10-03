/** First-party extension contract. Extensions speak this surface only. */
export declare const FORGE_API_VERSION = "1.0.0";
export declare const EXTENSION_ENGINES: readonly ["desktop", "web"];
export type ExtensionEngine = (typeof EXTENSION_ENGINES)[number];
export declare const EXTENSION_PERMISSIONS: readonly ["read-timeline", "write-timeline", "read-media", "run-generation"];
export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];
export interface ExtensionPoint {
    id: string;
    title?: string;
    label?: string;
    commandId?: string;
    extension?: string;
}
export interface ExtensionContributions {
    panels: ExtensionPoint[];
    tools: ExtensionPoint[];
    effectNodes: ExtensionPoint[];
    exporters: ExtensionPoint[];
    importers: ExtensionPoint[];
    commands: ExtensionPoint[];
    menus: ExtensionPoint[];
}
export interface ExtensionManifest {
    id: string;
    name: string;
    version: string;
    author: string;
    forgeApiVersion: string;
    entry: string;
    contributes: ExtensionContributions;
    permissions: string[];
    engines: ExtensionEngine[];
}
export interface ExtensionRecord {
    manifest: ExtensionManifest;
    granted: string[];
    enabled: boolean;
}
export interface ExtensionHostState {
    records: ExtensionRecord[];
    storage: Record<string, Record<string, string>>;
}
export interface ExtensionClipView {
    id: string;
    trackId: string;
    start: number;
    end: number;
    sourceUrl: string;
    label: string;
}
export interface ExtensionPatch {
    op: 'add' | 'move' | 'trim' | 'add-take';
    clipId?: string;
    trackId?: string;
    start?: number;
    end?: number;
    sourceUrl?: string;
    label?: string;
}
export interface ExtensionDispatchContext {
    engine: ExtensionEngine;
    clips: ExtensionClipView[];
    media: {
        id: string;
        label: string;
        url: string;
    }[];
    trackIds: string[];
    mintId: () => string;
    fetchImpl?: typeof fetch;
    readFile?: (relativePath: string) => string;
}
export interface ExtensionResponse {
    ok: boolean;
    error?: string;
    result?: unknown;
    patches?: ExtensionPatch[];
    clips?: ExtensionClipView[];
    quote?: {
        credits: number;
        source: 'extension';
        status: 'awaiting-confirm';
    };
}
export declare const EXTENSION_REGISTRY: ExtensionManifest[];
export declare function emptyExtensionHost(): ExtensionHostState;
export declare function searchExtensionRegistry(query: string): ExtensionManifest[];
export declare function validateExtensionManifest(raw: unknown): {
    ok: true;
    manifest: ExtensionManifest;
} | {
    ok: false;
    error: string;
};
export declare function proposeInstall(raw: unknown, engine: ExtensionEngine): {
    ok: true;
    manifest: ExtensionManifest;
    prompt: string[];
} | {
    ok: false;
    error: string;
};
export declare function commitInstall(state: ExtensionHostState, manifest: ExtensionManifest, granted: readonly string[], userConfirmed: boolean): ExtensionHostState;
export declare function setExtensionEnabled(state: ExtensionHostState, id: string, enabled: boolean): ExtensionHostState;
export declare function revokeExtension(state: ExtensionHostState, id: string): ExtensionHostState;
export declare function uninstallExtension(state: ExtensionHostState, id: string): ExtensionHostState;
export declare function extensionUpdate(record: ExtensionRecord): ExtensionManifest | null;
export declare function activeContributions(state: ExtensionHostState): {
    extensionId: string;
    contributes: ExtensionContributions;
}[];
export declare function dispatchExtensionMessage(state: ExtensionHostState, extensionId: string, message: unknown, ctx: ExtensionDispatchContext): {
    state: ExtensionHostState;
    response: ExtensionResponse;
};
