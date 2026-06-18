import { Vec2Data } from '../../data/JadeTypes';

export function polygonArea(points: Vec2Data[]): number {
  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) * 0.5;
}

export function pointInPolygon(point: Vec2Data, polygon: Vec2Data[]): boolean {
  let inside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = current.y > point.y !== previous.y > point.y;

    if (crosses) {
      const intersectX = ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
      if (point.x < intersectX) {
        inside = !inside;
      }
    }
  }

  return inside;
}

export function getBounds(points: Vec2Data[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}

export function smoothClosedPolygon(points: Vec2Data[], passes: number): Vec2Data[] {
  let result = points;

  for (let pass = 0; pass < passes; pass += 1) {
    const smoothed: Vec2Data[] = [];

    for (let index = 0; index < result.length; index += 1) {
      const current = result[index];
      const next = result[(index + 1) % result.length];
      smoothed.push({
        x: current.x * 0.75 + next.x * 0.25,
        y: current.y * 0.75 + next.y * 0.25
      });
      smoothed.push({
        x: current.x * 0.25 + next.x * 0.75,
        y: current.y * 0.25 + next.y * 0.75
      });
    }

    result = smoothed;
  }

  return result;
}
