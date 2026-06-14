import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { AdminSeeder } from './admin.seeder';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PersistenceModule, AuthModule, AppsModule],
  controllers: [UsersController],
  providers: [UsersService, AdminSeeder],
})
export class UsersModule {}
