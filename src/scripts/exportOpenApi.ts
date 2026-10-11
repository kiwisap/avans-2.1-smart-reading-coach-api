import { writeFile } from 'node:fs/promises';
import { buildOpenApiDocument } from '../openapi/buildSpec.js';

// Writes openapi.json. The frontend generates its TypeScript types from this file.
const target = new URL('../../openapi.json', import.meta.url);
const document = await buildOpenApiDocument();
await writeFile(target, `${JSON.stringify(document, null, 4)}\n`);
console.log(`OpenAPI document written to ${target.pathname}`);
