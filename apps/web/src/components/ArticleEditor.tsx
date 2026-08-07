'use client'

import { type Article, createArticleDtoSchema, updateArticleDtoSchema } from '@repo/shared'
import { useRouter } from 'next/navigation'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { useApi } from '../lib/api-provider'
import { useAuthenticatedAccount } from '../lib/authenticated-page'
import { toMessages } from '../lib/errors'
import { ErrorMessages } from './ErrorMessages'

/**
 * Éditeur d'article (REQ-WEB-014), markup RealWorld (rule 11).
 *
 * Un seul composant pour la création et la modification : les deux partagent
 * leur markup, leur validation et leur redirection, et ne diffèrent que par la
 * méthode d'API appelée. Les séparer aurait dupliqué tout cela pour une ligne.
 *
 * **Le piège que ce fichier ferme** tient en une phrase : la règle R-1 fait
 * dériver le slug du titre, donc **modifier le titre change l'URL**. Rediriger
 * vers le slug qu'on avait en main mènerait à une page introuvable juste après
 * un renommage réussi, et l'auteur croirait avoir cassé son article. La
 * redirection suit le slug que l'API **renvoie**.
 */

export interface ArticleEditorProps {
  /** Article à modifier ; absent en création. */
  readonly article?: Article
}

/**
 * Messages génériques de l'éditeur, pour les statuts que le contrat §10 laisse
 * sans détail par champ.
 *
 * Le 401 est le plus important des deux, et il manquait. Depuis REQ-WEB-019, un
 * 401 à la publication ne fait plus disparaître le formulaire : encore
 * faut-il qu'il **dise quelque chose**. Sans cette entrée, `toMessages` retombe
 * sur « request failed » — l'auteur reste devant son texte sans savoir que sa
 * session vient de se fermer, donc sans savoir que se reconnecter suffirait.
 *
 * La formulation est celle des autres formulaires authentifiés du front. Elle
 * n'est pas encore posée en constante partagée : les deux autres porteurs
 * (`SettingsForm`, `CommentSection`) relèvent d'autres lots en cours sur la même
 * vague, et les rallier ici produirait un conflit sans rapport avec ce
 * changement. Le regroupement est la prochaine occasion de toucher l'un d'eux.
 */
const EDITOR_MESSAGES: Readonly<Record<number, string>> = {
  401: 'your session has expired, please sign in again',
  500: 'something went wrong, please try again',
}

export function ArticleEditor({ article }: ArticleEditorProps) {
  const api = useApi()
  const router = useRouter()
  /**
   * Le compte **retenu** par la page, et non `user` de la session.
   *
   * La nuance est tout le sujet de REQ-WEB-019 : un 401 à la publication purge
   * le jeton (REQ-WEB-002 AC-4), donc `user` retombe à `null` et `status` à
   * `anonymous` alors que l'auteur est encore devant son texte. Rediriger là —
   * ce que faisait la redirection sur statut anonyme que portait ce composant —
   * emportait la saisie **et** le message qui l'expliquait, dans le même rendu.
   *
   * Le hook garde la redirection pour qui **arrive** sans session (AC-2,
   * REQ-WEB-014 AC-6) et ne la déclenche pas pour qui la perd en route (AC-1).
   */
  const account = useAuthenticatedAccount()

  const [title, setTitle] = useState(article?.title ?? '')
  const [description, setDescription] = useState(article?.description ?? '')
  const [body, setBody] = useState(article?.body ?? '')
  const [tagList, setTagList] = useState<readonly string[]>(article?.tagList ?? [])
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])

    const parsed = article
      ? updateArticleDtoSchema.safeParse({ title, description, body, tagList })
      : createArticleDtoSchema.safeParse({ title, description, body, tagList })

    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`))
      return
    }

    setPending(true)
    try {
      const saved = article
        ? await api.updateArticle(article.slug, parsed.data)
        : await api.createArticle(parsed.data as Parameters<typeof api.createArticle>[0])
      // Le slug **de la réponse** : sous un titre modifié, il diffère de celui
      // qu'on avait, et suivre l'ancien mènerait à une page introuvable.
      router.push(`/article/${saved.slug}`)
    } catch (error) {
      // La saisie est préservée : refaire écrire un article entier après un
      // refus serait la pire réponse possible à une erreur de validation.
      setErrors(toMessages(error, EDITOR_MESSAGES))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="container page">
        <div className="row">
          <div className="col-md-10 offset-md-1 col-xs-12">
            <ErrorMessages messages={errors} />

            <form onSubmit={submit}>
              <fieldset>
                <fieldset className="form-group">
                  <input
                    aria-label="Article Title"
                    className="form-control form-control-lg"
                    name="title"
                    placeholder="Article Title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </fieldset>
                <fieldset className="form-group">
                  <input
                    aria-label="What's this article about?"
                    className="form-control"
                    name="description"
                    placeholder="What's this article about?"
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </fieldset>
                <fieldset className="form-group">
                  <textarea
                    aria-label="Write your article (in markdown)"
                    className="form-control"
                    name="body"
                    placeholder="Write your article (in markdown)"
                    rows={8}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </fieldset>

                <TagField tagList={tagList} onChange={setTagList} />

                {/*
                  Désactivé tant qu'aucun compte n'a été résolu — donc pendant
                  la fenêtre de réhydratation (REQ-WEB-002 AC-5), où publier
                  partirait sans jeton. Après une purge en cours d'édition, le
                  compte retenu maintient le bouton actionnable : l'auteur peut
                  réessayer, échouer à nouveau, et lire pourquoi (REQ-WEB-019
                  AC-1) — plutôt que se retrouver devant un formulaire inerte
                  qu'aucun message n'explique.
                */}
                <button
                  className="btn btn-lg pull-xs-right btn-primary"
                  type="submit"
                  disabled={pending || !account}
                >
                  Publish Article
                </button>
              </fieldset>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Saisie des tags.
 *
 * Extraite pour garder l'éditeur sous la limite de lignes (rule 17), et parce
 * que c'est le seul champ qui porte une logique propre : ajouter à la validation
 * plutôt qu'à la frappe, et **refuser les doublons**. Le contrat ne les interdit
 * pas et l'API les accepterait — le résultat serait un article affichant deux
 * fois le même tag, ce que le lecteur lit comme un bug d'affichage. La saisie est
 * le seul endroit où l'intention est connue.
 */
function TagField({
  tagList,
  onChange,
}: {
  tagList: readonly string[]
  onChange(next: readonly string[]): void
}) {
  const [draft, setDraft] = useState('')

  function add(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    // Sans cela, la touche Entrée soumettrait le formulaire — l'article partirait
    // au moment où l'auteur croyait ajouter un tag.
    event.preventDefault()

    const tag = draft.trim()
    if (tag && !tagList.includes(tag)) {
      onChange([...tagList, tag])
    }
    setDraft('')
  }

  return (
    <fieldset className="form-group">
      <input
        aria-label="Enter tags"
        className="form-control"
        placeholder="Enter tags"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={add}
      />
      <div className="tag-list">
        {tagList.map((tag) => (
          <span className="tag-default tag-pill" key={tag}>
            <button
              aria-label={`Remove tag ${tag}`}
              type="button"
              onClick={() => onChange(tagList.filter((other) => other !== tag))}
            >
              <i className="ion-close-round" />
            </button>
            {tag}
          </span>
        ))}
      </div>
    </fieldset>
  )
}
