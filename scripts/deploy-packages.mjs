#!/usr/bin/env node
/**
 * Packt alle publishable Workspace-Packages als .tgz nach .deploy/.
 * Die Tarballs werden im ErpApi-Projekt per "file:packages/<name>.tgz" eingebunden.
 *
 * Voraussetzung: `pnpm build` lief durch — ohne dist/ enthalten die Tarballs keinen Code.
 */
import { $, chalk, echo, fs, glob } from 'zx';
import { execFile } from 'node:child_process';
import path from 'path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(rootDir, '.deploy');
// Windows: Backslash-Pfade werden beim Durchreichen an pnpm als Escape-Sequenzen
// gedeutet. Forward-Slashes versteht Node/pnpm auf jeder Plattform.
const deployDirArg = deployDir.split(path.sep).join('/');
const dryRun = process.argv.includes('--dry-run');
const execFileAsync = promisify(execFile);
const pnpmCommand = 'pnpm';

$.verbose = false;

// trim-fe-packageJson.js schreibt genau diese drei Manifeste um. Sie werden vor dem
// Packen gesichert und im finally-Block garantiert zurückgerollt.
const TRIMMED_MANIFESTS = [
	'frontend/@n8n/chat',
	'frontend/@n8n/design-system',
	'frontend/editor-ui',
].map((p) => path.join(rootDir, 'packages', p, 'package.json'));

/** npm-Namensschema für Tarballs: @n8n/db@1.37.0 -> n8n-db-1.37.0.tgz */
const tarballName = ({ name, version }) =>
	`${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`;

const formatSize = (bytes) => {
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let i = 0;
	while (size >= 1024 && i < units.length - 1) (size /= 1024), i++;
	return `${Math.round(size * 10) / 10}${units[i]}`;
};

async function findPublishablePackages() {
	const manifests = await glob('packages/**/package.json', {
		cwd: rootDir,
		ignore: ['**/node_modules/**', '**/dist/**', '**/template/**'],
	});

	const packages = [];
	for (const rel of manifests) {
		const manifest = await fs.readJson(path.join(rootDir, rel));
		if (manifest.private === true || !manifest.name) continue;
		packages.push({
			name: manifest.name,
			version: manifest.version,
			dir: path.join(rootDir, path.dirname(rel)),
		});
	}
	return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/** Bricht ab, wenn offensichtlich nicht gebaut wurde — sonst entstehen leere Tarballs. */
async function assertBuilt() {
	const marker = path.join(rootDir, 'packages/cli/dist');
	if (!(await fs.pathExists(marker))) {
		echo(chalk.red('FEHLER: packages/cli/dist fehlt — erst `pnpm build` ausführen.'));
		process.exit(1);
	}
}

async function backupManifests() {
	const backups = new Map();
	for (const file of TRIMMED_MANIFESTS) {
		const content = await fs.readFile(file, 'utf8');

		// Ein hart abgebrochener Lauf (Ctrl+C, kill) ueberspringt den finally-Block und
		// laesst die Manifeste getrimmt liegen. Wuerde der naechste Lauf diesen Zustand
		// als Backup sichern, waere der Verlust dauerhaft.
		if (!JSON.parse(content).scripts) {
			echo(chalk.red(`FEHLER: ${path.relative(rootDir, file)} ist bereits getrimmt.`));
			echo(chalk.red('Ein vorheriger Lauf wurde abgebrochen. Wiederherstellen mit:'));
			echo(chalk.yellow(`  git restore ${TRIMMED_MANIFESTS.map((f) => path.relative(rootDir, f)).join(' ')}`));
			process.exit(1);
		}

		backups.set(file, content);
	}
	return async () => {
		for (const [file, content] of backups) await fs.writeFile(file, content, 'utf8');
		echo(chalk.gray('Frontend-Manifeste zurückgerollt.'));
	};
}

async function main() {
	echo(chalk.blue.bold('n8n Package Packing'));
	echo(chalk.gray(`Ziel: ${deployDir}`));

	const packages = await findPublishablePackages();
	echo(chalk.green(`${packages.length} publishable Packages gefunden.`));

	if (dryRun) {
		packages.forEach((p, i) => echo(chalk.gray(`  ${i + 1}. ${p.name}@${p.version}`)));
		echo(chalk.cyan('DRY RUN — es wurde nichts gepackt.'));
		return 0;
	}

	await assertBuilt();
	await fs.emptyDir(deployDir);

	const packed = [];
	const failed = [];
	const restore = await backupManifests();

	try {
		await $({ cwd: rootDir })`node .github/scripts/trim-fe-packageJson.js`;

		for (const pkg of packages) {
			const expected = tarballName(pkg);
			try {
				await execFileAsync(pnpmCommand, ['pack', '--pack-destination', deployDirArg], {
					cwd: pkg.dir,
					env: process.env,
					encoding: 'utf8',
					maxBuffer: Infinity,
				});

				const target = path.join(deployDir, expected);
				if (!(await fs.pathExists(target))) {
					throw new Error(`erwartete Datei ${expected} nicht gefunden`);
				}
				const { size } = await fs.stat(target);
				packed.push({ name: pkg.name, file: expected, size: formatSize(size), sizeBytes: size });
				echo(chalk.green(`  OK  ${pkg.name} -> ${expected} (${formatSize(size)})`));
			} catch (error) {
				const reason = (error.stderr || error.message || '').trim().slice(0, 200);
				failed.push({ name: pkg.name, error: reason });
				echo(chalk.red(`  FEHLER  ${pkg.name}: ${reason}`));
			}
		}
	} finally {
		await restore();
	}

	const totalBytes = packed.reduce((sum, p) => sum + p.sizeBytes, 0);
	await fs.writeJson(
		path.join(deployDir, 'packing-manifest.json'),
		{
			packingTime: new Date().toISOString(),
			platform: process.platform,
			arch: process.arch,
			totalSize: formatSize(totalBytes),
			totalSizeBytes: totalBytes,
			packages: packed.map(({ name, file, size }) => ({ name, file, size })),
			successfulPackages: packed.length,
			failedPackages: failed.length,
		},
		{ spaces: 2 },
	);

	echo('');
	echo(chalk.blue.bold('Zusammenfassung'));
	echo(`  Gepackt:    ${chalk.green(packed.length)} / ${packages.length}`);
	if (failed.length) {
		echo(`  Fehler:     ${chalk.red(failed.length)}`);
		failed.forEach((f) => echo(chalk.red(`    ${f.name}: ${f.error}`)));
	}
	echo(`  Gesamt:     ${formatSize(totalBytes)}`);
	echo(`  Verzeichnis: ${deployDir}`);

	return failed.length > 0 ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(chalk.red(`PACKING FEHLGESCHLAGEN: ${error.message}`));
		console.error(error.stack);
		process.exit(1);
	},
);
