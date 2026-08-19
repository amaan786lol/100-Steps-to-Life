import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = '/home/ubuntu/webdev-static-assets';
mkdirSync(outDir, { recursive: true });

const common = ({ sky, sea, land, shadow, accent, detail, landmark }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img">
  <rect width="1200" height="675" fill="${sky}"/>
  <path d="M0 325 C170 280 250 355 410 312 C590 264 745 352 920 290 C1040 250 1124 280 1200 247 V675 H0Z" fill="${sea}"/>
  <path d="M0 470 C155 400 270 455 405 398 C575 325 735 454 880 388 C1022 324 1115 360 1200 326 V675 H0Z" fill="${land}"/>
  <path d="M-30 590 C155 450 295 595 470 494 C655 387 750 580 905 467 C1030 382 1116 430 1230 335" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" stroke-dasharray="4 25" opacity=".9"/>
  <path d="M0 613 C198 483 336 591 489 521 C660 442 752 607 919 494 C1046 408 1110 454 1200 391" fill="none" stroke="${shadow}" stroke-width="34" stroke-linecap="round" opacity=".24"/>
  <g fill="${detail}" opacity=".7"><circle cx="130" cy="185" r="4"/><circle cx="270" cy="131" r="3"/><circle cx="880" cy="139" r="4"/><circle cx="1060" cy="210" r="3"/></g>
  ${landmark}
  <circle cx="730" cy="494" r="17" fill="${accent}"/><circle cx="730" cy="494" r="8" fill="#fff9e8"/>
</svg>`;

const islands = {
  'island-firstlight-cove.svg': common({
    sky: '#b9dce2', sea: '#5d9aa0', land: '#e8d1a4', shadow: '#745b3b', accent: '#d6a64b', detail: '#f7f1e2',
    landmark: '<circle cx="948" cy="135" r="67" fill="#f4d77e" opacity=".9"/><path d="M65 503 C218 410 325 470 452 422" fill="none" stroke="#f7f1e2" stroke-width="8" opacity=".75"/><path d="M378 385v-98m-34 25h70m-35-26v28" stroke="#102b3a" stroke-width="14" stroke-linecap="round"/>'
  }),
  'island-lantern-gardens.svg': common({
    sky: '#244f59', sea: '#2e7b7a', land: '#88a878', shadow: '#153940', accent: '#e2bf61', detail: '#d9ead6',
    landmark: '<path d="M305 454h456M399 389h265M477 325h110" fill="none" stroke="#d9ead6" stroke-width="15" opacity=".7"/><path d="M610 277v108m-39 1h78l-14-103h-50z" fill="#e2bf61" stroke="#102b3a" stroke-width="12"/><circle cx="610" cy="329" r="20" fill="#fff8d8"/>'
  }),
  'island-training-ridge.svg': common({
    sky: '#d8b6a1', sea: '#9c7563', land: '#a85e48', shadow: '#553d38', accent: '#e2c074', detail: '#f7e9dd',
    landmark: '<path d="M135 540 400 250l225 245 175-180 265 225" fill="#794c45" opacity=".68"/><path d="M628 301l40 55h-75l38-55m-42 60 78 0m-63 24 47 0" fill="none" stroke="#f7e9dd" stroke-width="14" stroke-linecap="round"/>'
  }),
  'island-observatory.svg': common({
    sky: '#263e73', sea: '#426ca2', land: '#7497a4', shadow: '#1d3159', accent: '#e1b85c', detail: '#e0e9ed',
    landmark: '<path d="M428 424c0-115 85-171 169-171s169 56 169 171z" fill="#dfe8e9" stroke="#102b3a" stroke-width="14"/><path d="M512 424c0-56 35-94 85-94s85 38 85 94" fill="#263e73" stroke="#102b3a" stroke-width="14"/><path d="M592 226v-35m-29 16 58 0" stroke="#e1b85c" stroke-width="12" stroke-linecap="round"/><circle cx="882" cy="125" r="8" fill="#f7f1e2"/><circle cx="934" cy="168" r="5" fill="#f7f1e2"/>'
  }),
  'island-bridgehaven.svg': common({
    sky: '#e0a68c', sea: '#588b9b', land: '#d28b71', shadow: '#734952', accent: '#f3d17a', detail: '#fbefdc',
    landmark: '<path d="M242 453c80-153 221-153 300 0m116 0c80-153 221-153 300 0" fill="none" stroke="#fbefdc" stroke-width="35"/><path d="M225 454h756" stroke="#102b3a" stroke-width="14"/><path d="M315 388v-60m54 38v-65m465 88v-65m57 35v-60" stroke="#734952" stroke-width="18" stroke-linecap="round"/>'
  }),
  'island-wildwood-valley.svg': common({
    sky: '#a7c9b1', sea: '#67a6a2', land: '#447b51', shadow: '#244d3d', accent: '#d6b65e', detail: '#e5f0e1',
    landmark: '<path d="M605 492V232m0 42-110 127h68l-106 99h94l-82 82h72m64-308 110 127h-68l106 99h-94l82 82h-72" fill="none" stroke="#173e31" stroke-width="35" stroke-linejoin="round"/><path d="M855 306c76 38 113 87 132 166" fill="none" stroke="#e5f0e1" stroke-width="19" opacity=".8"/>'
  }),
  'island-makers-quay.svg': common({
    sky: '#b5c5c8', sea: '#4d7f8c', land: '#be8661', shadow: '#704b43', accent: '#d8a95d', detail: '#f5ead9',
    landmark: '<path d="M343 466h460M555 466V281h182v185m-105-185v-88" fill="none" stroke="#f5ead9" stroke-width="26"/><path d="M705 246c-36 0-58 31-58 62m61-62c36 0 58 31 58 62" fill="none" stroke="#102b3a" stroke-width="15"/><path d="M462 368l122 0m-61-61v122" stroke="#d8a95d" stroke-width="18" stroke-linecap="round"/>'
  }),
  'island-value-harbour.svg': common({
    sky: '#d9c28b', sea: '#456f83', land: '#8d7b55', shadow: '#4f473c', accent: '#e3bd59', detail: '#fbf3dc',
    landmark: '<path d="M612 460V170h112v290m-161 0h210" fill="#fbf3dc" stroke="#102b3a" stroke-width="16"/><path d="M636 248h64m-64 59h64m-64 59h64" stroke="#e3bd59" stroke-width="15"/><path d="M309 371h170m-85-85v170" stroke="#fbf3dc" stroke-width="18" stroke-linecap="round"/>'
  }),
  'island-common-ground.svg': common({
    sky: '#7d86a9', sea: '#607a91', land: '#596b78', shadow: '#344457', accent: '#e1bd60', detail: '#ecede6',
    landmark: '<path d="M610 493V225m0 94c-104 0-148-88-148-140 93 0 148 46 148 140m0 0c104 0 148-88 148-140-93 0-148 46-148 140" fill="#405f52" stroke="#102b3a" stroke-width="17"/><circle cx="610" cy="509" r="112" fill="none" stroke="#ecede6" stroke-width="20" stroke-dasharray="9 26"/>'
  }),
  'island-summit.svg': common({
    sky: '#9fb7c1', sea: '#567d8d', land: '#718d81', shadow: '#304b55', accent: '#dfb653', detail: '#f7f1e2',
    landmark: '<path d="M220 511 578 108l170 204 94-111 212 310" fill="#4c6972" stroke="#102b3a" stroke-width="18"/><path d="M578 108l-50 107 50-37 52 37z" fill="#f7f1e2"/><path d="m578 45 12 26 26 12-26 12-12 26-12-26-26-12 26-12z" fill="#dfb653"/>'
  }),
};

for (const [filename, content] of Object.entries(islands)) {
  writeFileSync(`${outDir}/${filename}`, content.trim());
}
