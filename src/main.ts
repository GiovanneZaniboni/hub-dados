import './ui/styles.css';
import { mountHub } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app não encontrado.');
mountHub(root);
