export interface RunContainerOptions {
  /** Stable platform-managed name, e.g. arcturus--alice--blog. */
  name: string;
  /** Owning app id, stamped as a Docker label so orphan containers can be swept. */
  appId: string;
  imageTag: string;
  /** Host port published on 0.0.0.0; the container's PORT env tells the app where to listen. */
  hostPort: number;
  containerPort: number;
  env: Record<string, string>;
  /** Memory cap in bytes for this container. */
  memoryBytes: number;
  /** When set (e.g. "1000:1000"), forces the container to run as this user instead of the image default. */
  user?: string;
}

/** Optional resource caps applied during an image build. */
export interface BuildLimits {
  /** Memory cap in bytes for the build. */
  memoryBytes: number;
}

export type ContainerState = 'running' | 'stopped' | 'missing';

/**
 * Boundary to whatever runs the containers (DIP): deploy strategies and app
 * lifecycle code depend on this contract, not on Docker specifics.
 */
export abstract class ContainerRuntime {
  /** Builds an image from a directory containing a Dockerfile, streaming build output. */
  abstract buildImage(
    contextDir: string,
    imageTag: string,
    onOutput: (line: string) => void,
    limits?: BuildLimits,
  ): Promise<void>;

  /** Starts a fresh container, replacing any existing one with the same name. */
  abstract runContainer(options: RunContainerOptions): Promise<string>;

  /**
   * Lists all platform-managed containers (by the arcturus.managed label),
   * regardless of running state, so boot reconciliation can sweep orphans whose
   * owning app row has been deleted. `appId` is null for legacy containers
   * created before labels existed (those are never swept).
   */
  abstract listManaged(): Promise<{ id: string; appId: string | null }[]>;

  abstract stopContainer(containerId: string): Promise<void>;
  abstract startContainer(containerId: string): Promise<void>;
  abstract removeContainer(containerId: string): Promise<void>;
  abstract getState(containerId: string): Promise<ContainerState>;

  /** Removes an image by tag, tolerating its absence. */
  abstract removeImage(imageTag: string): Promise<void>;
  abstract imageExists(imageTag: string): Promise<boolean>;

  /**
   * Follows container stdout/stderr; returns an unsubscribe function.
   * `onEnd` fires once when the stream closes on its own (container stopped),
   * not when the caller unsubscribes.
   */
  abstract streamLogs(
    containerId: string,
    onLine: (line: string) => void,
    onEnd?: () => void,
  ): Promise<() => void>;
}
