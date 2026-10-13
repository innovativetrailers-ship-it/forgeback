import type { DurationConstraint } from './payload';
/** The duration constraint the seal uses. The clamp must call this, not a stored enum. */
export declare function familyDurationConstraint(endpoint: string): DurationConstraint | null;
export declare function durationEnumFromConstraint(constraint: DurationConstraint): (string | number)[];
