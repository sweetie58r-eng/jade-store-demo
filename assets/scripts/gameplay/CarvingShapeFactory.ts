import { CarvingShapeConfig } from '../config/GameConfigTypes';
import { CarvingShapeGeometry } from '../data/CarvingTypes';
import { Vec2Data } from '../data/JadeTypes';
import { pointInPolygon, polygonArea } from '../core/geometry/Polygon2D';

export class CarvingShapeFactory {
  public static createGeometry(shape: CarvingShapeConfig, sampleCellSize: number): CarvingShapeGeometry {
    const outerPolygon = createOuterPolygon(shape);
    const innerPolygon = shape.shapeKind === 'ring' ? createEllipsePolygon(shape.geometry.width * getInnerRatio(shape), shape.geometry.height * getInnerRatio(shape), 56) : undefined;
    const localSamples = createLocalSamples(outerPolygon, innerPolygon, Math.max(5, sampleCellSize));
    const innerArea = innerPolygon ? polygonArea(innerPolygon) : 0;

    return {
      outerPolygon,
      innerPolygon,
      localSamples,
      approximateArea: Math.max(0, polygonArea(outerPolygon) - innerArea)
    };
  }
}

function createOuterPolygon(shape: CarvingShapeConfig): Vec2Data[] {
  const width = shape.geometry.width;
  const height = shape.geometry.height;

  switch (shape.geometry.polygonPreset) {
    case 'circle':
    case 'ellipse':
    case 'ring':
      return createEllipsePolygon(width, height, 56);
    case 'rounded_rect':
      return createRoundedRectPolygon(width, height, shape.geometry.cornerRadius ?? 4);
    case 'pixiu_silhouette':
      return scalePreset(
        [
          [-0.48, -0.05],
          [-0.35, -0.28],
          [-0.05, -0.36],
          [0.2, -0.28],
          [0.46, -0.12],
          [0.5, 0.08],
          [0.28, 0.24],
          [0.05, 0.32],
          [-0.22, 0.26],
          [-0.42, 0.12]
        ],
        width,
        height
      );
    case 'buddha_guanyin_silhouette':
      return scalePreset(
        [
          [0, 0.5],
          [0.22, 0.36],
          [0.32, 0.14],
          [0.24, -0.32],
          [0.08, -0.5],
          [-0.1, -0.5],
          [-0.26, -0.28],
          [-0.32, 0.12],
          [-0.22, 0.36]
        ],
        width,
        height
      );
    case 'cabbage_silhouette':
      return scalePreset(
        [
          [-0.18, 0.5],
          [0.18, 0.46],
          [0.38, 0.22],
          [0.3, -0.12],
          [0.16, -0.44],
          [-0.08, -0.5],
          [-0.34, -0.24],
          [-0.42, 0.16]
        ],
        width,
        height
      );
    case 'landscape_silhouette':
      return scalePreset(
        [
          [-0.5, -0.3],
          [-0.38, 0.08],
          [-0.24, 0.22],
          [-0.05, 0.08],
          [0.12, 0.34],
          [0.34, 0.2],
          [0.5, -0.08],
          [0.42, -0.34],
          [0.04, -0.42],
          [-0.28, -0.38]
        ],
        width,
        height
      );
    default:
      return createEllipsePolygon(width, height, 40);
  }
}

function createEllipsePolygon(width: number, height: number, segmentCount: number): Vec2Data[] {
  const points: Vec2Data[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (Math.PI * 2 * index) / segmentCount;
    points.push({
      x: Math.cos(angle) * width * 0.5,
      y: Math.sin(angle) * height * 0.5
    });
  }

  return points;
}

function createRoundedRectPolygon(width: number, height: number, radius: number): Vec2Data[] {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const cornerRadius = Math.min(radius, halfWidth, halfHeight);
  const points: Vec2Data[] = [];
  const corners = [
    { x: halfWidth - cornerRadius, y: halfHeight - cornerRadius, start: 0 },
    { x: -halfWidth + cornerRadius, y: halfHeight - cornerRadius, start: Math.PI * 0.5 },
    { x: -halfWidth + cornerRadius, y: -halfHeight + cornerRadius, start: Math.PI },
    { x: halfWidth - cornerRadius, y: -halfHeight + cornerRadius, start: Math.PI * 1.5 }
  ];

  for (const corner of corners) {
    for (let step = 0; step <= 4; step += 1) {
      const angle = corner.start + (Math.PI * 0.5 * step) / 4;
      points.push({
        x: corner.x + Math.cos(angle) * cornerRadius,
        y: corner.y + Math.sin(angle) * cornerRadius
      });
    }
  }

  return points;
}

function scalePreset(rawPoints: number[][], width: number, height: number): Vec2Data[] {
  return rawPoints.map(([x, y]) => ({
    x: x * width,
    y: y * height
  }));
}

function createLocalSamples(outerPolygon: Vec2Data[], innerPolygon: Vec2Data[] | undefined, sampleCellSize: number): Vec2Data[] {
  const bounds = getLocalBounds(outerPolygon);
  const samples: Vec2Data[] = [];

  for (let y = bounds.minY; y <= bounds.maxY; y += sampleCellSize) {
    for (let x = bounds.minX; x <= bounds.maxX; x += sampleCellSize) {
      const point = { x, y };
      if (pointInPolygon(point, outerPolygon) && (!innerPolygon || !pointInPolygon(point, innerPolygon))) {
        samples.push(point);
      }
    }
  }

  return samples;
}

function getLocalBounds(points: Vec2Data[]): { minX: number; minY: number; maxX: number; maxY: number } {
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

function getInnerRatio(shape: CarvingShapeConfig): number {
  return shape.geometry.innerRadiusRatio ?? 0.45;
}
