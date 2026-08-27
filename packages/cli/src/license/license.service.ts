import { LicenseState, Logger } from '@n8n/backend-common';
import { OutboundHttp } from '@n8n/backend-network';
import type { User } from '@n8n/db';
import { WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { EventService } from '@/events/event.service';
import { License } from '@/license';
import { UrlService } from '@/services/url.service';

export const LicenseErrors = {
	SCHEMA_VALIDATION: 'Activation key is in the wrong format',
	RESERVATION_EXHAUSTED: 'Activation key has been used too many times',
	RESERVATION_EXPIRED: 'Activation key has expired',
	NOT_FOUND: 'Activation key not found',
	RESERVATION_CONFLICT: 'Activation key not found',
	RESERVATION_DUPLICATE: 'Activation key has already been used on this instance',
};

@Service()
export class LicenseService {
	// [CUSTOM-FORK] License Activation: Konstruktor-Signatur bleibt identisch zu master,
	// damit Upstream-Tests und DI unveraendert bleiben. urlService/_outboundHttp werden
	// nicht mehr gelesen, seit die externen Lizenz-Calls entfallen.
	constructor(
		private readonly logger: Logger,
		private readonly license: License,
		private readonly licenseState: LicenseState,
		private readonly workflowRepository: WorkflowRepository,
		_urlService: UrlService,
		private readonly eventService: EventService,
		_outboundHttp: OutboundHttp,
	) {}
	// [CUSTOM-FORK] End License Activation

	async getLicenseData() {
		const triggerCount = await this.workflowRepository.getActiveTriggerCount();
		const workflowsWithEvaluationsCount =
			await this.workflowRepository.getWorkflowsWithEvaluationCount();
		const mainPlan = this.license.getMainPlan();

		return {
			usage: {
				activeWorkflowTriggers: {
					value: triggerCount,
					limit: this.license.getTriggerLimit(),
					warningThreshold: 0.8,
				},
				workflowsHavingEvaluations: {
					value: workflowsWithEvaluationsCount,
					limit: this.licenseState.getMaxWorkflowsWithEvaluations(),
				},
			},
			license: {
				planId: mainPlan?.productId ?? '',
				planName: this.license.getPlanName(),
			},
		};
	}

	// [CUSTOM-FORK] License Activation: No-op statt externem Trial-Request — die Lizenz
	// ist lokal bereits aktiv. Original-Implementierung siehe master.
	async requestEnterpriseTrial(_user: User) {
		this.logger.debug('Enterprise trial request skipped - local full license already active');
	}
	// [CUSTOM-FORK] End License Activation

	// [CUSTOM-FORK] License Activation: Kein Call an enterprise.n8n.io — die Lizenz ist
	// lokal bereits aktiv. Original-Implementierung siehe master.
	async registerCommunityEdition(_params: {
		userId: User['id'];
		email: string;
		instanceId: string;
		instanceUrl: string;
		licenseType: string;
	}): Promise<{ title: string; text: string }> {
		this.logger.debug('Community edition registration skipped - local full license already active');
		return {
			title: 'Registration successful',
			text: 'Your instance is already running with Enterprise license.',
		};
	}
	// [CUSTOM-FORK] End License Activation

	getManagementJwt(): string {
		return this.license.getManagementJwt();
	}

	// [CUSTOM-FORK] License Activation: No-op — kein Call an den Lizenzserver, die Lizenz
	// ist lokal bereits aktiv. Overloads bleiben identisch zu master, damit Aufrufer und
	// Controller unveraendert bleiben. Original-Implementierung siehe master.
	async activateLicense(activationKey: string): Promise<void>;
	async activateLicense(activationKey: string, eulaUri: string, userEmail: string): Promise<void>;
	async activateLicense(
		_activationKey: string,
		_eulaUri?: string,
		_userEmail?: string,
	): Promise<void> {
		this.logger.debug('License activation skipped - local full license already active');
	}
	// [CUSTOM-FORK] End License Activation

	async renewLicense() {
		// [CUSTOM-FORK] License Activation: Die lokale Lizenz laeuft nicht ab, es gibt nichts
		// zu erneuern. Original-Implementierung siehe master.
		this.logger.debug('License renewal skipped - local full license never expires');
		this.eventService.emit('license-renewal-attempted', { success: true });
		// [CUSTOM-FORK] End License Activation
	}
}
