import type { LicenseState } from '@n8n/backend-common';
import type { OutboundHttp } from '@n8n/backend-network';
import type { WorkflowRepository } from '@n8n/db';
import type { TEntitlement } from '@n8n_io/license-sdk';
import { mock } from 'vitest-mock-extended';

import type { EventService } from '@/events/event.service';
import type { License } from '@/license';
import { LicenseService } from '@/license/license.service';

describe('LicenseService', () => {
	const license = mock<License>();
	const licenseState = mock<LicenseState>();
	const workflowRepository = mock<WorkflowRepository>();
	const entitlement = mock<TEntitlement>({ productId: '123' });
	const eventService = mock<EventService>();
	const outboundHttp = mock<OutboundHttp>();
	const licenseService = new LicenseService(
		mock(),
		license,
		licenseState,
		workflowRepository,
		mock(),
		eventService,
		outboundHttp,
	);

	license.getMainPlan.mockReturnValue(entitlement);
	license.getTriggerLimit.mockReturnValue(400);
	license.getPlanName.mockReturnValue('Test Plan');
	licenseState.getMaxWorkflowsWithEvaluations.mockReturnValue(2);
	workflowRepository.getActiveTriggerCount.mockResolvedValue(7);
	workflowRepository.getWorkflowsWithEvaluationCount.mockResolvedValue(1);

	beforeEach(() => vi.clearAllMocks());

	describe('getLicenseData', () => {
		it('should return usage and license data', async () => {
			const data = await licenseService.getLicenseData();
			expect(data).toEqual({
				usage: {
					activeWorkflowTriggers: {
						limit: 400,
						value: 7,
						warningThreshold: 0.8,
					},
					workflowsHavingEvaluations: {
						limit: 2,
						value: 1,
					},
				},
				license: {
					planId: '123',
					planName: 'Test Plan',
				},
			});
		});
	});

	// [CUSTOM-FORK] License Activation: Die Upstream-Suites zu activateLicense,
	// renewLicense und registerCommunityEdition entfielen — diese Pfade sprechen im Fork
	// keinen Lizenzserver mehr an. Geprueft wird stattdessen, dass sie folgenlos bleiben.
	describe('no external license server calls', () => {
		test('activateLicense resolves without touching the license', async () => {
			await expect(licenseService.activateLicense('activation-key')).resolves.toBeUndefined();
			expect(license.activate).not.toHaveBeenCalled();
		});

		test('activateLicense accepts the EULA overload without touching the license', async () => {
			await expect(
				licenseService.activateLicense('activation-key', 'https://eula', 'user@example.com'),
			).resolves.toBeUndefined();
			expect(license.activate).not.toHaveBeenCalled();
		});

		test('renewLicense reports success without renewing', async () => {
			await expect(licenseService.renewLicense()).resolves.toBeUndefined();

			expect(license.renew).not.toHaveBeenCalled();
			expect(eventService.emit).toHaveBeenCalledWith('license-renewal-attempted', {
				success: true,
			});
		});

		test('registerCommunityEdition returns a local success response', async () => {
			const result = await licenseService.registerCommunityEdition({
				userId: '123',
				email: 'user@example.com',
				instanceId: 'instance-id',
				instanceUrl: 'http://localhost:5678',
				licenseType: 'community-registered',
			});

			expect(result).toEqual({
				title: 'Registration successful',
				text: 'Your instance is already running with Enterprise license.',
			});
			expect(eventService.emit).not.toHaveBeenCalled();
		});
	});
	// [CUSTOM-FORK] End License Activation
});
