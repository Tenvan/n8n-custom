import { CommunityRegisteredRequestDto } from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import { Get, Post, RestController, GlobalScope, Body } from '@n8n/decorators';
import type { AxiosError } from 'axios';
import { InstanceSettings } from 'n8n-core';

import { LicenseService } from './license.service';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { LicenseRequest } from '@/requests';
import { UrlService } from '@/services/url.service';

@RestController('/license')
export class LicenseController {
	constructor(
		private readonly licenseService: LicenseService,
		private readonly instanceSettings: InstanceSettings,
		private readonly urlService: UrlService,
	) {}

	@Get('/')
	async getLicenseData() {
		return await this.licenseService.getLicenseData();
	}

	@Post('/enterprise/request_trial')
	@GlobalScope('license:manage')
	async requestEnterpriseTrial(req: AuthenticatedRequest) {
		// [CUSTOM-FORK] License Activation: Endpoint works but trial request is no-op (license already active locally)
		try {
			await this.licenseService.requestEnterpriseTrial(req.user);
		} catch (error: unknown) {
			if (error instanceof Error) {
				const errorMsg =
					(error as AxiosError<{ message: string }>).response?.data?.message ?? error.message;

				throw new BadRequestError(errorMsg);
			} else {
				throw new BadRequestError('Failed to request trial');
			}
		}
		// [CUSTOM-FORK] End License Activation
	}

	@Post('/enterprise/community-registered')
	@GlobalScope('license:manage')
	async registerCommunityEdition(
		req: AuthenticatedRequest,
		_res: Response,
		@Body payload: CommunityRegisteredRequestDto,
	) {
		// [CUSTOM-FORK] License Activation: Endpoint works but registration is no-op (no external HTTP call)
		return await this.licenseService.registerCommunityEdition({
			userId: req.user.id,
			email: payload.email,
			instanceId: this.instanceSettings.instanceId,
			instanceUrl: this.urlService.getInstanceBaseUrl(),
			licenseType: 'community-registered',
		});
		// [CUSTOM-FORK] End License Activation
	}

	@Post('/activate')
	@GlobalScope('license:manage')
	async activateLicense(req: LicenseRequest.Activate) {
		// [CUSTOM-FORK] License Activation: Endpoint works but activation is no-op (license already active locally)
		const { activationKey, eulaUri } = req.body;
		if (eulaUri) {
			await this.licenseService.activateLicense(activationKey, eulaUri, req.user.email);
		} else {
			await this.licenseService.activateLicense(activationKey);
		}
		// Returns success response with Enterprise license data
		return await this.getTokenAndData();
		// [CUSTOM-FORK] End License Activation
	}

	@Post('/renew')
	@GlobalScope('license:manage')
	async renewLicense() {
		// [CUSTOM-FORK] License Activation: Endpoint works but renewal is no-op (local license never expires)
		await this.licenseService.renewLicense();
		// Returns success response with Enterprise license data
		return await this.getTokenAndData();
		// [CUSTOM-FORK] End License Activation
	}

	private async getTokenAndData() {
		const managementToken = this.licenseService.getManagementJwt();
		const data = await this.licenseService.getLicenseData();
		return { ...data, managementToken };
	}
}
