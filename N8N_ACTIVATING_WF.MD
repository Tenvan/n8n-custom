# N8N activation workflow map

**Hinweis:** Diese Dokumentation wurde in zwei separate Dateien aufgeteilt:

1. **[N8N_FIXED_USER_LOGIN.MD](N8N_FIXED_USER_LOGIN.MD)** - Fixed User Login mit eigenem Auth-Service
2. **[N8N_REMOVE_ACTIVATION.MD](N8N_REMOVE_ACTIVATION.MD)** - Entfernung Aktivierungspflicht bei gleichzeitiger Aktivierung aller Features

Bitte verwenden Sie die entsprechenden separaten Dateien für die jeweiligen Aufgaben.

---

**Original Objective:** Document all activation/registration/tracking locations for patching a customized N8N fork to run fully without activation or user registration, and prevent telemetry.

Source control info:
- Workspace branch: `feature/n8n-custom`
- Workspace commit: `91ba70c8a065cc42c1dd8570ea439daaf1edd772`
- `apps/n8n` submodule: `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

---

# Bereich 1: Fixed User Login mit eigenem Auth-Service

**Ziel:** Implementierung eines festen Benutzer-Logins mit eigenem Auth-Service nach dem Muster der originalen Implementierung.

**Umsetzungsrichtlinien:**
- Umsetzung soll mit möglichst wenig Code erfolgen, nur Deaktivierung ohne Entfernung alten Codes
- Wenn nötig - dann aber gezielt nachfragen - neues eigene Dateien erstellen, wenn massive Änderungen nötig sind
- Folgt dem Muster der originalen Auth-Implementierung

## UI Elements

### Authentication (custom fork)
**File Path:** `apps/n8n/packages/cli/src/auth/auth.service.ts`

**Code Snippet:**
```
assertFixedLoginCredentials(emailOrLdapLoginId: string, password: string) {
  if (emailOrLdapLoginId !== 'deltra@orgamax.de' || password !== '42200511') {
    throw new AuthError('Wrong username or password. Do you have caps lock on?');
  }
}
```

**Description:** Enforces a single fixed username/password in the backend auth service before any login is processed.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Keep restriction in the auth service so all login flows use the backend gate.

---

### SSO/OIDC/SAML (blocked in custom fork)
**File Path:** `apps/n8n/packages/cli/src/modules/sso-saml/middleware/saml-enabled-middleware.ts`

**Code Snippet:**
```
export const samlLicensedAndEnabledMiddleware: RequestHandler = (_req, res) => {
  res.status(403).json({ status: 'error', message: 'Unauthorized' });
};
```

**Description:** Forces all SAML endpoints to return 403, blocking SSO flows.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Keep this middleware as a hard stop to disable SAML entirely.

---

### OIDC (blocked in custom fork)
**File Path:** `apps/n8n/packages/cli/src/modules/sso-oidc/oidc.controller.ee.ts`

**Code Snippet:**
```
@Get('/login', { skipAuth: true })
@Licensed('feat:oidc')
async redirectToAuthProvider(_req: Request, res: Response) {
  throw new ForbiddenError('Unauthorized');
}
```

**Description:** Blocks OIDC login and callback flows by returning 403.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Keep the early 403 to disable OIDC entirely.

---

# Bereich 2: Entfernung Aktivierungspflicht bei gleichzeitiger Aktivierung aller Features

**Ziel:** Entfernung der Aktivierungspflicht bei gleichzeitiger Aktivierung aller Features, bzw. Entfernung aller Einschränkungen nach Lizenz.

**Umsetzungsrichtlinien:**
- Umsetzung soll mit möglichst wenig Code erfolgen, nur Deaktivierung ohne Entfernung alten Codes
- Wenn nötig - dann aber gezielt nachfragen - neues eigene Dateien erstellen, wenn massive Änderungen nötig sind
- Entfernung aller Einschränkungen nach Lizenz, gleichzeitige Aktivierung aller Features

## UI Elements

### SettingsUsageAndPlan.vue
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/views/SettingsUsageAndPlan.vue`

**Code Snippet:**
```
const onLicenseActivation = async (eulaUri?: string) => {
  await usageStore.activateLicense(activationKey.value.trim(), eulaUri?.trim());
};

onMounted(async () => {
  if (route.query.key) {
    await usageStore.activateLicense(route.query.key as string);
  }
});

const onAddActivationKey = () => {
  activationKeyModal.value = true;
  sendUsageTelemetry('add_activation_key');
};
```

**Description:** Main activation UI. Opens the activation key modal, sends usage telemetry on button click, and auto-activates when `?key=` query param is present. Also drives EULA flow (modal) and calls `usageStore.activateLicense`.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Hide activation button or hard-disable `canUserActivateLicense`, remove query-param activation, and ensure `sendUsageTelemetry` does not run.

---

### EulaAcceptanceModal.vue
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/components/EulaAcceptanceModal.vue`

**Code Snippet:**
```
<N8nCheckbox v-model="accepted" data-test-id="eula-checkbox">
  <template #label>
    <a :href="eulaUrl" target="_blank" rel="noopener noreferrer">
      {{ locale.baseText('settings.usageAndPlan.dialog.eula.link.text') }}
    </a>
  </template>
</N8nCheckbox>
```

**Description:** EULA acceptance modal shown when activation requires EULA acceptance, driven by `LicenseEulaRequiredError` from the backend.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove/skip EULA flow by preventing activation calls from the UI (or ignore EULA errors).

---

### CommunityPlusEnrollmentModal.vue
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/components/CommunityPlusEnrollmentModal.vue`

**Code Snippet:**
```
const closeModal = () => {
  telemetry.track('User skipped community plus');
};

const confirm = async () => {
  const { title, text } = await usageStore.registerCommunityEdition(email.value);
};
```

**Description:** Collects user email to register the Community edition, sends telemetry on skip, and calls `usageStore.registerCommunityEdition`.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Never open the modal (force `canUserRegisterCommunityPlus` false), and make registration API a no-op.

---

### usage.constants.ts
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/usage.constants.ts`

**Code Snippet:**
```
export const COMMUNITY_PLUS_DOCS_URL =
  'https://docs.n8n.io/hosting/community-edition-features/#registered-community-edition';
```

**Description:** Provides the registration documentation link used in the modal; useful to remove when disabling registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove links/UI that reference registration docs.

---

### RBAC scopes for activation and registration
**File Path:** `apps/n8n/packages/@n8n/permissions/src/roles/scopes/global-scopes.ee.ts`

**Code Snippet:**
```
'community:register',
'license:manage',
```

**Description:** Scopes used to gate activation (`license:manage`) and community registration (`community:register`). These scopes are used by UI and API checks.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** For an internal fork, optionally prevent these scopes from being granted or always return false from permission checks in UI.

## API Endpoints (Frontend Client)

### usage API client
**File Path:** `apps/n8n/packages/frontend/@n8n/rest-api-client/src/api/usage.ts`

**Code Snippet:**
```
export const activateLicenseKey = async (context, data) =>
  await makeRestApiRequest(context, 'POST', '/license/activate', data);

export const renewLicense = async (context) =>
  await makeRestApiRequest(context, 'POST', '/license/renew');
```

**Description:** Frontend REST calls for activation, renewal, trial request, and community registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Stub these calls or return early when activation/registration should be disabled.

---

### usage.store.ts
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/usage.store.ts`

**Code Snippet:**
```
const activateLicense = async (activationKey: string, eulaUri?: string) => {
  const data = await usageApi.activateLicenseKey(rootStore.restApiContext, {
    activationKey,
    eulaUri,
  });
  setData(data);
  await settingsStore.getSettings();
  await settingsStore.getModuleSettings();
};
```

**Description:** Frontend activation/renewal/registration logic, updates license state and reloads settings after activation.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `activateLicense` and `registerCommunityEdition` no-ops and ensure plan data stays `Community` to avoid UI blocks.

---

### settings.store.ts (telemetry session start)
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/stores/settings.store.ts`

**Code Snippet:**
```
if (fetchedSettings.telemetry.enabled) {
  void eventsApi.sessionStarted(rootStore.restApiContext);
}
```

**Description:** Frontend triggers a session-started telemetry event after settings load when telemetry is enabled.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the call or force `telemetry.enabled` to `false` server-side.

## API Endpoints (Backend)

### license.controller.ts
**File Path:** `apps/n8n/packages/cli/src/license/license.controller.ts`

**Code Snippet:**
```
@Post('/activate')
@GlobalScope('license:manage')
async activateLicense(req: LicenseRequest.Activate) {
  await this.licenseService.activateLicense(activationKey, eulaUri, req.user.email);
  return await this.getTokenAndData();
}
```

**Description:** Backend endpoints for license activation, renewal, trial, and community registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `/license/activate` and `/license/renew` no-ops returning a local Community response; optionally block `/license/enterprise/*` endpoints.

---

### requests.ts (License DTO)
**File Path:** `apps/n8n/packages/cli/src/requests.ts`

**Code Snippet:**
```
export declare namespace LicenseRequest {
  type Activate = AuthenticatedRequest<{}, {}, { activationKey: string; eulaUri?: string }, {}>;
}
```

**Description:** Type definitions for activation request payload.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** No patch required; referenced for documentation.

## Activation Logic (Backend)

### license.service.ts
**File Path:** `apps/n8n/packages/cli/src/license/license.service.ts`

**Code Snippet:**
```
async activateLicense(activationKey: string, eulaUri?: string, userEmail?: string) {
  await this.license.activate(activationKey, eulaUri, userEmail);
}

async registerCommunityEdition({ email, instanceId, instanceUrl, licenseType }) {
  await axios.post('https://enterprise.n8n.io/community-registered', {
    email, instanceId, instanceUrl, licenseType,
  });
}
```

**Description:** Activation forwards to `License.activate()` (SDK) and community registration calls an external n8n endpoint. Also raises `LicenseEulaRequiredError` when required by the license server.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Stub `activateLicense` and `registerCommunityEdition` to avoid external HTTP, return local success and set Community plan.

---

### license.ts (License provider)
**File Path:** `apps/n8n/packages/cli/src/license.ts`

**Code Snippet:**
```
this.manager = new LicenseManager({
  server: this.globalConfig.license.serverUrl,
  tenantId: this.globalConfig.license.tenantId,
  autoRenewEnabled: shouldRenew,
});

await this.manager.initialize();
```

**Description:** Central license SDK initialization, activation, and renewal. All license checks and entitlements flow through this provider.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Skip SDK init (return early), or force local Community plan with unlimited quotas.

---

### base-command.ts (auto-activation via env)
**File Path:** `apps/n8n/packages/cli/src/commands/base-command.ts`

**Code Snippet:**
```
const { activationKey } = this.globalConfig.license;
if (activationKey) {
  const hasCert = (await this.license.loadCertStr()).length > 0;
  if (!hasCert) await this.license.activate(activationKey);
}
```

**Description:** Automatically activates on startup if `N8N_LICENSE_ACTIVATION_KEY` is set.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove this block or guard with explicit opt-in for internal forks.

---

### license.config.ts
**File Path:** `apps/n8n/packages/@n8n/config/src/configs/license.config.ts`

**Code Snippet:**
```
@Env('N8N_LICENSE_SERVER_URL')
serverUrl: string = 'https://license.n8n.io/v1';
```

**Description:** License server configuration and activation key config.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Override defaults to local values or remove activation key config for internal builds.

---

### license-eula-required.error.ts
**File Path:** `apps/n8n/packages/cli/src/errors/response-errors/license-eula-required.error.ts`

**Code Snippet:**
```
export class LicenseEulaRequiredError extends ResponseError {
  constructor(message: string, readonly meta: { eulaUrl: string }) {
    super(message, 400);
  }
}
```

**Description:** Special error used to signal the EULA flow to the UI during activation.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Can be ignored if activation is fully disabled.

---

### Frontend settings propagation (license gating)
**File Path:** `apps/n8n/packages/cli/src/services/frontend.service.ts`

**Code Snippet:**
```
const telemetrySettings: ITelemetrySettings = {
  enabled: this.globalConfig.diagnostics.enabled,
};

this.settings.license.planName = this.license.getPlanName();
this.settings.license.consumerId = this.license.getConsumerId();
```

**Description:** Pushes license plan and telemetry/posthog flags to the frontend, affecting feature gates and UI visibility.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Force `telemetry.enabled` and `posthog.enabled` to `false`, and pin `planName` to `Community` with unlimited quotas.

## Tracking Mechanisms (Frontend)

### Telemetry plugin (frontend)
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/plugins/telemetry/index.ts`

**Code Snippet:**
```
if (!telemetrySettings.enabled || !telemetrySettings.config || this.rudderStack) return;

this.identify(instanceId, userId, versionCli, projectId);
this.track('Session started', { session_id: rootStore.pushRef });
```

**Description:** Initializes RudderStack in the editor UI, identifies user/instance, and sends session events. Used by `SettingsUsageAndPlan.vue` for usage telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `init()` return early unconditionally, or force `telemetrySettings.enabled = false`.

---

### PostHog store (frontend)
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/stores/posthog.store.ts`

**Code Snippet:**
```
const config = settingsStore.settings.posthog;
if (!config.enabled) {
  return;
}
window.posthog?.init(config.apiKey, options);
```

**Description:** Initializes PostHog client and captures feature flag/experiment telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Force `config.enabled` to false server-side or short-circuit `init()`.

---

### events API client (frontend)
**File Path:** `apps/n8n/packages/frontend/@n8n/rest-api-client/src/api/events.ts`

**Code Snippet:**
```
export async function sessionStarted(context) {
  return await makeRestApiRequest(context, 'GET', '/events/session-started');
}
```

**Description:** Sends session-started event to backend once settings load.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the call in `settings.store.ts` or return early here.

---

### Dynamic banners (frontend)
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/shared/banners/banners.store.ts`

**Code Snippet:**
```
await getDynamicBanners(settingsStore.settings.dynamicBanners.endpoint, {
  instanceId: settingsStore.settings.instanceId,
  planName: settingsStore.settings.license?.planName,
});
```

**Description:** Fetches remote banners using instance ID and plan name, which can be considered outbound tracking.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable dynamic banners in settings or short-circuit fetch.

## Tracking Mechanisms (Backend)

### telemetry/index.ts (backend)
**File Path:** `apps/n8n/packages/cli/src/telemetry/index.ts`

**Code Snippet:**
```
const { enabled, backendConfig } = this.globalConfig.diagnostics;
if (enabled) {
  const [key, dataPlaneUrl] = backendConfig.split(';');
  this.rudderStack = new RudderStack(key, { dataPlaneUrl });
  this.startPulse();
}
```

**Description:** Backend telemetry initialization and periodic pulse. Sends license plan name and usage data.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Return early from `init()` or force `diagnostics.enabled = false`.

---

### posthog/index.ts (backend)
**File Path:** `apps/n8n/packages/cli/src/posthog/index.ts`

**Code Snippet:**
```
const { enabled, posthogConfig } = this.globalConfig.diagnostics;
if (!enabled) {
  return;
}
this.postHog = new PostHog(posthogConfig.apiKey, { host: posthogConfig.apiHost });
```

**Description:** Backend PostHog client for feature flagging and event capture.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Keep `enabled` false or short-circuit client init.

---

### TelemetryEventRelay (backend)
**File Path:** `apps/n8n/packages/cli/src/events/relays/telemetry.event-relay.ts`

**Code Snippet:**
```
private licenseRenewalAttempted({ success }) {
  this.telemetry.track('Instance attempted to refresh license', { success });
}

private licenseCommunityPlusRegistered({ userId, email, licenseKey }) {
  this.telemetry.track('User registered for license community plus', {
    user_id: userId,
    email,
    licenseKey,
  });
}
```

**Description:** Emits telemetry for license renewal and community registration events (plus many others).

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable relay initialization when diagnostics are disabled.

---

### telemetry.controller.ts (backend proxy)
**File Path:** `apps/n8n/packages/cli/src/controllers/telemetry.controller.ts`

**Code Snippet:**
```
@Post('/proxy/:version/track', { skipAuth: true })
async track(req, res, next) {
  await this.proxy(req, res, next);
}
```

**Description:** Proxies frontend telemetry requests to RudderStack.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable the proxy routes or return 204/410.

---

### posthog.controller.ts (backend proxy)
**File Path:** `apps/n8n/packages/cli/src/controllers/posthog.controller.ts`

**Code Snippet:**
```
@Post('/capture/', { skipAuth: true })
async capture(req, res, next) {
  return await this.proxy(req, res, next);
}
```

**Description:** Proxies PostHog requests from the frontend.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable the proxy routes or return 204/410.

---

### events.controller.ts (backend)
**File Path:** `apps/n8n/packages/cli/src/events/events.controller.ts`

**Code Snippet:**
```
@Get('/session-started')
sessionStarted(req: AuthenticatedRequest) {
  const pushRef = req.headers['push-ref'];
  this.eventService.emit('session-started', { pushRef });
}
```

**Description:** Backend endpoint receiving session-started events from the frontend, relayed into telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the event emission or disable the endpoint.

---

### diagnostics.config.ts
**File Path:** `apps/n8n/packages/@n8n/config/src/configs/diagnostics.config.ts`

**Code Snippet:**
```
@Env('N8N_DIAGNOSTICS_ENABLED')
enabled: boolean = true;
```

**Description:** Global switch for diagnostics/telemetry (frontend + backend).

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Default to `false` and enable only via explicit env var.

## Activation/Registration Data Flow (Summary)

1) UI activation button in `SettingsUsageAndPlan.vue` opens modal and calls `usage.store.activateLicense()`.
2) `usage.store` calls REST endpoints via `@n8n/rest-api-client` to `/license/activate` or `/license/renew`.
3) Backend `LicenseController` calls `LicenseService.activateLicense()` which uses `License.activate()` (license SDK).
4) License SDK uses `N8N_LICENSE_SERVER_URL`, `N8N_LICENSE_ACTIVATION_KEY` (auto-activation in `BaseCommand`) and persists certs.
5) Frontend settings (`FrontendService`) propagate license plan and telemetry flags; license plan controls feature access.
6) Community registration calls `/license/enterprise/community-registered` and triggers telemetry via `TelemetryEventRelay`.
