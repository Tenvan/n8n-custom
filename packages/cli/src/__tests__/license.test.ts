import { mockLogger } from '@n8n/backend-test-utils';
import type { GlobalConfig } from '@n8n/config';
import type { SettingsRepository } from '@n8n/db';
import { LicenseManager } from '@n8n_io/license-sdk';
import type { InstanceSettings } from 'n8n-core';
import { mock } from 'vitest-mock-extended';

import { License } from '@/license';

vi.mock('@n8n_io/license-sdk');

const MOCK_SERVER_URL = 'https://server.com/v1';
const MOCK_INSTANCE_ID = 'instance-id';
const MOCK_ACTIVATION_KEY = 'activation-key';
const MOCK_FEATURE_FLAG = 'feat:sharing';

function makeDateWithHourOffset(offsetInHours: number): Date {
	return new Date(Date.now() + offsetInHours * 60 * 60 * 1000);
}

const licenseConfig: GlobalConfig['license'] = {
	serverUrl: MOCK_SERVER_URL,
	autoRenewalEnabled: true,
	detachFloatingOnShutdown: true,
	activationKey: MOCK_ACTIVATION_KEY,
	tenantId: 1,
	cert: '',
};

describe('License', () => {
	// [CUSTOM-FORK] License Activation: Die Upstream-Suites zu LicenseManager-Init,
	// activate/renew, Device-Fingerprint und Cert-Refresh entfielen — dieses Verhalten
	// gibt es im Fork nicht mehr. Stattdessen wird hier die lokale Aktivierung geprueft.
	describe('local full license activation', () => {
		const buildLicense = () =>
			new License(
				mockLogger(),
				mock<InstanceSettings>({ instanceId: MOCK_INSTANCE_ID, instanceType: 'main' }),
				mock<SettingsRepository>(),
				mock(),
				mock<GlobalConfig>({ license: licenseConfig }),
			);

		beforeEach(() => {
			vi.clearAllMocks();
		});

		test('activates an Enterprise plan without initializing the license SDK', async () => {
			const license = buildLicense();

			await license.init();

			expect(license.getPlanName()).toBe('Enterprise');
			expect(LicenseManager).not.toHaveBeenCalled();
		});

		test('is idempotent across repeated init calls', async () => {
			const license = buildLicense();

			await license.init();
			await license.init();

			expect(license.getPlanName()).toBe('Enterprise');
			expect(LicenseManager).not.toHaveBeenCalled();
		});

		test('activate and renew are no-ops that never reach the license server', async () => {
			const license = buildLicense();
			await license.init();

			await expect(license.activate(MOCK_ACTIVATION_KEY)).resolves.toBeUndefined();
			await expect(license.renew()).resolves.toBeUndefined();
			expect(LicenseManager).not.toHaveBeenCalled();
		});

		test('reports the sharing feature as licensed', async () => {
			const license = buildLicense();

			await license.init();

			expect(license.isLicensed(MOCK_FEATURE_FLAG)).toBe(true);
		});
	});
	// [CUSTOM-FORK] End License Activation

	describe('getExpiringInDays', () => {
		let license: License;
		const instanceSettings = mock<InstanceSettings>({
			instanceId: MOCK_INSTANCE_ID,
			instanceType: 'main',
			isLeader: true,
		});

		beforeEach(async () => {
			vi.restoreAllMocks();
			const globalConfig = mock<GlobalConfig>({
				license: licenseConfig,
				multiMainSetup: { enabled: false },
			});
			license = new License(mockLogger(), instanceSettings, mock(), mock(), globalConfig);
			await license.init();
		});

		it('should return number of days until expiry for future date', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(72)); // 3 days

			const result = license.getExpiringInDays();

			expect(result).toBe(3);
		});

		it('should return 0 for already expired licenses', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(-24)); // 1 day ago

			const result = license.getExpiringInDays();

			expect(result).toBe(0);
		});

		it('should return undefined when no expiry date exists', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(null);

			const result = license.getExpiringInDays();

			expect(result).toBeUndefined();
		});

		it('should handle exactly 0 hours remaining', () => {
			const now = new Date();
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(now);

			const result = license.getExpiringInDays();

			expect(result).toBe(0);
		});

		it('should handle dates far in the future', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(365 * 24)); // 1 year

			const result = license.getExpiringInDays();

			expect(result).toBe(365);
		});

		it('should handle fractional days by ceiling', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(37)); // 1.5+ days

			const result = license.getExpiringInDays();

			expect(result).toBe(2); // ceiling of 1.5 is 2
		});

		it('should handle invalid date (NaN)', () => {
			const invalidDate = new Date('invalid');
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(invalidDate);

			const result = license.getExpiringInDays();

			expect(result).toBeUndefined();
		});

		it('should return maximum 0 for negative day differences', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(-100)); // 4+ days ago

			const result = license.getExpiringInDays();

			expect(result).toBe(0);
		});
	});

	describe('getTerminatingInDays', () => {
		let license: License;
		const instanceSettings = mock<InstanceSettings>({
			instanceId: MOCK_INSTANCE_ID,
			instanceType: 'main',
			isLeader: true,
		});

		beforeEach(async () => {
			vi.restoreAllMocks();
			const globalConfig = mock<GlobalConfig>({
				license: licenseConfig,
				multiMainSetup: { enabled: false },
			});
			license = new License(mockLogger(), instanceSettings, mock(), mock(), globalConfig);
			await license.init();
		});

		it('should return number of days until termination for future date', () => {
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(48)); // 2 days

			const result = license.getTerminatingInDays();

			expect(result).toBe(2);
		});

		it('should return 0 for already terminated licenses', () => {
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(-48)); // 2 days ago

			const result = license.getTerminatingInDays();

			expect(result).toBe(0);
		});

		it('should return undefined when no termination date exists', () => {
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(null);

			const result = license.getTerminatingInDays();

			expect(result).toBeUndefined();
		});

		it('should handle exactly 0 hours until termination', () => {
			const now = new Date();
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(now);

			const result = license.getTerminatingInDays();

			expect(result).toBe(0);
		});

		it('should handle termination dates far in the future', () => {
			License.prototype.getTerminationDate = vi
				.fn()
				.mockReturnValue(makeDateWithHourOffset(720 * 24)); // 2 years

			const result = license.getTerminatingInDays();

			expect(result).toBe(720);
		});

		it('should handle fractional days by ceiling', () => {
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(13)); // 0.5+ days

			const result = license.getTerminatingInDays();

			expect(result).toBe(1); // ceiling of 0.5 is 1
		});

		it('should handle invalid date (NaN)', () => {
			const invalidDate = new Date('invalid');
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(invalidDate);

			const result = license.getTerminatingInDays();

			expect(result).toBeUndefined();
		});

		it('should return maximum 0 for negative day differences', () => {
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(-200)); // 8+ days ago

			const result = license.getTerminatingInDays();

			expect(result).toBe(0);
		});
	});

	describe('getExpiringInDays vs getTerminatingInDays', () => {
		let license: License;
		const instanceSettings = mock<InstanceSettings>({
			instanceId: MOCK_INSTANCE_ID,
			instanceType: 'main',
			isLeader: true,
		});

		beforeEach(async () => {
			vi.restoreAllMocks();
			const globalConfig = mock<GlobalConfig>({
				license: licenseConfig,
				multiMainSetup: { enabled: false },
			});
			license = new License(mockLogger(), instanceSettings, mock(), mock(), globalConfig);
			await license.init();
		});

		it('should handle both dates being set independently', () => {
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(72)); // 3 days
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(168)); // 7 days

			const expiringDays = license.getExpiringInDays();
			const terminatingDays = license.getTerminatingInDays();

			expect(expiringDays).toBe(3);
			expect(terminatingDays).toBe(7);
		});

		it('should handle different precisions for dates', () => {
			// Expiry in 2.3 days
			License.prototype.getExpiryDate = vi.fn().mockReturnValue(makeDateWithHourOffset(55));
			// Termination in 5.7 days
			License.prototype.getTerminationDate = vi.fn().mockReturnValue(makeDateWithHourOffset(137));

			const expiringDays = license.getExpiringInDays();
			const terminatingDays = license.getTerminatingInDays();

			expect(expiringDays).toBe(3); // ceiling of 2.3
			expect(terminatingDays).toBe(6); // ceiling of 5.7
		});
	});
});
