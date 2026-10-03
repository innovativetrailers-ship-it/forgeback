import { type DurationConstraint, type PayloadBuildOptions } from './payload';
/**
 * Pika 2.2 duration from OpenAPI on 2026-09-26.
 * fal-ai/pika/v2.2/text-to-video — integer enum [5, 10], default 5.
 */
export declare const PIKA_TEXT = "fal-ai/pika/v2.2/text-to-video";
export declare const PIKA_IMAGE = "fal-ai/pika/v2.2/image-to-video";
export declare const PIKA_DURATION: readonly [5, 10];
export declare function pikaDurationConstraint(): DurationConstraint;
export declare function pikaDuration(seconds: number | undefined, endpoint?: string, onClamp?: PayloadBuildOptions['onClamp']): number;
