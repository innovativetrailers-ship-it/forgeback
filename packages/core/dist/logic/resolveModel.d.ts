import type { ModelDef } from '../types/provider';
export declare class ModelResolveError extends Error {
    constructor(message: string);
}
export declare function normaliseModelId(id: string | undefined): string;
export declare function falBaseApp(endpoint: string): string;
export declare function modelAcceptsEndFrame(id: string): boolean;
export declare function modelSupportsSeed(def: {
    supportsSeed: boolean;
}): boolean;
export declare function modelSupportsCharRef(def: {
    supportsCharRef: boolean;
}): boolean;
export declare function resolveModel(id: string): ModelDef;
export declare function assertModelsResolvable(modelIds: string[]): void;
export declare function resolveReferenceEndpoint(registryModel: string): string | undefined;
/** reference-to-video, else a distinct image-to-video endpoint, else the model cannot hold a still. */
export declare function stillHold(id: string): 'reference' | 'first_frame' | null;
export declare function resolveVideoEndpoint(registryModel: string, hasStartFrame: boolean): string | undefined;
