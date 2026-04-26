/**
 * server.ts — re-exports the Fastify handler for environments
 * that import from src/server rather than api/index directly.
 *
 * This keeps the import path consistent for any tooling or test
 * harness that references the server entry point by this path.
 */
export { default } from '../api/index';
