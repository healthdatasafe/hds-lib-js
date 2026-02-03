import { HDSModel } from './HDSModel';
import { HDSService } from '../HDSService';

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

/**
 * Initialized model singleton
 */
export async function initHDSModel (): Promise<HDSModel> {
  if (!hdsModelInstance) {
    getModel();
  }
  if (!hdsModelInstance!.isLoaded) {
    const service = new HDSService();
    const serviceInfo = await service.info();
    await hdsModelInstance!.load(serviceInfo.assets['hds-model']);
  }
  return hdsModelInstance!;
}
