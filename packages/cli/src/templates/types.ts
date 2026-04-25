export const genTypesTemplate = () => `import * as schema from "../schema";
import type { EdgePodContext } from "@edgepod/server";

export type Ctx = EdgePodContext<typeof schema>;
`;
