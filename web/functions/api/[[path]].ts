import type { PagesEnv } from "../../env";

export const onRequest: PagesFunction<PagesEnv> = ({ request, env }) => env.API.fetch(request);
