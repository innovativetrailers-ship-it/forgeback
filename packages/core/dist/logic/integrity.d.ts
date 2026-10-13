import type { ModelDef } from '../types/provider';
export declare class ModelIntegrityError extends Error {
    constructor(message: string);
}
export declare function assertModelIntegrity(selectedId: string, def: ModelDef, endpoint: string, hasStartFrame?: boolean, hasCharacterRefs?: boolean): void;
