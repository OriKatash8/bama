// Side-effect import: must be the FIRST import of a production-only probe. See probeTarget.mjs.
import { requireProbeTarget } from './probeTarget.mjs';
requireProbeTarget('prod');
