import type { LicenseProvider } from '@n8n/backend-common';
import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import {
	DEFAULT_WORKFLOW_HISTORY_PRUNE_LIMIT,
	LICENSE_FEATURES,
	LICENSE_QUOTAS,
	// Time, // [CUSTOM-FORK] License Activation: Unused - LicenseManager SDK initialization commented out
	UNLIMITED_LICENSE_QUOTA,
	type BooleanLicenseFeature,
	type NumericLicenseFeature,
} from '@n8n/constants';
import { SettingsRepository } from '@n8n/db';
import { OnPubSubEvent, OnShutdown } from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { TEntitlement, TLicenseBlock } from '@n8n_io/license-sdk';
import { LicenseManager } from '@n8n_io/license-sdk';
import { InstanceSettings } from 'n8n-core';

import { LicenseMetricsService } from '@/metrics/license-metrics.service';

import { SETTINGS_LICENSE_CERT_KEY } from './constants';
// import { N8N_VERSION } from './constants'; // [CUSTOM-FORK] License Activation: Unused - LicenseManager SDK initialization commented out

// [CUSTOM-FORK] License Activation: Unused - LicenseManager SDK initialization commented out
// const LICENSE_RENEWAL_DISABLED_WARNING =
// 	'Automatic license renewal is disabled. The license will not renew automatically, and access to licensed features may be lost!';
// [CUSTOM-FORK] End License Activation

export type FeatureReturnType = Partial<
	{
		planName: string;
	} & { [K in NumericLicenseFeature]: number } & { [K in BooleanLicenseFeature]: boolean }
>;

type LicenseRefreshCallback = (cert: string) => void;

@Service()
export class License implements LicenseProvider {
	private manager: LicenseManager | undefined;

	private isShuttingDown = false;

	private refreshCallbacks: LicenseRefreshCallback[] = [];

	// [CUSTOM-FORK] License Activation: Local full license activation flag
	private localFullLicenseActive = false;
	private localPlanName = 'Enterprise';
	// [CUSTOM-FORK] End License Activation

	// [CUSTOM-FORK] License Activation: Konstruktor-Signatur bleibt identisch zu master,
	// damit Upstream-Tests und DI unveraendert bleiben. licenseMetricsService wird nicht
	// mehr gelesen, seit die LicenseManager-SDK-Initialisierung entfaellt.
	constructor(
		private readonly logger: Logger,
		private readonly instanceSettings: InstanceSettings,
		private readonly settingsRepository: SettingsRepository,
		_licenseMetricsService: LicenseMetricsService,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger = this.logger.scoped('license');
	}
	// [CUSTOM-FORK] End License Activation

	async init({
		forceRecreate = false,
		// isCli = false, // [CUSTOM-FORK] License Activation: Unused - LicenseManager SDK initialization commented out
	}: { forceRecreate?: boolean; isCli?: boolean } = {}) {
		// [CUSTOM-FORK] License Activation: Bypass LicenseManager SDK initialization, activate local full license
		// Skip LicenseManager SDK initialization to avoid external server calls
		// Instead, activate local full license with Enterprise plan and all features enabled
		if (this.localFullLicenseActive && !forceRecreate) {
			this.logger.debug('Local full license already active');
			return;
		}
		if (this.isShuttingDown) {
			this.logger.warn('License manager already shutting down');
			return;
		}

		// Activate local full license - bypass LicenseManager SDK completely
		this.localFullLicenseActive = true;
		this.localPlanName = 'Enterprise';
		this.logger.info('Local full license activated: Enterprise plan with all features enabled');
		// [CUSTOM-FORK] End License Activation
	}

	async loadCertStr(): Promise<TLicenseBlock> {
		// if we have an ephemeral license, we don't want to load it from the database
		const ephemeralLicense = this.globalConfig.license.cert;
		if (ephemeralLicense) {
			return ephemeralLicense;
		}
		const databaseSettings = await this.settingsRepository.findOne({
			where: {
				key: SETTINGS_LICENSE_CERT_KEY,
			},
		});

		return databaseSettings?.value ?? '';
	}

	async saveCertStr(value: TLicenseBlock): Promise<void> {
		// if we have an ephemeral license, we don't want to save it to the database
		if (this.globalConfig.license.cert) return;
		await this.settingsRepository.upsert(
			{
				key: SETTINGS_LICENSE_CERT_KEY,
				value,
				loadOnStartup: false,
			},
			['key'],
		);
	}

	/**
	 * Register a callback to be notified when license certificate is refreshed.
	 * Returns an unsubscribe function.
	 */
	onCertRefresh(refreshCallback: LicenseRefreshCallback): () => void {
		this.refreshCallbacks.push(refreshCallback);
		return () => {
			const index = this.refreshCallbacks.indexOf(refreshCallback);
			if (index > -1) {
				this.refreshCallbacks.splice(index, 1);
			}
		};
	}

	private async notifyRefreshCallbacks(): Promise<void> {
		const cert = await this.loadCertStr();
		for (const refreshCallback of this.refreshCallbacks) {
			try {
				refreshCallback(cert);
			} catch (error) {
				this.logger.error('Error in license refresh callback', { error });
			}
		}
	}

	async activate(_activationKey: string): Promise<void>; // [CUSTOM-FORK] License Activation: Unused param - activation is no-op
	async activate(_activationKey: string, _eulaUri: string, _userEmail: string): Promise<void>; // [CUSTOM-FORK] License Activation: Unused params - activation is no-op
	async activate(_activationKey: string, _eulaUri?: string, _userEmail?: string): Promise<void> {
		// [CUSTOM-FORK] License Activation: Unused params - activation is no-op
		// [CUSTOM-FORK] License Activation: Skip external activation, license already active locally
		// License is already activated locally with full Enterprise plan
		// No external server calls needed
		this.logger.debug('License activation skipped - local full license already active');
		return;
		// [CUSTOM-FORK] End License Activation

		// Original activation code commented out to prevent external server calls
		/*
		if (!this.manager) {
			return;
		}

		await this.manager.activate(activationKey, { eulaUri, email: userEmail });
		this.logger.debug('License activated');
		*/
	}

	@OnPubSubEvent('reload-license')
	async reload(): Promise<void> {
		if (!this.manager) {
			return;
		}
		await this.manager.reload();
		await this.notifyRefreshCallbacks();
		this.logger.debug('License reloaded');
	}

	/** Runs one auto-renewal pass, gated by the SDK on its auto-renewal flag. */
	async renewIfDue(): Promise<void> {
		await this.manager?.renewIfDue();
	}

	async renew() {
		// [CUSTOM-FORK] License Activation: Skip renewal - local license never expires
		if (this.localFullLicenseActive) {
			this.logger.debug('License renewal skipped - local full license never expires');
			return;
		}
		// [CUSTOM-FORK] End License Activation
		if (!this.manager) {
			return;
		}

		await this.manager.renew();
		this.logger.debug('License renewed');
	}

	async clear() {
		if (!this.manager) {
			return;
		}

		await this.manager.clear();
		this.logger.info('License cleared');
	}

	@OnShutdown()
	async shutdown() {
		// [CUSTOM-FORK] License Activation: Skip SDK shutdown for local license
		this.isShuttingDown = true;
		if (this.localFullLicenseActive) {
			this.logger.debug('Local license shutdown - no external cleanup needed');
			return;
		}
		// [CUSTOM-FORK] End License Activation

		// Shut down License manager to unclaim any floating entitlements
		// Note: While this saves a new license cert to DB, the previous entitlements are still kept in memory so that the shutdown process can complete
		if (!this.manager) {
			return;
		}

		await this.manager.shutdown();
		this.logger.debug('License shut down');
	}

	isLicensed(feature: BooleanLicenseFeature) {
		// [CUSTOM-FORK] License Activation: Return true for all features when local full license is active
		// Exceptions:
		// - SHOW_NON_PROD_BANNER should be false for Enterprise license
		// - API_DISABLED should be false to enable REST API
		if (this.localFullLicenseActive) {
			// Don't show non-production banner for Enterprise license
			if (feature === LICENSE_FEATURES.SHOW_NON_PROD_BANNER) {
				return false;
			}
			// Enable REST API by returning false for API_DISABLED feature
			if (feature === LICENSE_FEATURES.API_DISABLED) {
				return false;
			}
			return true;
		}
		// [CUSTOM-FORK] End License Activation
		return this.manager?.hasFeatureEnabled(feature) ?? false;
	}

	isCertValid(): boolean {
		return this.manager?.isValid(false /* useLogger */) ?? false;
	}

	hasFeatureInCert(feature: BooleanLicenseFeature): boolean {
		return this.manager?.hasFeatureEnabled(feature, false) ?? false;
	}

	/** @deprecated Use `LicenseState.isDynamicCredentialsLicensed` instead. */
	isDynamicCredentialsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.DYNAMIC_CREDENTIALS);
	}

	/** @deprecated Use `LicenseState.isSharingLicensed` instead. */
	isSharingEnabled() {
		return this.isLicensed(LICENSE_FEATURES.SHARING);
	}

	/** @deprecated Use `LicenseState.isLogStreamingLicensed` instead. */
	isLogStreamingEnabled() {
		return this.isLicensed(LICENSE_FEATURES.LOG_STREAMING);
	}

	/** @deprecated Use `LicenseState.isLdapLicensed` instead. */
	isLdapEnabled() {
		return this.isLicensed(LICENSE_FEATURES.LDAP);
	}

	/** @deprecated Use `LicenseState.isSamlLicensed` instead. */
	isSamlEnabled() {
		return this.isLicensed(LICENSE_FEATURES.SAML);
	}

	/** @deprecated Use `LicenseState.isAiAssistantLicensed` instead. */
	isAiAssistantEnabled() {
		return this.isLicensed(LICENSE_FEATURES.AI_ASSISTANT);
	}

	/** @deprecated Use `LicenseState.isAskAiLicensed` instead. */
	isAskAiEnabled() {
		return this.isLicensed(LICENSE_FEATURES.ASK_AI);
	}

	/** @deprecated Use `LicenseState.isAiCreditsLicensed` instead. */
	isAiCreditsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.AI_CREDITS);
	}

	/** @deprecated Use `LicenseState.isAdvancedExecutionFiltersLicensed` instead. */
	isAdvancedExecutionFiltersEnabled() {
		return this.isLicensed(LICENSE_FEATURES.ADVANCED_EXECUTION_FILTERS);
	}

	/** @deprecated Use `LicenseState.isAdvancedPermissionsLicensed` instead. */
	isAdvancedPermissionsLicensed() {
		return this.isLicensed(LICENSE_FEATURES.ADVANCED_PERMISSIONS);
	}

	/** @deprecated Use `LicenseState.isDebugInEditorLicensed` instead. */
	isDebugInEditorLicensed() {
		return this.isLicensed(LICENSE_FEATURES.DEBUG_IN_EDITOR);
	}

	/** @deprecated Use `LicenseState.isBinaryDataS3Licensed` instead. */
	isBinaryDataS3Licensed() {
		return this.isLicensed(LICENSE_FEATURES.BINARY_DATA_S3);
	}

	/** @deprecated Use `LicenseState.isMultiMainLicensed` instead. */
	isMultiMainLicensed() {
		return this.isLicensed(LICENSE_FEATURES.MULTIPLE_MAIN_INSTANCES);
	}

	/** @deprecated Use `LicenseState.isVariablesLicensed` instead. */
	isVariablesEnabled() {
		return this.isLicensed(LICENSE_FEATURES.VARIABLES);
	}

	/** @deprecated Use `LicenseState.isSourceControlLicensed` instead. */
	isSourceControlLicensed() {
		return this.isLicensed(LICENSE_FEATURES.SOURCE_CONTROL);
	}

	/** @deprecated Use `LicenseState.isExternalSecretsLicensed` instead. */
	isExternalSecretsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.EXTERNAL_SECRETS);
	}

	/** @deprecated Use `LicenseState.isAPIDisabled` instead. */
	isAPIDisabled() {
		return this.isLicensed(LICENSE_FEATURES.API_DISABLED);
	}

	/** @deprecated Use `LicenseState.isWorkerViewLicensed` instead. */
	isWorkerViewLicensed() {
		return this.isLicensed(LICENSE_FEATURES.WORKER_VIEW);
	}

	/** @deprecated Use `LicenseState.isProjectRoleAdminLicensed` instead. */
	isProjectRoleAdminLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_ADMIN);
	}

	/** @deprecated Use `LicenseState.isProjectRoleEditorLicensed` instead. */
	isProjectRoleEditorLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_EDITOR);
	}

	/** @deprecated Use `LicenseState.isProjectRoleViewerLicensed` instead. */
	isProjectRoleViewerLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_VIEWER);
	}

	/** @deprecated Use `LicenseState.isCustomNpmRegistryLicensed` instead. */
	isCustomNpmRegistryEnabled() {
		return this.isLicensed(LICENSE_FEATURES.COMMUNITY_NODES_CUSTOM_REGISTRY);
	}

	/** @deprecated Use `LicenseState.isFoldersLicensed` instead. */
	isFoldersEnabled() {
		return this.isLicensed(LICENSE_FEATURES.FOLDERS);
	}

	getCurrentEntitlements() {
		return this.manager?.getCurrentEntitlements() ?? [];
	}

	getValue<T extends keyof FeatureReturnType>(feature: T): FeatureReturnType[T] {
		// [CUSTOM-FORK] License Activation: Return Enterprise plan and unlimited quotas when local full license is active
		if (this.localFullLicenseActive) {
			if (feature === 'planName') {
				return this.localPlanName as FeatureReturnType[T];
			}
			// Return unlimited for all quota features
			if (Object.values(LICENSE_QUOTAS).includes(feature as NumericLicenseFeature)) {
				return UNLIMITED_LICENSE_QUOTA as FeatureReturnType[T];
			}
			// Return true for all boolean features
			if (Object.values(LICENSE_FEATURES).includes(feature as BooleanLicenseFeature)) {
				return true as FeatureReturnType[T];
			}
		}
		// [CUSTOM-FORK] End License Activation
		return this.manager?.getFeatureValue(feature) as FeatureReturnType[T];
	}

	getManagementJwt(): string {
		if (!this.manager) {
			return '';
		}
		return this.manager.getManagementJwt();
	}

	/**
	 * Helper function to get the latest main plan for a license
	 */
	getMainPlan(): TEntitlement | undefined {
		if (!this.manager) {
			return undefined;
		}

		const entitlements = this.getCurrentEntitlements();
		if (!entitlements.length) {
			return undefined;
		}

		entitlements.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());

		return entitlements.find(
			(entitlement) => (entitlement.productMetadata?.terms as { isMainPlan?: boolean })?.isMainPlan,
		);
	}

	getConsumerId() {
		// [CUSTOM-FORK] License Activation: Return local consumer ID when local full license is active
		if (this.localFullLicenseActive) {
			return this.instanceSettings.instanceId;
		}
		// [CUSTOM-FORK] End License Activation
		return this.manager?.getConsumerId() ?? 'unknown';
	}

	// Helper functions for computed data

	/** @deprecated Use `LicenseState` instead. */
	getUsersLimit() {
		return this.getValue(LICENSE_QUOTAS.USERS_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	/** @deprecated Use `LicenseState` instead. */
	getTriggerLimit() {
		return this.getValue(LICENSE_QUOTAS.TRIGGER_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	/** @deprecated Use `LicenseState` instead. */
	getVariablesLimit() {
		return this.getValue(LICENSE_QUOTAS.VARIABLES_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	/** @deprecated Use `LicenseState` instead. */
	getAiCredits() {
		// [CUSTOM-FORK] License Activation: Return unlimited AI credits when local full license is active
		if (this.localFullLicenseActive) {
			return UNLIMITED_LICENSE_QUOTA;
		}
		// [CUSTOM-FORK] End License Activation
		return this.getValue(LICENSE_QUOTAS.AI_CREDITS) ?? 0;
	}

	/** @deprecated Use `LicenseState` instead. */
	getWorkflowHistoryPruneLimit() {
		return (
			this.getValue(LICENSE_QUOTAS.WORKFLOW_HISTORY_PRUNE_LIMIT) ??
			DEFAULT_WORKFLOW_HISTORY_PRUNE_LIMIT
		);
	}

	/** @deprecated Use `LicenseState` instead. */
	getTeamProjectLimit() {
		// [CUSTOM-FORK] License Activation: Return unlimited team projects when local full license is active
		if (this.localFullLicenseActive) {
			return UNLIMITED_LICENSE_QUOTA;
		}
		// [CUSTOM-FORK] End License Activation
		return this.getValue(LICENSE_QUOTAS.TEAM_PROJECT_LIMIT) ?? 0;
	}

	getPlanName(): string {
		// [CUSTOM-FORK] License Activation: Return Enterprise plan when local full license is active
		if (this.localFullLicenseActive) {
			return this.localPlanName;
		}
		// [CUSTOM-FORK] End License Activation
		return this.getValue('planName') ?? 'Community';
	}

	getExpiryDate(): Date | null {
		try {
			return this.manager?.getExpiryDate() ?? null;
		} catch {
			return null;
		}
	}

	getTerminationDate(): Date | null {
		try {
			return this.manager?.getTerminationDate() ?? null;
		} catch {
			return null;
		}
	}

	getExpiringInDays(): number | undefined {
		const expiryDate = this.getExpiryDate();
		if (!expiryDate) return undefined;

		const expiryTime = expiryDate.getTime();
		if (Number.isNaN(expiryTime)) return undefined;

		const now = new Date();
		const diffMs = expiryTime - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

		// Return 0 for already expired licenses instead of negative values
		return Math.max(0, diffDays);
	}

	getTerminatingInDays(): number | undefined {
		const terminationDate = this.getTerminationDate();
		if (!terminationDate) return undefined;

		const terminationTime = terminationDate.getTime();
		if (Number.isNaN(terminationTime)) return undefined;

		const now = new Date();
		const diffMs = terminationTime - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

		// Return 0 for already terminated licenses instead of negative values
		return Math.max(0, diffDays);
	}

	getInfo(): string {
		if (!this.manager) {
			return 'n/a';
		}

		return this.manager.toString();
	}

	/** @deprecated Use `LicenseState` instead. */
	isWithinUsersLimit() {
		return this.getUsersLimit() === UNLIMITED_LICENSE_QUOTA;
	}
}
