import Environment from './Environment.js';
import DatasetFactory from './lib/DatasetFactoryExt.js';
import parent from './lib/env-no-dataset.js';
import { createConstructor } from './lib/DatasetExt.js';
export function create() {
    return new Environment([DatasetFactory(createConstructor)], { parent });
}
export default create();
