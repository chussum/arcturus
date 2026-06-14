import { Module } from '@nestjs/common';
import { ContainerRuntimeModule } from '../../infrastructure/container-runtime/container-runtime.module';
import { CryptoModule } from '../../infrastructure/crypto/crypto.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';
import { ContainerStateReconciler } from './container-state.reconciler';
import { EnvEncryptionMigrator } from './env-encryption.migrator';

@Module({
  imports: [PersistenceModule, StorageModule, AuthModule, ContainerRuntimeModule, CryptoModule],
  controllers: [AppsController],
  providers: [AppsService, ContainerStateReconciler, EnvEncryptionMigrator],
  exports: [AppsService],
})
export class AppsModule {}
