<script lang="ts" setup>
import { computed } from 'vue';
import { useSettingsStore } from '@/app/stores/settings.store';
import { useUsageStore } from '../usage.store';
import { N8nHeading } from '@n8n/design-system';
import OrgaMaxLogo from '@/app/components/OrgaMaxLogo.vue';

const settingsStore = useSettingsStore();
const usageStore = useUsageStore();

// [CUSTOM-FORK] License Activation: Custom Features Panel
const isEnterprisePlan = computed(() => {
	const planName = usageStore.planName.toLowerCase();
	return planName === 'enterprise' || planName.includes('enterprise');
});

const customFeatures = computed(() => {
	const features: Array<{ name: string; enabled: boolean }> = [];
	const enterprise = settingsStore.settings.enterprise;
	const publicApi = settingsStore.settings.publicApi;

	// REST API
	if (publicApi?.enabled) {
		features.push({ name: 'REST API', enabled: true });
	}

	// Enterprise Features
	if (enterprise) {
		if (enterprise.sharing) features.push({ name: 'Workflow Sharing', enabled: true });
		if (enterprise.logStreaming) features.push({ name: 'Log Streaming', enabled: true });
		if (enterprise.ldap) features.push({ name: 'LDAP', enabled: true });
		if (enterprise.saml) features.push({ name: 'SAML', enabled: true });
		if (enterprise.oidc) features.push({ name: 'OIDC', enabled: true });
		if (enterprise.mfaEnforcement) features.push({ name: 'MFA Enforcement', enabled: true });
		if (enterprise.advancedExecutionFilters) {
			features.push({ name: 'Advanced Execution Filters', enabled: true });
		}
		if (enterprise.variables) features.push({ name: 'Variables', enabled: true });
		if (enterprise.sourceControl) features.push({ name: 'Source Control', enabled: true });
		if (enterprise.externalSecrets) features.push({ name: 'External Secrets', enabled: true });
		if (enterprise.debugInEditor) features.push({ name: 'Debug in Editor', enabled: true });
		if (enterprise.binaryDataS3) features.push({ name: 'Binary Data S3', enabled: true });
		if (enterprise.workerView) features.push({ name: 'Worker View', enabled: true });
		if (enterprise.advancedPermissions) {
			features.push({ name: 'Advanced Permissions', enabled: true });
		}
		if (enterprise.apiKeyScopes) features.push({ name: 'API Key Scopes', enabled: true });
		if (enterprise.workflowDiffs) features.push({ name: 'Workflow Diffs', enabled: true });
		if (enterprise.customRoles) features.push({ name: 'Custom Roles', enabled: true });
	}

	return features;
});
// [CUSTOM-FORK] End License Activation
</script>

<template>
	<!-- [CUSTOM-FORK] License Activation: Custom Features Panel -->
	<div v-if="isEnterprisePlan && customFeatures.length > 0" :class="$style.customFeatures">
		<div :class="$style.header">
			<OrgaMaxLogo size="small" :class="$style.logo" />
			<N8nHeading tag="h3" size="medium" :class="$style.featuresTitle">
				Custom Features (Enterprise)
			</N8nHeading>
		</div>
		<div :class="$style.featuresGrid">
			<div v-for="feature in customFeatures" :key="feature.name" :class="$style.featureItem">
				<span :class="$style.featureCheck">✓</span>
				<span :class="$style.featureName">{{ feature.name }}</span>
			</div>
		</div>
	</div>
	<!-- [CUSTOM-FORK] End License Activation -->
</template>

<style lang="scss" module>
@use '@/app/css/variables' as *;

.customFeatures {
	margin: var(--spacing--2xl) 0 0;
	padding: var(--spacing--lg);
	background: var(--color--background--light-3);
	border-radius: var(--radius--lg);
	border: 1px solid var(--color--foreground);
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--md);
	margin-bottom: var(--spacing--md);
}

.logo {
	flex-shrink: 0;
}

.featuresTitle {
	margin: 0;
}

.featuresGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: var(--spacing--sm);
}

.featureItem {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
}

.featureCheck {
	color: var(--color--success);
	font-weight: bold;
}

.featureName {
	font-size: var(--font-size--sm);
	color: var(--color--text-base);
}
</style>
