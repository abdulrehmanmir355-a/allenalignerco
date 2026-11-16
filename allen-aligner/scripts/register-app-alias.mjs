import { register } from 'node:module';

register(new URL('./app-alias-hook.mjs', import.meta.url), import.meta.url);
