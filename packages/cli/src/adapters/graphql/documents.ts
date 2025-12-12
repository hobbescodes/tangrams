/**
 * GraphQL document loading and parsing
 * This is a re-export from the core module for use within the adapter
 */
export {
  type ParsedDocuments,
  type ParsedFragment,
  type ParsedOperation,
  getFragmentDependencies,
  loadDocuments,
} from "@/core/documents";
