import { copyFile, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(rootDir, '.deploy');
const manifestFile = 'packing-manifest.json';
const semverPattern =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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

async function findPublishablePackageNames() {
	const names = new Set();

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
			if (manifest.private !== true && manifest.name) names.add(manifest.name);
		}
	}

	await visit(path.join(rootDir, 'packages'));
	return names;
}

async function validateDeploy(rootPackage, directory = deployDir) {
	const manifestPath = path.join(directory, manifestFile);
	assert(await exists(manifestPath), `${manifestFile} fehlt in .deploy`);

	const manifest = await readJson(manifestPath);
	assert(
		manifest.failedPackages === 0,
		`Manifest meldet ${manifest.failedPackages} fehlgeschlagene Packages`,
	);
	assert(
		Array.isArray(manifest.packages) && manifest.packages.length > 0,
		'Manifest enthält keine Packages',
	);
	assert(
		manifest.successfulPackages === manifest.packages.length,
		'Manifest-Packageanzahl stimmt nicht mit successfulPackages überein',
	);

	const names = new Set();
	const files = new Set();
	for (const pkg of manifest.packages) {
		assert(typeof pkg?.name === 'string' && pkg.name, 'Manifest enthält ein Package ohne Namen');
		assert(
			typeof pkg.file === 'string' && pkg.file.endsWith('.tgz'),
			`Ungültiger Tarball für ${pkg.name}`,
		);
		assert(path.basename(pkg.file) === pkg.file, `Tarball-Pfad ist nicht flach: ${pkg.file}`);
		assert(!names.has(pkg.name), `Doppeltes Package im Manifest: ${pkg.name}`);
		assert(!files.has(pkg.file), `Doppelter Tarball im Manifest: ${pkg.file}`);
		names.add(pkg.name);
		files.add(pkg.file);
	}

	const publishableNames = await findPublishablePackageNames();
	assert(
		publishableNames.size === names.size && [...publishableNames].every((name) => names.has(name)),
		'Manifest enthält nicht exakt alle publishable Workspace-Packages',
	);

	const n8nTarball = `n8n-${rootPackage.version}.tgz`;
	assert(
		manifest.packages.some(({ name, file }) => name === 'n8n' && file === n8nTarball),
		`Manifest enthält ${n8nTarball} nicht`,
	);

	const entries = await readdir(directory, { withFileTypes: true });
	const unexpected = entries.filter(
		(entry) => !entry.isFile() || (entry.name !== manifestFile && !files.has(entry.name)),
	);
	assert(
		unexpected.length === 0,
		`Unerwartete .deploy-Einträge: ${unexpected.map((entry) => entry.name).join(', ')}`,
	);
	assert(
		entries.length === files.size + 1,
		'.deploy enthält nicht exakt Manifest und manifestierte Tarballs',
	);

	return manifest;
}

async function replaceTarget(tempDir, targetDir, backupDir) {
	const hadTarget = await exists(targetDir);
	let movedTarget = false;

	try {
		if (hadTarget) {
			await rename(targetDir, backupDir);
			movedTarget = true;
		}
		await rename(tempDir, targetDir);
	} catch (error) {
		if (movedTarget && !(await exists(targetDir)) && (await exists(backupDir))) {
			await rename(backupDir, targetDir);
		}
		throw error;
	}

	if (movedTarget) await rm(backupDir, { force: true, recursive: true });
}

async function main() {
	const rootPackage = await readJson(path.join(rootDir, 'package.json'));
	const cliPackage = await readJson(path.join(rootDir, 'packages/cli/package.json'));
	assert(
		typeof rootPackage.version === 'string' && semverPattern.test(rootPackage.version),
		'Root-Version ist kein SemVer',
	);
	assert(
		rootPackage.version === cliPackage.version,
		'Root- und packages/cli-Version müssen übereinstimmen',
	);

	const version = rootPackage.version;
	const erpApiPackagesDir = path.resolve(rootDir, '..', 'ErpApi', 'packages');
	const packagesDir = (await exists(erpApiPackagesDir))
		? erpApiPackagesDir
		: path.resolve(rootDir, '..', 'packages');
	const targetDir = path.join(packagesDir, version);
	const nonce = `${process.pid}-${Date.now()}`;
	const tempDir = path.join(packagesDir, `.${version}.tmp-${nonce}`);
	const backupDir = path.join(packagesDir, `.${version}.backup-${nonce}`);

	const manifest = await validateDeploy(rootPackage);
	await mkdir(packagesDir, { recursive: true });
	assert(
		!(await exists(tempDir)) && !(await exists(backupDir)),
		'Temporärer Mirror-Pfad existiert bereits',
	);

	try {
		await mkdir(tempDir);
		await copyFile(path.join(deployDir, manifestFile), path.join(tempDir, manifestFile));
		for (const { file } of manifest.packages) {
			await copyFile(path.join(deployDir, file), path.join(tempDir, file));
		}

		await validateDeploy(rootPackage, tempDir);
		await replaceTarget(tempDir, targetDir, backupDir);
		console.log(`Gespiegelt: .deploy -> ${targetDir}`);
	} finally {
		if (await exists(tempDir)) await rm(tempDir, { force: true, recursive: true });
		if ((await exists(backupDir)) && (await exists(targetDir))) {
			await rm(backupDir, { force: true, recursive: true });
		}
	}
}

main().catch((error) => {
	console.error(`MIRROR FEHLGESCHLAGEN: ${error.message}`);
	process.exitCode = 1;
});
