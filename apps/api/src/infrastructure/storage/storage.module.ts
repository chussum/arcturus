import { Module } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { StaticSitesService } from './static-sites.service';

@Module({
  providers: [ArchiveService, StaticSitesService],
  exports: [ArchiveService, StaticSitesService],
})
export class StorageModule {}
