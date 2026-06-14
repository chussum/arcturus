import { Module } from '@nestjs/common';
import { EnvCryptoService } from './env-crypto.service';

@Module({
  providers: [EnvCryptoService],
  exports: [EnvCryptoService],
})
export class CryptoModule {}
