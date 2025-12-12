import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

export default source;
