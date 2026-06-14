import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ContainerProxyService } from './container-proxy.service';
import { DashboardUpstreamService } from './dashboard-upstream.service';
import { GatewayMiddleware } from './gateway.middleware';
import { RouteResolverService } from './route-resolver.service';

@Module({
  imports: [PersistenceModule, StorageModule],
  providers: [
    RouteResolverService,
    ContainerProxyService,
    DashboardUpstreamService,
    GatewayMiddleware,
  ],
  exports: [RouteResolverService],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GatewayMiddleware).forRoutes('{*splat}');
  }
}
