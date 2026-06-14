import { Module } from '@nestjs/common';
import { ContainerRuntimeModule } from '../../infrastructure/container-runtime/container-runtime.module';
import { CryptoModule } from '../../infrastructure/crypto/crypto.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';
import { ContainerDeployStrategy } from './pipeline/container-deploy.strategy';
import { DEPLOY_STRATEGIES, DeployStrategy } from './pipeline/deploy-strategy';
import { StaticDeployStrategy } from './pipeline/static-deploy.strategy';
import { PortAllocatorService } from './port-allocator.service';
import { PortProbeService } from './port-probe.service';

@Module({
  imports: [
    PersistenceModule,
    StorageModule,
    AuthModule,
    ContainerRuntimeModule,
    CryptoModule,
    AppsModule,
  ],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsService,
    PortAllocatorService,
    PortProbeService,
    StaticDeployStrategy,
    ContainerDeployStrategy,
    {
      provide: DEPLOY_STRATEGIES,
      inject: [StaticDeployStrategy, ContainerDeployStrategy],
      useFactory: (...strategies: DeployStrategy[]) => strategies,
    },
  ],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
