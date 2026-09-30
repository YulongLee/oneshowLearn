// Reads only the three approved Alibaba chat fields; never imports foreign app settings.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { basename, dirname } from 'node:path';
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_PATH || !existsSync(process.env.DATABASE_PATH) || !basename(dirname(realpathSync(process.env.DATABASE_PATH))).startsWith('oneshowlearn-learning-preview-')) throw Error('AI preview requires an existing isolated learning-preview database');
if (!process.argv[2]) throw Error('Provide the local Alibaba configuration file path');
const source = parseEnv(readFileSync(process.argv[2], 'utf8'));
const key = source.OFFERSTEADY_CHAT_QWEN_API_KEY;
const model = source.OFFERSTEADY_CHAT_QWEN_MODEL;
const base = source.OFFERSTEADY_CHAT_QWEN_BASE_URL;
if (!key || !model || !base) throw Error('The required Alibaba chat configuration is incomplete');
Object.assign(process.env, { AI_ENABLED: 'true', AI_API_KEY: key, AI_MODEL: model, AI_BASE_URL: base });
const { createApp } = await import('../server/index.mjs');
const { config } = await import('../server/config.mjs');
createApp().listen(config.port, '127.0.0.1', () => console.log(`AI learning preview ready on port ${config.port}; credentials remain server-side`));
