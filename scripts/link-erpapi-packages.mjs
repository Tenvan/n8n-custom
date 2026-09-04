import { lstat, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = 'packing-manifest.json';
const linkPrefix = 'file:packages/';

const exists = async (file) => {
	try {
		await lstat(file);
		return true;
	} catch (error) {
		if (error.code === 'ENOENT') return false;
		throw error;
	}
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};

/** Alle Workspace-Packages nach Namen, damit das Closure den Graph laufen kann. */
async function readWorkspacePackages() {
	const byName = new Map();

	async function visit(dir) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!['node_modules', 'dist', 'template'].includes(entry.name)) {
					await visit(path.join(dir, entry.name));
				}
				continue;
			}
			if (entry.name !== 'package.json') continue;

			const manifest = await readJson(path.join(dir, entry.name));
			if (manifest.name && !byName.has(manifest.name)) byName.set(manifest.name, manifest);
		}
	}

	await visit(path.join(rootDir, 'packages'));
	return byName;
}

/**
 * Die Packages, die `n8n` zur Laufzeit braucht: transitives Closure ueber
 * `dependencies` ab `n8n`, `devDependencies` bleiben aussen vor.
 *
 * Das entscheidet, ob ein Link in ErpApis `dependencies` oder `devDependencies`
 * landet. Bewusst funktional statt semantisch: `@n8n/typescript-config` wird von
 * zwei Runtime-Packages als `dependencies` deklariert und muss deshalb auch bei
 * `npm install --production` vorhanden sein, obwohl der Name nach Tooling klingt.
 */
function buildRuntimeClosure(byName) {
	const closure = new Set();

	const walk = (name) => {
		if (closure.has(name)) return;
		closure.add(name);
		for (const dep of Object.keys(byName.get(name)?.dependencies ?? {})) {
			if (byName.has(dep)) walk(dep);
		}
	};

	walk('n8n');
	return closure;
}

const sortKeys = (record) =>
	Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, record[key]]),
	);

/**
 * Setzt die `file:`-Links in `ErpApi/package.json` auf den zuletzt gespiegelten
 * Stand unter `ErpApi/packages/<version>`.
 *
 * Vorgehen: erst fliegen *alle* bisherigen `file:packages/`-Eintraege aus
 * `dependencies` und `devDependencies`, dann werden nur die Packages im
 * Runtime-Closure von `n8n` neu in `dependencies` eingetragen. Damit bleiben
 * n8n-interne Build- und Test-Tools samt ihrer Peer-Dependencies draussen.
 *
 * `file:`-Links, die auf etwas anderes als `packages/` zeigen, bleiben unberuehrt.
 */
async function main() {
	const erpApiDir = path.resolve(process.argv[2] ?? path.join(rootDir, '..', 'ErpApi'));
	const packageFile = path.join(erpApiDir, 'package.json');
	assert(await exists(packageFile), `ErpApi/package.json fehlt: ${packageFile}`);

	const targetPackagesDir = path.join(erpApiDir, 'packages');
	assert(await exists(targetPackagesDir), `ErpApi/packages fehlt: ${targetPackagesDir}`);

	const { version } = await readJson(path.join(rootDir, 'package.json'));
	const versionDir = path.join(targetPackagesDir, version);
	const manifestPath = path.join(versionDir, manifestFile);
	assert(
		await exists(manifestPath),
		`${manifestFile} fehlt in ${versionDir} — zuerst "task orgamax:mirror" ausfuehren`,
	);

	const manifest = await readJson(manifestPath);
	const runtimeClosure = buildRuntimeClosure(await readWorkspacePackages());
	const linkedPackages = manifest.packages.filter(({ name }) => runtimeClosure.has(name));

	const pkg = await readJson(packageFile);
	pkg.dependencies ??= {};
	pkg.devDependencies ??= {};

	// Alten Stand erfassen, damit der Report Wechsel und Abgaenge zeigen kann.
	const previous = new Map();
	for (const section of ['dependencies', 'devDependencies']) {
		for (const [name, range] of Object.entries(pkg[section])) {
			if (String(range).startsWith(linkPrefix)) {
				previous.set(name, { section, range });
				delete pkg[section][name];
			}
		}
	}

	const added = [];
	const moved = [];
	const unchanged = [];
	for (const { name, file } of linkedPackages) {
		const section = 'dependencies';
		const range = `${linkPrefix}${version}/${file}`;
		pkg[section][name] = range;

		const before = previous.get(name);
		if (!before) added.push(`${name} -> ${section}`);
		else if (before.section !== section) moved.push(`${name}: ${before.section} -> ${section}`);
		else if (before.range !== range) added.push(`${name} -> ${file}`);
		else unchanged.push(name);
	}

	const removed = [...previous.keys()].filter(
		(name) => !linkedPackages.some((p) => p.name === name),
	);

	pkg.dependencies = sortKeys(pkg.dependencies);
	pkg.devDependencies = sortKeys(pkg.devDependencies);

	// Atomar schreiben, damit ein Fehler keine halbe package.json hinterlaesst.
	const tempFile = `${packageFile}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
	await rename(tempFile, packageFile);

	console.log(
		`Version ${version}: ${linkedPackages.length} Runtime-Links gesetzt ` +
			`(${manifest.packages.length - linkedPackages.length} Nicht-Runtime-Packages uebersprungen)`,
	);
	console.log(
		`  neu oder aktualisiert: ${added.length}, Sektion gewechselt: ${moved.length}, unveraendert: ${unchanged.length}`,
	);
	for (const entry of moved) console.log(`    ${entry}`);

	if (removed.length > 0) {
		console.log(`\n${removed.length} Links entfernt (nicht mehr im Manifest):`);
		console.log(`  ${removed.join(', ')}`);
	}

	const expected = new Set(linkedPackages.map(({ file }) => file));
	for (const file of expected) {
		assert(
			await exists(path.join(versionDir, file)),
			`Tarball fehlt im gespiegelten Stand: ${file}`,
		);
	}

	const stale = (await readdir(versionDir))
		.filter((entry) => entry.endsWith('.tgz'))
		.filter((entry) => !expected.has(entry));
	if (stale.length > 0) {
		console.log(`\n${stale.length} nicht mehr referenzierte Tarballs in ErpApi/packages/${version}:`);
		console.log(`  ${stale.join(', ')}`);
	}
}

main().catch((error) => {
	console.error(`ERPAPI-LINK FEHLGESCHLAGEN: ${error.message}`);
	process.exitCode = 1;
});
