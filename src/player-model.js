export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export function playbackRate(value) {
  return PLAYBACK_RATES.includes(Number(value)) ? Number(value) : 1;
}
export function mediaTime(value) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function seekTime(value, duration) {
  return Math.min(Math.max(0, Number.isFinite(value) ? value : 0), Number.isFinite(duration) ? Math.max(0, duration) : 0);
}
