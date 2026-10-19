import DatasetFactory from './lib/DatasetFactory.js';
import Environment from './Environment.js';
import parent from './lib/env-no-dataset.js';
import { Dataset } from './lib/Dataset.js';
export default new Environment([DatasetFactory(() => Dataset)], { parent });
