export interface CameraIntentInput {
    camera?: {
        angle?: string;
        movement?: string;
        speed?: string;
        shotSize?: string;
        lensFeel?: string;
    } | null;
    cameraMove?: string;
    motionLevel?: string;
    contentType?: string;
}
export interface NormalizedCamera {
    cameraAngle?: string;
    cameraMove?: string;
    shotSize?: string;
    lensFeel?: string;
    cameraSpeed?: string;
    cameraPrecision: boolean;
}
/** Abstract camera intent from the breakdown. Gen-4.5 has no camera parameter, so these phrases go in the prompt. */
export declare function normalizeCameraIntent(raw: CameraIntentInput): NormalizedCamera;
