'use client'

import { type Article, createArticleDtoSchema, updateArticleDtoSchema } from '@repo/shared'
import { useRouter } from 'next/navigation'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import { useApi } from '../lib/api-provider'
import { toMessages } from '../lib/errors'
import { useSession } from '../lib/session'
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

export function ArticleEditor({ article }: ArticleEditorProps) {
  const api = useApi()
  const router = useRouter()
  const { user, status } = useSession()

  const [title, setTitle] = useState(article?.title ?? '')
  const [description, setDescription] = useState(article?.description ?? '')
  const [body, setBody] = useState(article?.body ?? '')
  const [tagList, setTagList] = useState<readonly string[]>(article?.tagList ?? [])
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // Redirection **dans un effet** et sur `status`, pas sur `user` : au premier
    // rendu la session n'est pas résolue et `user` vaut `null` pour tout le
    // monde — rediriger là éjecterait les utilisateurs connectés (AC-6).
    if (status === 'anonymous') {
      router.push('/login')
    }
  }, [status, router])

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
      setErrors(toMessages(error, { 500: 'something went wrong, please try again' }))
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

                <button
                  className="btn btn-lg pull-xs-right btn-primary"
                  type="submit"
                  disabled={pending || !user}
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
