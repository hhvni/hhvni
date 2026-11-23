import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// base = dossier du front, quel que soit le répertoire courant du processus
export default { plugins: { '@tailwindcss/postcss': { base: dirname(fileURLToPath(import.meta.url)) } } };
