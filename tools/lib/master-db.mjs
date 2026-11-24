/**
 * Read-only access to a master.mdb through the sqlite3 CLI (the same dependency the
 * build has always used). Every query opens the file with -readonly; nothing here can
 * write to the database.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export class MasterDb {
	constructor(path) {
		this.path = path;
	}

	/** Run one SELECT/PRAGMA and return rows as objects. */
	query(sql) {
		const out = execFileSync('sqlite3', ['-readonly', '-json', this.path, sql], {
			encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'pipe']
		});
		return out.trim() ? JSON.parse(out) : [];
	}

	tables() {
		return this.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map(r => r.name);
	}

	columns(table) {
		return this.query('PRAGMA table_info(' + JSON.stringify(table) + ')').map(r => r.name);
	}

	quickCheck() {
		return this.query('PRAGMA quick_check').map(r => Object.values(r)[0]).join('; ');
	}

	/** Map of text_data.index (as string) -> text for one category. */
	text(category) {
		return new Map(this.query('SELECT "index" AS id, text FROM text_data WHERE category = ' + Number(category))
			.map(r => [String(r.id), r.text]));
	}

	ids(table) {
		return this.query('SELECT id FROM ' + table + ' ORDER BY id').map(r => String(r.id));
	}

	sha256() {
		return createHash('sha256').update(readFileSync(this.path)).digest('hex');
	}

	size() {
		return statSync(this.path).size;
	}
}
