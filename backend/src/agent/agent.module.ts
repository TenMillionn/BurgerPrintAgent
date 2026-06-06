import { Module } from '@nestjs/common';
import { BurgerPrintsModule } from '../burgerprints/burgerprints.module';
import { MemoryModule } from '../memory/memory.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AGENT_RUNTIME } from './agent-runtime.port';
import { PiAgentCoreRuntime } from './pi-agent-core.runtime';
import { WebFetchService } from './web-fetch.service';

/**
 * Provide AgentRuntime = PiAgentCoreRuntime (in-process pi-agent-core).
 * In tests the AGENT_RUNTIME provider is overridden with a test-double.
 */
@Module({
  imports: [BurgerPrintsModule, MemoryModule, KnowledgeModule],
  providers: [
    WebFetchService,
    { provide: AGENT_RUNTIME, useClass: PiAgentCoreRuntime },
  ],
  exports: [AGENT_RUNTIME],
})
export class AgentModule {}
