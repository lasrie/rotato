/** Entrypoint für das Browser-Bundle: exportiert die Viewer-API. */
import E from "@rdfjs/environment";
import DataFactory from "@rdfjs/data-model/Factory.js";
import DatasetFactory from "@rdfjs/dataset/Factory.js";
import TermMapFactory from "@rdfjs/term-map/Factory.js";
import NamespaceFactory from "@rdfjs/namespace/Factory.js";
import ClownfaceFactory from "clownface/Factory.js";

export {
  login,
  logout,
  fetch,
  handleIncomingRedirect,
  getDefaultSession,
} from "@inrupt/solid-client-authn-browser";
export { getSolidDataset, solidDatasetAsTurtle } from "@inrupt/solid-client";
export { default as SHACLValidator } from "rdf-validate-shacl";
export { Parser as N3Parser } from "n3";

/** rdfjs-Environment für Browser-SHACL (wie rdf-validate-shacl defaultEnv, ohne Node-Streams). */
export const rdfEnv = new E([
  DataFactory,
  DatasetFactory,
  TermMapFactory,
  NamespaceFactory,
  ClownfaceFactory,
]);
