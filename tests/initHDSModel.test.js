import { assert } from './test-utils/deps-node.js';
import { initHDSModel, pryv } from '../ts/index.ts';
import { resetModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

describe('[IHM] initHDSModel', function () {
  this.timeout(15000);

  const originalInfo = pryv.Service.prototype.info;

  afterEach(() => {
    pryv.Service.prototype.info = originalInfo;
  });

  after(async () => {
    // leave the singleton loaded for the files that follow
    resetModel();
    await initHDSModel();
  });

  for (const [label, assets] of [['no assets', undefined], ['no hds-model asset', { definitions: 'x' }]]) {
    it(`[IHM1] a service info with ${label} fails with an explicit error (B-2026-10-28-19)`, async () => {
      resetModel();
      pryv.Service.prototype.info = async () => ({ assets });
      await assert.rejects(initHDSModel(), (err) => {
        assert.match(err.message, /service info has no "hds-model" asset/);
        return true;
      });
    });
  }
});
