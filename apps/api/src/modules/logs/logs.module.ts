import { Module } from '@nestjs/common';
import { ContainerRuntimeModule } from '../../infrastructure/container-runtime/container-runtime.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { DeploymentsModule } from '../deployments/deployments.module';
import { LogsController } from './logs.controller';

@Module({
  imports: [PersistenceModule, AppsModule, DeploymentsModule, AuthModule, ContainerRuntimeModule],
  controllers: [LogsController],
})
export class LogsModule {}
