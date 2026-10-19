/** Entrypoint für das Browser-Bundle: exportiert die Viewer-API. */
export {
  login,
  logout,
  fetch,
  handleIncomingRedirect,
  getDefaultSession,
} from "@inrupt/solid-client-authn-browser";
export { getSolidDataset, solidDatasetAsTurtle } from "@inrupt/solid-client";
export { default as SHACLValidator } from "rdf-validate-shacl";
import Parser from "@rdfjs/parser-n3";
export { Parser };
