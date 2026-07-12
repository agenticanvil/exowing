import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TrailHistory } from './wingtipVortexView';

describe('TrailHistory', () => {
  it('keeps a bounded world-space path', () => {
    const history = new TrailHistory(3, 0, 100);
    for (let x = 0; x < 5; x++) history.push(new THREE.Vector3(x, x * 2, 0));
    expect(history.points.map((point) => point.x)).toEqual([2, 3, 4]);
  });

  it('drops points that would extend behind the camera', () => {
    const history = new TrailHistory(20, 0, 3);
    for (let x = 0; x < 6; x++) history.push(new THREE.Vector3(x, 0, 0));
    expect(history.points[0].x).toBe(2);
    expect(history.points.at(-1)?.x).toBe(5);
  });

  it('does not bridge a trail across a teleport', () => {
    const history = new TrailHistory(8, 0);
    history.push(new THREE.Vector3(0, 0, 0));
    history.push(new THREE.Vector3(20, 0, 0));
    expect(history.points).toHaveLength(1);
    expect(history.points[0].x).toBe(20);
  });
});
