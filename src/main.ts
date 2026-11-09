import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './ui/styles.css';
import { mountHub } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app não encontrado.');
mountHub(root);
