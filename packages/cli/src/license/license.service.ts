import { LicenseState, Logger } from '@n8n/backend-common';
import { OutboundHttp, type HttpRequestClient, isHttpRequestError } from '@n8n/backend-network';
import { Time } from '@n8n/constants';
import type { User } from '@n8n/db';
import { WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { ensureError } from '@n8n/utils/errors/ensure-error';

// [CUSTOM-FORK] License Activation: Unused imports - external activation code commented out
// import { BadRequestError } from '@/errors/response-errors/bad-request.error';
// import { LicenseEulaRequiredError } from '@/errors/response-errors/license-eula-required.error';
import { EventService } from '@/events/event.service';
import { License } from '@/license';
// import { UrlService } from '@/services/url.service'; // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
// [CUSTOM-FORK] End License Activation

const REQUEST_TIMEOUT_MS = 30 * Time.seconds.toMilliseconds;

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
	private readonly http: HttpRequestClient;

	constructor(
		private readonly logger: Logger,
		private readonly license: License,
		private readonly licenseState: LicenseState,
		private readonly workflowRepository: WorkflowRepository,
		// private readonly urlService: UrlService, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
		private readonly eventService: EventService,
		outboundHttp: OutboundHttp,
	) {
		this.http = outboundHttp.requests({
			useDefaultSsrfPolicy: 'unsafe', // Fixed, n8n-controlled host
			timeout: REQUEST_TIMEOUT_MS,
		});
	}

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

	async registerCommunityEdition({
		// userId, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
		// email, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
		// instanceId, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
		// instanceUrl, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
		// licenseType, // [CUSTOM-FORK] License Activation: Unused - external HTTP calls removed
	}: {
		userId: User['id'];
		email: string;
		instanceId: string;
		instanceUrl: string;
		licenseType: string;
	}): Promise<{ title: string; text: string }> {
		// [CUSTOM-FORK] License Activation: Skip external registration - return local success response
		// No external HTTP call to enterprise.n8n.io - license already active locally
		this.logger.debug('Community edition registration skipped - local full license already active');
		// Return mock success response without external server call
		return {
			title: 'Registration successful',
			text: 'Your instance is already running with Enterprise license.',
		};
		// [CUSTOM-FORK] End License Activation

		// Original code commented out to prevent external server calls
		/*
		try {
			const { licenseKey, ...rest } = await this.http.request<{
				title: string;
				text: string;
				licenseKey: string;
			}>({
				url: 'https://enterprise.n8n.io/community-registered',
				method: 'POST',
				body: {
					email,
					instanceId,
					instanceUrl,
					licenseType,
				},
				json: true,
			});
			this.eventService.emit('license-community-plus-registered', { userId, email, licenseKey });
			return rest;
		} catch (e: unknown) {
			if (isHttpRequestError(e)) {
				const data = e.response?.data as { message?: string } | undefined;
				const errorMsg = data?.message ?? e.message;
				throw new BadRequestError('Failed to register community edition: ' + errorMsg);
			} else {
				this.logger.error('Failed to register community edition', { error: ensureError(e) });
				throw new BadRequestError('Failed to register community edition');
			}
		}
		*/
	}

	getManagementJwt(): string {
		return this.license.getManagementJwt();
	}

	// Overload signatures
	async activateLicense(activationKey: string): Promise<void>;
	async activateLicense(activationKey: string, eulaUri: string, userEmail: string): Promise<void>;
	// Implementation signature
	async activateLicense(
		_activationKey: string, // [CUSTOM-FORK] License Activation: Unused - activation is no-op
		_eulaUri?: string, // [CUSTOM-FORK] License Activation: Unused - activation is no-op
		_userEmail?: string, // [CUSTOM-FORK] License Activation: Unused - activation is no-op
	): Promise<void> {
		// [CUSTOM-FORK] License Activation: Skip external activation - license already active locally
		// License is already activated locally with full Enterprise plan
		// No external server calls needed
		this.logger.debug('License activation skipped - local full license already active');
		return;
		// [CUSTOM-FORK] End License Activation

		// Original activation code commented out to prevent external server calls
		/*
		try {
			if (eulaUri && userEmail) {
				await this.license.activate(activationKey, eulaUri, userEmail);
			} else if (!eulaUri && !userEmail) {
				await this.license.activate(activationKey);
			} else {
				throw new BadRequestError('When providing eulaUri, userEmail is required');
			}
		} catch (e) {
			// Check if this is a EULA_REQUIRED error from license server
			if (this.isEulaRequiredError(e)) {
				throw new LicenseEulaRequiredError('License activation requires EULA acceptance', {
					eulaUrl: e.info.eula.uri,
				});
			}

			const message = this.mapErrorMessage(ensureError(e), 'activate');
			throw new BadRequestError(message);
		}
		*/
	}

	private isEulaRequiredError(
		error: unknown,
	): error is Error & { errorId: string; info: { eula: { uri: string } } } {
		return (
			error instanceof Error &&
			'errorId' in error &&
			error.errorId === 'EULA_REQUIRED' &&
			'info' in error &&
			typeof error.info === 'object' &&
			error.info !== null &&
			'eula' in error.info &&
			typeof error.info.eula === 'object' &&
			error.info.eula !== null &&
			'uri' in error.info.eula &&
			typeof error.info.eula.uri === 'string'
		);
	}

	async renewLicense() {
		// [CUSTOM-FORK] License Activation: Skip renewal - local license never expires
		// Local full license never expires, no renewal needed
		this.logger.debug('License renewal skipped - local full license never expires');
		this.eventService.emit('license-renewal-attempted', { success: true });
		return;
		// [CUSTOM-FORK] End License Activation

		// Original renewal code commented out to prevent external server calls
		/*
		if (this.license.getPlanName() === 'Community') return; // unlicensed, nothing to renew

		try {
			await this.license.renew();
		} catch (e) {
			const message = this.mapErrorMessage(ensureError(e), 'renew');

			this.eventService.emit('license-renewal-attempted', { success: false });
			throw new BadRequestError(message);
		}

		this.eventService.emit('license-renewal-attempted', { success: true });
		*/
	}

	private mapErrorMessage(error: Error, action: 'activate' | 'renew') {
		let message: string | undefined;

		if (this.isLicenseError(error) && error.errorId in LicenseErrors) {
			message = LicenseErrors[error.errorId as keyof typeof LicenseErrors];
		}

		if (!message) {
			message = `Failed to ${action} license: ${error.message}`;
			this.logger.error(message, { stack: error.stack ?? 'n/a' });
		}
		return message;
	}

	private isLicenseError(error: Error): error is Error & { errorId: string } {
		return 'errorId' in error && typeof error.errorId === 'string';
	}
}
