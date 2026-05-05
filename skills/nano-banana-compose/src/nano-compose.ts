// Nano-banana/edit composition helper.
//
// Multi-reference image-to-image composition via fal-ai/nano-banana/edit.
// Used by video-production directives to combine 2+ reference images into
// a single composed output (per-shot keyframe, brand bake, etc.).
//
// Imports from the sibling `fal` skill (must be at clawd-skills/fal/).
//
// Usage:
//   bun nano-compose.ts --output OUT.png --prompt "..." [--aspect-ratio 16:9] IMG1 IMG2 ...

import { resolveKey } from '../../fal/src/accounts.js';
import {
  submit,
  awaitCompletion,
  uploadFile,
  extractImageUrls,
  downloadTo,
} from '../../fal/src/client.js';

const args = process.argv.slice(2);
let output = '';
let prompt = '';
let aspectRatio = '';
let accountRef = 'default';
const images: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output') output = args[++i];
  else if (args[i] === '--prompt') prompt = args[++i];
  else if (args[i] === '--aspect-ratio') aspectRatio = args[++i];
  else if (args[i] === '--account-ref') accountRef = args[++i];
  else if (args[i].startsWith('--')) {
    console.error(`unknown flag: ${args[i]}`);
    process.exit(1);
  } else {
    images.push(args[i]);
  }
}

if (!output || !prompt || images.length === 0) {
  console.error('Usage: nano-compose --output OUT.png --prompt "..." [--aspect-ratio 16:9] [--account-ref default] IMG1 IMG2 ...');
  process.exit(1);
}

const key = await resolveKey(accountRef);
console.error(`[nano] uploading ${images.length} ref${images.length > 1 ? 's' : ''}...`);
const urls = await Promise.all(images.map((p) => uploadFile(key, p)));

const body: Record<string, unknown> = {
  prompt,
  image_urls: urls,
  num_images: 1,
  output_format: 'jpeg',
};
if (aspectRatio) body.aspect_ratio = aspectRatio;

console.error(`[nano] submitting to nano-banana/edit${aspectRatio ? ` (aspect=${aspectRatio})` : ''}...`);
const submitted = await submit(key, 'fal-ai/nano-banana/edit', body);

console.error(`[nano] polling ${submitted.request_id}...`);
const result = await awaitCompletion(key, submitted, {
  pollIntervalMs: 3000,
  timeoutMs: 300000,
});

const imageUrls = extractImageUrls(result);
if (imageUrls.length === 0) {
  console.error(`[nano] FAIL — no output images. Result:`);
  console.error(JSON.stringify(result, null, 2).slice(0, 500));
  process.exit(2);
}

await downloadTo(imageUrls[0], output);
console.log(`[OK] ${output}`);
