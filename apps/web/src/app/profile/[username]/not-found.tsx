import { ProfilePageNotice } from '../../../components/ProfilePageNotice'

/**
 * Username inconnu (REQ-WEB-018 AC-3).
 *
 * Posé sur `[username]` et non sur chaque route feuille : Next remonte au
 * `not-found` le plus proche, donc celui-ci couvre aussi `/favorites`. Le
 * dupliquer donnerait deux écrans à garder cohérents pour un même profil absent.
 */
export default function NotFound() {
  return <ProfilePageNotice kind="missing" />
}
