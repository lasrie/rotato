import toCanonical from 'rdf-dataset-ext/toCanonical.js';
import toStream from 'rdf-dataset-ext/toStream.js';
import fromStream from 'rdf-dataset-ext/fromStream.js';
import { Dataset as SimplerDataset } from './Dataset.js';
import { serialize } from './serialize.js';
export function createConstructor(env) {
    return class extends SimplerDataset {
        import(...[stream]) {
            return fromStream(this, stream);
        }
        toCanonical() {
            return toCanonical(this);
        }
        toStream() {
            return toStream(this);
        }
        async serialize(args) {
            return serialize(env, this, args);
        }
    };
}
