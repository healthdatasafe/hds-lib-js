import { localizeText } from './localizeText';
import * as settings from './settings';
import { pryv } from './patchedPryv';
import { HDSModel } from './HDSModel/HDSModel';
import * as appTemplates from './appTemplates/appTemplates';
import * as logger from './logger';
import { HDSService } from './HDSService';
import * as HDSModelInitAndSingleton from './HDSModel/HDSModelInitAndSingleton';
import * as toolkit from './toolkit';
export declare const model: HDSModel;
export declare const getHDSModel: typeof HDSModelInitAndSingleton.getModel;
export declare const initHDSModel: typeof HDSModelInitAndSingleton.initHDSModel;
export { pryv, settings, HDSService, HDSModel, appTemplates, localizeText, localizeText as l, toolkit, logger };
declare const HDSLib: {
    getHDSModel: typeof HDSModelInitAndSingleton.getModel;
    initHDSModel: typeof HDSModelInitAndSingleton.initHDSModel;
    pryv: typeof pryv;
    settings: typeof settings;
    HDSService: typeof HDSService;
    HDSModel: typeof HDSModel;
    appTemplates: typeof appTemplates;
    localizeText: typeof localizeText;
    l: typeof localizeText;
    toolkit: typeof toolkit;
    logger: typeof logger;
};
export default HDSLib;
//# sourceMappingURL=index.d.ts.map