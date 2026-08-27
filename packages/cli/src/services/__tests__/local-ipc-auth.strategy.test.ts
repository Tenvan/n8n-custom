import type { AuthenticatedRequest, User } from '@n8n/db';
import { UserRepository } from '@n8n/db';
import { mock } from 'vitest-mock-extended';

import { LocalIpcAuthStrategy } from '../local-ipc-auth.strategy';

const owner = mock<User>({
	id: 'owner-id',
	disabled: false,
	role: { slug: 'global:owner', scopes: [{ slug: 'workflow:read' }] },
});

const reqFrom = (remoteAddress: string | undefined, headers: Record<string, string> = {}) =>
	mock<AuthenticatedRequest>({
		path: '/workflows',
		method: 'GET',
		headers,
		socket: { remoteAddress },
	});

describe('LocalIpcAuthStrategy', () => {
	const userRepository = mock<UserRepository>();
	const strategy = new LocalIpcAuthStrategy(userRepository);

	beforeEach(() => {
		vi.clearAllMocks();
		userRepository.findOne.mockResolvedValue(owner);
	});

	describe('authenticate', () => {
		test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.53'])(
			'authenticates a request from %s as the instance owner',
			async (remoteAddress) => {
				const req = reqFrom(remoteAddress);

				await expect(strategy.authenticate(req)).resolves.toBe(true);
				expect(req.user).toBe(owner);
				expect(req.tokenGrant?.subject).toBe(owner);
			},
		);

		test.each(['10.0.0.5', '192.168.1.20', '203.0.113.7', '::ffff:10.0.0.5', undefined])(
			'abstains for a request from %s',
			async (remoteAddress) => {
				await expect(strategy.authenticate(reqFrom(remoteAddress))).resolves.toBeNull();
				expect(userRepository.findOne).not.toHaveBeenCalled();
			},
		);

		test('ignores a spoofed X-Forwarded-For header from a remote address', async () => {
			const req = reqFrom('203.0.113.7', { 'x-forwarded-for': '127.0.0.1' });

			await expect(strategy.authenticate(req)).resolves.toBeNull();
			expect(userRepository.findOne).not.toHaveBeenCalled();
		});

		test('ignores a spoofed Host header from a remote address', async () => {
			const req = reqFrom('203.0.113.7', { host: 'localhost:5678' });

			await expect(strategy.authenticate(req)).resolves.toBeNull();
			expect(userRepository.findOne).not.toHaveBeenCalled();
		});

		test('abstains when the instance owner is disabled', async () => {
			userRepository.findOne.mockResolvedValue(mock<User>({ ...owner, disabled: true }));

			await expect(strategy.authenticate(reqFrom('127.0.0.1'))).resolves.toBeNull();
		});

		test('abstains when no instance owner exists', async () => {
			userRepository.findOne.mockResolvedValue(null);

			await expect(strategy.authenticate(reqFrom('127.0.0.1'))).resolves.toBeNull();
		});
	});

	describe('buildTokenGrant', () => {
		test('abstains so token-based strategies stay responsible', async () => {
			await expect(strategy.buildTokenGrant()).resolves.toBeNull();
		});
	});
});
