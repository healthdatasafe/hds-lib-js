import HDSModel from './HDSModel';
import { HDSService } from '../HDSService';

let model: HDSModel | null = null;

export function getModel (): HDSModel {
  if (model == null) {
    model = new HDSModel('');
  }
  return model;
}

/**
 * Mostly used during test to unload model
 */
export function resetModel (): void {
  model = null;
}

/**
 * Initialized model singleton
 */
export async function initHDSModel (): Promise<HDSModel> {
  if (!model) {
    getModel();
  }
  if (!model!.isLoaded) {
    const service = new HDSService();
    const serviceInfo = await service.info();
    await model!.load(serviceInfo.assets['hds-model']);
  }
  return model!;
}
