<script lang="ts" setup>
import { computed, useCssModule } from 'vue';
import { useUIStore } from '@/app/stores/ui.store';

const props = defineProps<{
	size?: 'small' | 'large';
	collapsed?: boolean;
}>();

const uiStore = useUIStore();
const $style = useCssModule();

// [CUSTOM-FORK] License Activation: OrgaMax Logo with theme support
const isDarkTheme = computed(() => uiStore.appliedTheme === 'dark');
const logoSource = computed(() => {
	const basePath = '/static/logos/orgamax';
	return isDarkTheme.value ? `${basePath}-dark.svg` : `${basePath}-light.svg`;
});

const containerClasses = computed(() => {
	const classes = [$style.logoContainer];
	if (props.size === 'large') {
		classes.push($style.large);
	} else {
		classes.push(props.collapsed ? $style.sidebarCollapsed : $style.sidebarExpanded);
	}
	return classes;
});
// [CUSTOM-FORK] End License Activation
</script>

<template>
	<!-- [CUSTOM-FORK] License Activation: OrgaMax Logo -->
	<div :class="containerClasses" data-test-id="orgamax-logo">
		<img :src="logoSource" alt="OrgaMax" :class="$style.logo" />
	</div>
	<!-- [CUSTOM-FORK] End License Activation -->
</template>

<style lang="scss" module>
@use '@/app/css/variables' as *;

.logoContainer {
	display: flex;
	justify-content: center;
	align-items: center;
}

.logo {
	height: auto;
	width: auto;
	max-width: 100%;
	max-height: 100%;
}

.large {
	transform: scale(1.5);
	margin-bottom: var(--spacing--xl);

	.logo {
		max-width: 200px;
		max-height: 60px;
	}
}

.sidebarExpanded {
	.logo {
		max-width: 150px;
		max-height: 40px;
	}
}

.sidebarCollapsed {
	.logo {
		max-width: 40px;
		max-height: 30px;
		padding: 0 var(--spacing--4xs);
	}
}
</style>
