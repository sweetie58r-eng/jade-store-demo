import { Vec2Data } from '../../data/JadeTypes';

export function transformPoint(point: Vec2Data, position: Vec2Data, rotation: number, scale: number): Vec2Data {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaledX = point.x * scale;
  const scaledY = point.y * scale;

  return {
    x: position.x + scaledX * cos - scaledY * sin,
    y: position.y + scaledX * sin + scaledY * cos
  };
}

export function inverseTransformPoint(point: Vec2Data, position: Vec2Data, rotation: number, scale: number): Vec2Data {
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  return {
    x: (dx * cos - dy * sin) / scale,
    y: (dx * sin + dy * cos) / scale
  };
}
