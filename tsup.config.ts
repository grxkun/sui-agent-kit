import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index:      'src/index.ts',
    agent:      'src/agent.ts',
    policy:     'src/policy.ts',
    x402:       'src/x402.ts',
    reputation: 'src/reputation.ts',
    task:       'src/task.ts',
    stream:     'src/stream.ts',
    a2a:        'src/a2a.ts',
    memory:     'src/memory.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['express'],
});
