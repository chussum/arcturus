import { Module } from '@nestjs/common';
import { CliDistController } from './cli-dist.controller';

@Module({
  controllers: [CliDistController],
})
export class CliDistModule {}
