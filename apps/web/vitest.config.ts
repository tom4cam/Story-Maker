import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/vitest.setup.ts'],
    include: [
      'src/**/*.test.ts',
      resolve(__dirname, '../../functions/api/_lib/**/*.test.ts'),
    ],
  },
});
