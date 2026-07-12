import type { WorldAttachContext, WorldRenderContext, WorldSystem, WorldSystemDefinition } from './worldSystem';
import { WaterView } from '../view/waterView';

export type WaterSurfaceOptions = {
  deep: number;
  face: number;
  horizon: number;
  foam: number;
};

class WaterSystem implements WorldSystem {
  readonly id = 'water';
  private view?: WaterView;

  constructor(private readonly options: WaterSurfaceOptions) {}

  attach({ scene, environment }: WorldAttachContext) {
    this.view = new WaterView(this.options, environment.sunDirection);
    scene.add(this.view.mesh);
  }

  render({ centerX, centerZ, time, world }: WorldRenderContext) {
    this.view?.update(centerX, centerZ, time, world.waterObstacles());
  }

  dispose() {
    this.view = undefined;
  }
}

export function oceanSurface(options: WaterSurfaceOptions): WorldSystemDefinition {
  return { create: () => new WaterSystem(options) };
}
