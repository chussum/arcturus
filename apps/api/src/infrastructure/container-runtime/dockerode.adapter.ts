import fs from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import {
  type BuildLimits,
  ContainerRuntime,
  type ContainerState,
  type RunContainerOptions,
} from './container-runtime.port';

/** Conservative defaults so one team app cannot starve the shared server. */
const NANO_CPUS = 2_000_000_000; // 2 CPUs
const PIDS_LIMIT = 256; // fork-bomb guard
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * All deployed apps share one user-defined bridge with inter-container
 * communication disabled, so a malicious app cannot reach other tenants'
 * containers (the default bridge lets every container talk to every other).
 * Outbound egress still works through the bridge's NAT.
 */
const APP_NETWORK = 'arcturus-apps';

/** Marks every container we create so boot reconciliation can find/sweep them. */
const MANAGED_LABEL = 'arcturus.managed';
const APP_ID_LABEL = 'arcturus.app-id';

@Injectable()
export class DockerodeContainerRuntime extends ContainerRuntime {
  private readonly logger = new Logger(DockerodeContainerRuntime.name);
  private readonly docker = new Docker();

  async buildImage(
    contextDir: string,
    imageTag: string,
    onOutput: (line: string) => void,
    limits?: BuildLimits,
  ): Promise<void> {
    // Untrusted Dockerfiles build here: cap build memory and place the build on
    // the ICC-off app bridge so a RUN step can't reach other tenants' containers
    // (network is kept so dependency installs still work). networkmode is honored
    // by the classic builder; BuildKit ignores it, but the memory cap still applies.
    await this.ensureAppNetwork();
    const stream = await this.docker.buildImage(
      { context: contextDir, src: fs.readdirSync(contextDir) },
      {
        t: imageTag,
        networkmode: APP_NETWORK,
        ...(limits ? { memory: limits.memoryBytes, memswap: limits.memoryBytes } : {}),
      },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Destroy the daemon connection too — rejecting alone would leave the
        // build running (and consuming the host) behind an abandoned promise.
        (stream as unknown as { destroy?: () => void }).destroy?.();
        reject(new Error(`Image build timed out after ${BUILD_TIMEOUT_MS / 60000} minutes`));
      }, BUILD_TIMEOUT_MS);

      this.docker.modem.followProgress(
        stream,
        (error, results) => {
          clearTimeout(timeout);
          if (error) return reject(error);
          // Docker reports build failures as an error item in the result list.
          const failure = results?.find(
            (item): item is { error: string } =>
              typeof item === 'object' && item !== null && 'error' in item,
          );
          if (failure) return reject(new Error(failure.error));
          resolve();
        },
        (event) => {
          const text: unknown = event?.stream ?? event?.status;
          if (typeof text === 'string' && text.trim()) onOutput(text.trimEnd());
        },
      );
    });
  }

  async runContainer(options: RunContainerOptions): Promise<string> {
    await this.removeByName(options.name);
    await this.ensureAppNetwork();

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.imageTag,
      Env: Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      // Stamp ownership so a deleted app's container can be swept on next boot
      // even if best-effort cleanup failed (RestartPolicy keeps it alive forever).
      Labels: { [MANAGED_LABEL]: 'true', [APP_ID_LABEL]: options.appId },
      ExposedPorts: { [`${options.containerPort}/tcp`]: {} },
      // Empty string honors the image's own USER; a set value (ARCTURUS_CONTAINER_USER)
      // forces a non-root user as a hardening opt-in.
      ...(options.user ? { User: options.user } : {}),
      HostConfig: {
        PortBindings: {
          [`${options.containerPort}/tcp`]: [
            { HostIp: '0.0.0.0', HostPort: `${options.hostPort}` },
          ],
        },
        Memory: options.memoryBytes,
        NanoCpus: NANO_CPUS,
        PidsLimit: PIDS_LIMIT,
        RestartPolicy: { Name: 'unless-stopped' },
        // Run untrusted app code with the floor of privileges: drop every Linux
        // capability and block privilege escalation (setuid binaries, sudo).
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        NetworkMode: APP_NETWORK,
      },
    });
    await container.start();
    return container.id;
  }

  async listManaged(): Promise<{ id: string; appId: string | null }[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${MANAGED_LABEL}=true`] },
    });
    return containers.map((c) => ({ id: c.Id, appId: c.Labels?.[APP_ID_LABEL] ?? null }));
  }

  /** Idempotently creates the shared app bridge with inter-container comms off. */
  private async ensureAppNetwork(): Promise<void> {
    try {
      await this.docker.getNetwork(APP_NETWORK).inspect();
      return;
    } catch (error) {
      if (!isStatusCode(error, 404)) throw error;
    }
    try {
      await this.docker.createNetwork({
        Name: APP_NETWORK,
        Driver: 'bridge',
        // Disable inter-container connectivity so tenants are isolated from each other.
        Options: { 'com.docker.network.bridge.enable_icc': 'false' },
      });
    } catch (error) {
      // A concurrent deploy may have created it first; tolerate the conflict.
      if (!isStatusCode(error, 409)) throw error;
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      await this.docker.getContainer(containerId).stop({ t: 10 });
    } catch (error) {
      if (!isStatusCode(error, 304, 404)) throw error; // 304: already stopped
    }
  }

  async startContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).start();
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      await this.docker.getContainer(containerId).remove({ force: true });
    } catch (error) {
      if (!isStatusCode(error, 404)) throw error;
    }
  }

  async getState(containerId: string): Promise<ContainerState> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.State.Running ? 'running' : 'stopped';
    } catch (error) {
      if (isStatusCode(error, 404)) return 'missing';
      throw error;
    }
  }

  async removeImage(imageTag: string): Promise<void> {
    try {
      await this.docker.getImage(imageTag).remove({ force: true });
    } catch (error) {
      if (!isStatusCode(error, 404)) throw error;
    }
  }

  async imageExists(imageTag: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageTag).inspect();
      return true;
    } catch (error) {
      if (isStatusCode(error, 404)) return false;
      throw error;
    }
  }

  async streamLogs(
    containerId: string,
    onLine: (line: string) => void,
    onEnd?: () => void,
  ): Promise<() => void> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
    });

    // Docker closes a follow stream when the container stops; signal that once,
    // but never for an unsubscribe (the caller already walked away).
    let unsubscribed = false;
    let ended = false;
    const finish = () => {
      if (ended || unsubscribed) return;
      ended = true;
      onEnd?.();
    };

    stream.on('data', (chunk: Buffer) => {
      for (const line of demultiplexDockerLog(chunk)) onLine(line);
    });
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', (error) => {
      this.logger.warn(`log stream error: ${error.message}`);
      finish();
    });

    return () => {
      unsubscribed = true;
      // dockerode log streams expose destroy() even though typings say NodeJS.ReadableStream.
      (stream as unknown as { destroy(): void }).destroy();
    };
  }

  /** Removes a container by platform name, tolerating its absence. */
  private async removeByName(name: string): Promise<void> {
    try {
      await this.docker.getContainer(name).remove({ force: true });
    } catch (error) {
      if (!isStatusCode(error, 404)) throw error;
    }
  }
}

/**
 * Container streams use Docker's multiplexed format: an 8-byte header
 * (stream type + payload length) before each payload chunk.
 */
function demultiplexDockerLog(chunk: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;
  while (offset + 8 <= chunk.length) {
    const length = chunk.readUInt32BE(offset + 4);
    const payload = chunk.subarray(offset + 8, offset + 8 + length);
    lines.push(...payload.toString('utf8').split('\n').filter(Boolean));
    offset += 8 + length;
  }
  if (offset === 0 && chunk.length > 0) {
    // TTY mode containers stream raw text without headers.
    lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
  }
  return lines;
}

function isStatusCode(error: unknown, ...codes: number[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    codes.includes((error as { statusCode: number }).statusCode)
  );
}
