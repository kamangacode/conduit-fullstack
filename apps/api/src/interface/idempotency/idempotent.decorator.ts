import { SetMetadata } from '@nestjs/common'

/** Clé de métadonnée lue par `IdempotencyInterceptor`. */
export const IDEMPOTENT_ROUTE = 'idempotent-route'

/**
 * Marque une route comme acceptant l'en-tête `Idempotency-Key` (ADR 027).
 *
 * La protection est **déclarée route par route**, jamais globale. Une route non
 * marquée n'est pas protégée, et cela se lit dans le contrôleur — là où un
 * intercepteur global rendrait la question invisible et ferait porter à chaque
 * endpoint futur un comportement que personne n'a choisi pour lui.
 *
 * Ne s'applique qu'aux **créations** : `PUT` et `DELETE` sont idempotents par
 * sémantique HTTP, les favoris et le suivi le sont par leur clé composite en
 * base. Les seules routes qui en avaient besoin sont celles qui produisent une
 * ressource nouvelle à chaque appel.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_ROUTE, true)
