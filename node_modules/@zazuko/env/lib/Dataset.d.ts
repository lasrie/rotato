import DatasetCore from '@rdfjs/dataset/DatasetCore.js';
import addAll from 'rdf-dataset-ext/addAll.js';
import deleteMatch from 'rdf-dataset-ext/deleteMatch.js';
import equals from 'rdf-dataset-ext/equals.js';
import type * as Rdf from '@rdfjs/types';
type Rest<A extends unknown[]> = A extends [unknown, ...infer U] ? U : never;
export interface DatasetCtor<D extends Rdf.DatasetCore> {
    new (quads?: Rdf.Quad[]): D;
}
export declare class Dataset extends DatasetCore {
    addAll(...[quads]: Rest<Parameters<typeof addAll>>): this;
    deleteMatches(...args: Rest<Parameters<typeof deleteMatch>>): this;
    equals(...[other]: Rest<Parameters<typeof equals>>): boolean;
    forEach(callback: (quad: Rdf.Quad, dataset: typeof this) => void): void;
    filter(filter: (quad: Rdf.Quad, dataset: typeof this) => boolean): this;
    map(callback: (quad: Rdf.Quad, dataset: typeof this) => Rdf.Quad): this;
    match(...args: Parameters<DatasetCore['match']>): this;
    merge(...[other]: Rest<Parameters<typeof addAll>>): this;
}
export {};
//# sourceMappingURL=Dataset.d.ts.map