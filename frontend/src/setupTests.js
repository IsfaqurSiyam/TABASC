// Add DOM matchers and polyfills for jsdom.
import { TextDecoder, TextEncoder } from 'node:util';
import '@testing-library/jest-dom/vitest';

globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
