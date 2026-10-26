import { defineConfig } from 'rolldown';

/** Empaqueta las Functions (con el código compartido de src/ts) en un solo archivo para desplegar. */
export default defineConfig({
  input: 'functions/src/index.ts',
  platform: 'node',
  external: [/^firebase-(admin|functions)(\/.*)?$/],
  output: { file: 'functions/lib/index.js', format: 'esm' },
});
