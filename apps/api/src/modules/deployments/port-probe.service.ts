import net from 'node:net';
import { Injectable } from '@nestjs/common';

/**
 * Checks whether a host port is actually bindable right now. The DB only
 * knows about this instance's own apps — on a shared machine (several
 * Arcturus instances under different OS accounts, or arbitrary processes)
 * a pool port can be taken by someone we cannot see.
 */
@Injectable()
export class PortProbeService {
  isFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
        server.close(() => resolve(true));
      });
    });
  }
}
