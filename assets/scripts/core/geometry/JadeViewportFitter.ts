import { JadePieceData, Vec2Data } from '../../data/JadeTypes';
import { getBounds, polygonArea } from './Polygon2D';

export interface JadeViewportFitOptions {
  targetWidth: number;
  targetHeight: number;
  centerX: number;
  centerY: number;
  padding: number;
}

export function fitJadeToViewport(jade: JadePieceData, options: JadeViewportFitOptions): JadePieceData {
  const bounds = getBounds(jade.outlinePolygon);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((options.targetWidth - options.padding * 2) / width, (options.targetHeight - options.padding * 2) / height);
  const sourceCenter = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5
  };

  const transformPoint = (point: Vec2Data): Vec2Data => ({
    x: (point.x - sourceCenter.x) * scale + options.centerX,
    y: (point.y - sourceCenter.y) * scale + options.centerY
  });

  const outlinePolygon = jade.outlinePolygon.map(transformPoint);

  return {
    ...jade,
    outlinePolygon,
    area: polygonArea(outlinePolygon),
    colorRegions: jade.colorRegions.map((region) => ({
      ...region,
      center: transformPoint(region.center),
      radiusX: region.radiusX * scale,
      radiusY: region.radiusY * scale
    })),
    cracks: jade.cracks.map((crack) => ({
      ...crack,
      points: crack.points.map(transformPoint),
      width: crack.width * scale
    })),
    sampleGrid: jade.sampleGrid.map((sample) => ({
      ...sample,
      ...transformPoint(sample)
    })),
    sampleCellSize: jade.sampleCellSize * scale
  };
}
