import toStream from 'rdf-dataset-ext/toStream.js';
import fromStream from 'rdf-dataset-ext/fromStream.js';
import type * as Rdf from '@rdfjs/types';
import type { Environment } from '@rdfjs/environment/Environment.js';
import type { FormatsFactory } from '@rdfjs/formats/Factory.js';
import type DataFactory from '@rdfjs/data-model/Factory.js';
import type { TermMapFactory } from '@rdfjs/term-map/Factory.js';
import { Dataset as SimplerDataset } from './Dataset.js';
import type { SerializeArgs } from './serialize.js';
type Rest<A extends unknown[]> = A extends [unknown, ...infer U] ? U : never;
export interface Dataset extends SimplerDataset {
    import(...[stream]: Rest<Parameters<typeof fromStream>>): Promise<Dataset>;
    toCanonical(): string;
    toStream(): ReturnType<typeof toStream>;
    /**
     * Returns the contents of this dataset in the selected RDF serialization.
     * This requires that the environment includes an appropriate serializer.
     * If it is not found, canonical n-quads are returned
     */
    serialize(args: SerializeArgs): Promise<string>;
}
export interface DatasetCtor {
    new (quads?: Rdf.Quad[]): Dataset;
}
export declare function createConstructor(env: Environment<FormatsFactory | DataFactory | TermMapFactory>): DatasetCtor;
export {};
//# sourceMappingURL=DatasetExt.d.ts.map