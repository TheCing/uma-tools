/**
 * Mechanics Explorer
 * Shows how uma stats feed the underlying race-mechanics formulas.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render } from 'preact';

import '../v2/v2.css';
import './mechanics-explorer.css';

function App() {
	return (
		<div class="mx-app">
			<div class="mx-header"><h1>Mechanics Explorer</h1></div>
		</div>
	);
}

render(<App />, document.getElementById('app')!);
