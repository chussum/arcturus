import { Module } from '@nestjs/common';
import { ContainerRuntime } from './container-runtime.port';
import { DockerodeContainerRuntime } from './dockerode.adapter';

@Module({
  providers: [{ provide: ContainerRuntime, useClass: DockerodeContainerRuntime }],
  exports: [ContainerRuntime],
})
export class ContainerRuntimeModule {}
