import { Module } from '@nestjs/common';
import { ContainerRuntimeModule } from '../../infrastructure/container-runtime/container-runtime.module';
import { CryptoModule } from '../../infrastructure/crypto/crypto.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { PortAllocatorService } from '../deployments/port-allocator.service';
import { PortProbeService } from '../deployments/port-probe.service';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { ContainerStateReconciler } from './container-state.reconciler';
import { EnvEncryptionMigrator } from './env-encryption.migrator';

@Module({
  imports: [PersistenceModule, StorageModule, AuthModule, ContainerRuntimeModule, CryptoModule],
  controllers: [AppsController],
  // PortProbe/PortAllocator are stateless; registering them here (rather than importing
  // DeploymentsModule, which already imports AppsModule) avoids a circular module dependency.
  providers: [
    AppsService,
    ContainerStateReconciler,
    EnvEncryptionMigrator,
    PortAllocatorService,
    PortProbeService,
  ],
  exports: [AppsService],
})
export class AppsModule {}
