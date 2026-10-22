import { render } from 'preact';

import { App } from './app/App';
import { applyPreferences, loadPreferences } from './app/preferences';
import './styles.css';

applyPreferences(loadPreferences());

const root = document.getElementById('app');
if (!root) throw new Error('App root not found.');
render(<App />, root);
