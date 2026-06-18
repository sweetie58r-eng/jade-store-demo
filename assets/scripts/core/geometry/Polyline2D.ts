import { Vec2Data } from '../../data/JadeTypes';

export function distancePointToPolyline(point: Vec2Data, polyline: Vec2Data[]): number {
  if (polyline.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    bestDistance = Math.min(bestDistance, distancePointToSegment(point, polyline[index], polyline[index + 1]));
  }

  return bestDistance;
}

function distancePointToSegment(point: Vec2Data, start: Vec2Data, end: Vec2Data): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t
  };

  return Math.hypot(point.x - closest.x, point.y - closest.y);
}
