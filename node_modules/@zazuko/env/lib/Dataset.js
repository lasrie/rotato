/* eslint-disable @typescript-eslint/no-explicit-any */
import DatasetCore from '@rdfjs/dataset/DatasetCore.js';
import addAll from 'rdf-dataset-ext/addAll.js';
import deleteMatch from 'rdf-dataset-ext/deleteMatch.js';
import equals from 'rdf-dataset-ext/equals.js';
export class Dataset extends DatasetCore {
    addAll(...[quads]) {
        return addAll(this, quads);
    }
    deleteMatches(...args) {
        return deleteMatch(this, ...args);
    }
    equals(...[other]) {
        return equals(this, other);
    }
    forEach(callback) {
        Array.from(this).forEach(quad => callback(quad, this));
    }
    filter(filter) {
        return new this.constructor([...this].filter(quad => filter(quad, this)));
    }
    map(callback) {
        return new this.constructor([...this].map(quad => callback(quad, this)));
    }
    match(...args) {
        return super.match(...args);
    }
    merge(...[other]) {
        return addAll(new this.constructor([...this]), other);
    }
}
