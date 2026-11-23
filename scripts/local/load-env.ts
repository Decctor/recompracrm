/**
 * Side-effect module. Import it FIRST in every local script that touches app code: it replaces the
 * process environment with `.env.localdb`, refuses a non-local database, and blocks outbound
 * connections — all before `@/services/drizzle` (or anything else) reads `process.env`.
 */
import { installLocalNetworkGuard } from "../../lib/local-dev/network-guard";
import { applyLocalEnv } from "./env";

applyLocalEnv();
installLocalNetworkGuard();
