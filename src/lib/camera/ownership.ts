export function cameraChunkAllowed(sessionUserId: string, callerId: string): boolean {
  return sessionUserId.length > 0 && sessionUserId === callerId
}
