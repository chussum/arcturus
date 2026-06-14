import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { PortProbeService } from './port-probe.service';

describe('PortProbeService', () => {
  test('reports a free port as free', async () => {
    // Grab an ephemeral port from the OS, release it, then probe it.
    const port = await new Promise<number>((resolve) => {
      const server = net.createServer();
      server.listen({ host: '0.0.0.0', port: 0 }, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });

    expect(await new PortProbeService().isFree(port)).toBe(true);
  });

  test('reports a port held by another listener as taken', async () => {
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen({ host: '0.0.0.0', port: 0 }, () => {
        resolve((server.address() as net.AddressInfo).port);
      });
    });

    try {
      expect(await new PortProbeService().isFree(port)).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
