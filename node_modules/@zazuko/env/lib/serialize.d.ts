import type { Prefixes } from '@zazuko/prefixes/prefixes';
import type { Environment } from '@rdfjs/environment/Environment.js';
import type { FormatsFactory } from '@rdfjs/formats/Factory.js';
import type DatasetCore from '@rdfjs/dataset/DatasetCore.js';
import type { TermMapFactory } from '@rdfjs/term-map/Factory.js';
import type DataFactory from '@rdfjs/data-model/Factory.js';
import type { MediaType } from '../formats.js';
export interface SerializeArgs {
    format: MediaType;
    /**
     * Prefixes to be used in the serialization. Array values can be prefix known to `@zazuko/prefixes` or a custom prefix
     * pair
     */
    prefixes?: Array<keyof Prefixes | [string, string]>;
    renameBlankNodes?: boolean;
}
export declare function serialize(env: Environment<DataFactory | FormatsFactory | TermMapFactory>, dataset: DatasetCore, { renameBlankNodes, format, prefixes }: SerializeArgs): Promise<string>;
//# sourceMappingURL=serialize.d.ts.map