import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../public/icons/', import.meta.url);
await mkdir(fileURLToPath(directory), { recursive: true });
const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="64" fill="#186647"/><g fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="256" r="154"/><path d="m320 192-42 86-86 42 42-86z"/></g><circle cx="256" cy="256" r="10" fill="#f2b097"/></svg>');
for (const size of [192, 512]) await sharp(image).resize(size, size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`, directory)));
console.log('Generated 192px and 512px home-screen icons.');