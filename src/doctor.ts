// Setup check. Implemented in Phase 4 (US4).
import type { CliDeps } from './cli.js';

export async function runDoctorCommand(_args: { swiftbar: boolean }, deps: CliDeps): Promise<number> {
  deps.out('Setup check is not implemented yet.');
  return 1;
}
