import type { Camera, Point } from '../model/types';

export function clampBoardCamera(camera: Camera): Camera {
  return { ...camera, x: Math.min(0, camera.x), y: Math.min(0, camera.y) };
}

export function clampBoardPoint(point: Point): Point {
  return { x: Math.max(0, point.x), y: Math.max(0, point.y) };
}
