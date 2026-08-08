'use client'

import { ProfilePageNotice } from '../../../components/ProfilePageNotice'

/**
 * L'API a refusé, ou n'a pas répondu (REQ-WEB-018 AC-4).
 *
 * Voir `article/[slug]/error.tsx` : frontière **de segment**, sans état, qui
 * n'expose ni le message d'exception ni un bouton de réessai — ce dernier
 * rejouerait le même rendu contre la même API.
 */
export default function ProfileError() {
  return <ProfilePageNotice kind="unavailable" />
}
