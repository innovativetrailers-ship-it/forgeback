/** Single source of truth for BullMQ queue names — producer and consumer must match. */
export const RENDER_QUEUE_NAME = 'render' as const
export const TRAINING_QUEUE_NAME = 'training' as const
export const EXPORT_QUEUE_NAME = 'export' as const
