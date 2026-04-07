import { HDSModel } from './HDSModel.ts';
import { HDSService } from '../HDSService.ts';
import type { HDSModelOverload } from './HDSModel-Overload.ts';

let hdsModelInstance: HDSModel | null = null;

export function getModel (): HDSModel {
  if (hdsModelInstance == null) {
    hdsModelInstance = new HDSModel('');
  }
  return hdsModelInstance;
}

/**
 * Mostly used during test to unload model
 */
export function resetModel (): void {
  hdsModelInstance = null;
}

export interface InitHDSModelOptions {
  /**
   * Optional overload merged into the loaded model before freeze. Lets the
   * app add or refine items / streams / eventTypes / settings without
   * forking the data-model. See {@link HDSModelOverload}.
   */
  overload?: HDSModelOverload;
}

/**
 * Initialized model singleton
 */
export async function initHDSModel (opts: InitHDSModelOptions = {}): Promise<HDSModel> {
  if (!hdsModelInstance) {
    getModel();
  }
  if (!hdsModelInstance!.isLoaded) {
    const service = new HDSService();
    const serviceInfo = await service.info();
    hdsModelInstance!.assets = serviceInfo.assets;
    await hdsModelInstance!.load(serviceInfo.assets['hds-model'], opts.overload ?? null);
  }
  return hdsModelInstance!;
}
