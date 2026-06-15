import type { PortUnavailableReason } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { PortProbeService } from './port-probe.service';

/** Lowest non-privileged port; below this a non-root process can't bind anyway. */
const MIN_MANUAL_PORT = 1024;
const MAX_MANUAL_PORT = 65535;

export interface PortAvailability {
  available: boolean;
  reason?: PortUnavailableReason;
}

/**
 * Hands out fixed host ports from the configured pool. A port sticks to its
 * app for the app's whole life (persisted on the app row), so the dedicated
 * URL http://host:PORT/ stays stable across redeploys or server restarts.
 *
 * Candidates must pass two checks: not assigned in our own DB, and actually
 * bindable on the host (other Arcturus instances on the same machine have
 * their own DBs, so the DB alone can't see their ports). The scan starts at
 * a random offset so two instances deploying at the same moment are unlikely
 * to race for the same port.
 */
@Injectable()
export class PortAllocatorService {
  constructor(
    private readonly config: AppConfig,
    private readonly apps: AppsRepository,
    private readonly probe: PortProbeService,
  ) {}

  async allocate(): Promise<number> {
    const { portPoolStart: start, portPoolEnd: end } = this.config;
    const poolSize = end - start + 1;
    const taken = new Set(await this.apps.listAssignedPorts());
    const offset = Math.floor(Math.random() * poolSize);

    for (let i = 0; i < poolSize; i++) {
      const port = start + ((offset + i) % poolSize);
      if (taken.has(port)) continue;
      if (await this.probe.isFree(port)) return port;
    }
    throw new Error(
      `Port pool exhausted (${start}-${end}); delete unused apps or widen ARCTURUS_PORT_POOL_*`,
    );
  }

  /**
   * Validates a user-supplied host port for manual assignment. Unlike `allocate`
   * the port can sit anywhere in 1024–65535, not just the pool — the live host
   * bind probe is what keeps it safe. The app's own current port is always
   * acceptable (no-op) and is skipped from the probe, since its own outgoing
   * container legitimately still holds it (same false-positive that bans a
   * sticky pre-probe on redeploy).
   */
  async validateManualPort(port: number, currentPort: number | null): Promise<PortAvailability> {
    if (port === currentPort) return { available: true };
    if (!Number.isInteger(port) || port < MIN_MANUAL_PORT || port > MAX_MANUAL_PORT) {
      return { available: false, reason: 'outOfRange' };
    }
    if (port === this.config.gatewayPort || port === this.config.appsPort) {
      return { available: false, reason: 'reserved' };
    }
    const taken = new Set(await this.apps.listAssignedPorts());
    if (taken.has(port)) return { available: false, reason: 'taken' };
    if (!(await this.probe.isFree(port))) return { available: false, reason: 'taken' };
    return { available: true };
  }
}
