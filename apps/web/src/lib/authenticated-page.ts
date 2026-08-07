'use client'

import type { User } from '@repo/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSession } from './session'

/**
 * Règle commune aux pages **authentifiées** (REQ-WEB-019).
 *
 * Une page réservée au compte connecté doit trancher une question que
 * `status === 'anonymous'` ne suffit pas à trancher : cette personne **arrive**
 * sans session, ou vient de la **perdre** sous les doigts ?
 *
 * Les deux se ressemblent à s'y méprendre — même statut, même `user === null` —
 * et n'appellent pas du tout la même réponse :
 *
 * - **Arriver anonyme** : il n'y a rien à montrer, on redirige vers la
 *   connexion (REQ-WEB-004 AC-5, REQ-WEB-014 AC-6).
 * - **Le devenir en cours de route** : un 401 sur la soumission a purgé le
 *   jeton, comme REQ-WEB-002 AC-4 l'exige. Rediriger là ferait disparaître la
 *   saisie *et* le message qui l'explique, dans le même rendu. L'utilisateur
 *   verrait son travail s'évaporer et atterrirait sur un formulaire de
 *   connexion muet.
 *
 * La distinction se fait sur un fait simple : **un compte a-t-il déjà été
 * résolu sur cette page ?** Le premier compte vu y est retenu et n'est plus
 * relâché ; tant qu'il est là, la page reste. C'est la seule information que le
 * statut de session ne porte pas, parce qu'elle est propre à la page et non à
 * la session.
 *
 * **Ce hook ne prolonge aucune session.** Le jeton est purgé, la barre de
 * navigation repasse anonyme, et toute requête suivante partira sans en-tête
 * d'autorisation — donc échouera. C'est voulu : l'API fait autorité (rule 10),
 * et le compte retenu ne sert qu'à continuer de **rendre** un formulaire déjà
 * affiché.
 *
 * Extrait de `app/settings/page.tsx`, qui portait cette règle seul depuis
 * REQ-WEB-004 AC-7 — et l'éditeur d'article ne la portait pas. Une règle écrite
 * dans une page ne protège que cette page ; la troisième à naître l'aurait
 * redécouverte par un incident (REQ-WEB-019 AC-4).
 */
export function useAuthenticatedAccount(): User | null {
  const router = useRouter()
  const { user, status } = useSession()

  /**
   * Dernier compte résolu **sur cette page**.
   *
   * Un état local et non une lecture de la session : c'est précisément parce
   * que la session peut le perdre qu'on en garde une copie.
   */
  const [account, setAccount] = useState<User | null>(null)

  useEffect(() => {
    if (user) {
      setAccount(user)
    }
  }, [user])

  useEffect(() => {
    // On attend que la session soit **résolue**. Rediriger sur `user === null`
    // éjectait les utilisateurs connectés : les effets React se déclenchent des
    // enfants vers les parents, donc l'effet d'une page s'exécute avant que
    // `SessionProvider` ait relu le stockage, et `user` y vaut toujours `null`.
    // `status` lève cette ambiguïté, `pending` n'étant ni « anonyme » ni
    // « connecté ».
    //
    // `!account` restreint la redirection à ceux qui **arrivent** sans session.
    if (status === 'anonymous' && !account) {
      router.push('/login')
    }
  }, [status, account, router])

  return account
}
