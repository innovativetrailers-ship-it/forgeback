"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCameraIntent = normalizeCameraIntent;
const ANGLES = {
    eye_level: 'eye level',
    'eye level': 'eye level',
    low: 'low angle',
    low_angle: 'low angle',
    'low angle': 'low angle',
    high: 'high angle',
    high_angle: 'high angle',
    'high angle': 'high angle',
    overhead: 'overhead',
    dutch: 'dutch',
    pov: 'pov',
};
const MOVES = {
    static: 'static',
    slow_push_in: 'push in',
    push_in: 'push in',
    'push in': 'push in',
    dolly_in: 'dolly in',
    'dolly in': 'dolly in',
    pull_out: 'pull out',
    'pull out': 'pull out',
    dolly_out: 'dolly out',
    'dolly out': 'dolly out',
    pan_left: 'pan left',
    'pan left': 'pan left',
    pan_right: 'pan right',
    'pan right': 'pan right',
    pan: 'pan left',
    tilt_up: 'tilt up',
    'tilt up': 'tilt up',
    tilt_down: 'tilt down',
    'tilt down': 'tilt down',
    tilt: 'tilt up',
    crane_up: 'crane up',
    'crane up': 'crane up',
    crane_down: 'crane down',
    'crane down': 'crane down',
    crane: 'crane up',
    aerial_descent: 'crane down',
    truck_left: 'truck left',
    'truck left': 'truck left',
    truck_right: 'truck right',
    'truck right': 'truck right',
    tracking: 'truck right',
    orbit: 'orbit',
    handheld: 'handheld',
    dolly: 'dolly in',
};
const SIZES = new Set(['ECU', 'CU', 'MCU', 'MS', 'MLS', 'WS', 'EWS']);
const LENSES = {
    wide: 'wide',
    normal: 'normal',
    telephoto: 'telephoto',
    '24mm wide': 'wide',
    '35mm': 'normal',
    '50mm': 'normal',
    '85mm portrait': 'telephoto',
};
const SPEEDS = {
    slow: 'slow',
    medium: 'medium',
    fast: 'fast',
    static: 'slow',
    complex: 'fast',
    normal: 'medium',
    'slow motion': 'slow',
    'speed ramp': 'fast',
};
function token(value) {
    return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
}
function pick(table, value) {
    if (!value?.trim())
        return undefined;
    return table[token(value)] ?? table[value.trim().toLowerCase()];
}
/** Abstract camera intent from the breakdown. Gen-4.5 has no camera parameter, so these phrases go in the prompt. */
function normalizeCameraIntent(raw) {
    const camera = raw.camera;
    const cameraMove = pick(MOVES, camera?.movement) ?? pick(MOVES, raw.cameraMove);
    const cameraAngle = pick(ANGLES, camera?.angle);
    const size = camera?.shotSize?.trim().toUpperCase();
    const shotSize = size && SIZES.has(size) ? size : undefined;
    const lensFeel = pick(LENSES, camera?.lensFeel);
    const cameraSpeed = pick(SPEEDS, camera?.speed) ?? pick(SPEEDS, raw.motionLevel);
    const cameraPrecision = raw.contentType === 'camera_control' || (Boolean(cameraMove) && cameraMove !== 'static');
    return {
        ...(cameraAngle ? { cameraAngle } : {}),
        ...(cameraMove ? { cameraMove } : {}),
        ...(shotSize ? { shotSize } : {}),
        ...(lensFeel ? { lensFeel } : {}),
        ...(cameraSpeed ? { cameraSpeed } : {}),
        cameraPrecision,
    };
}
//# sourceMappingURL=camera.js.map