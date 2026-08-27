import type { AuthenticatedRequest, TokenGrant } from '@n8n/db';
import { GLOBAL_OWNER_ROLE, UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { getApiKeyScopesForRole } from '@n8n/permissions';

import type { AuthStrategy } from './auth-strategy.types';

/**
 * Nur `req.socket.remoteAddress` zaehlt — die einzige Adresse, die ein Client nicht
 * faelschen kann. `X-Forwarded-For` und `Host` werden bewusst nicht ausgewertet:
 * beide sind client-kontrolliert und wuerden den Bypass aus dem Netz erreichbar machen.
 */
function isLoopbackAddress(address: string | undefined): boolean {
	if (!address) return false;
	// IPv4-mapped IPv6 (::ffff:127.0.0.1) auf die IPv4-Form normalisieren.
	const normalized = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
	return normalized === '::1' || normalized.startsWith('127.');
}

/**
 * [CUSTOM-FORK] Local IPC: Authentifiziert Requests von localhost als Instance-Owner,
 * damit das ErpApi-Projekt die Public API ohne API-Key ansprechen kann.
 *
 * Wird in server.ts NACH den regulaeren Strategies registriert: ein mitgeschickter
 * API-Key oder Session-Cookie gewinnt weiterhin, diese Strategy greift nur, wenn
 * die anderen abstainen (= gar keine Credentials im Request).
 */
@Service()
export class LocalIpcAuthStrategy implements AuthStrategy {
	constructor(private readonly userRepository: UserRepository) {}

	async buildTokenGrant(): Promise<TokenGrant | null> {
		// Token-basierte Auth ist nicht unser Fall — andere Strategies uebernehmen.
		return null;
	}

	async authenticate(req: AuthenticatedRequest): Promise<boolean | null> {
		if (!isLoopbackAddress(req.socket.remoteAddress)) return null;

		const owner = await this.userRepository.findOne({
			where: { role: { slug: GLOBAL_OWNER_ROLE.slug } },
			relations: { role: true },
		});

		if (!owner || owner.disabled) return null;

		req.user = owner;
		req.tokenGrant = {
			scopes: owner.role.scopes.map((scope) => scope.slug),
			subject: owner,
			apiKeyScopes: getApiKeyScopesForRole(owner),
		};

		return true;
	}
}
