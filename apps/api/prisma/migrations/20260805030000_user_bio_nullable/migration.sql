-- Aligne `users.bio` sur le contrat RealWorld (docs/adr/004-persistance-alignee-sur-le-contrat.md).
--
-- `openapi.yml` déclare `bio` en `type: [string, 'null']` et l'exemple canonique
-- de la spec montre `"bio": null` pour un compte fraîchement authentifié. La
-- colonne était `NOT NULL DEFAULT ''`, donc un compte neuf aurait renvoyé `""`
-- là où la spec montre `null`.
--
-- Les deux valeurs ne sont pas interchangeables : `null` est l'absence de
-- biographie, `""` une biographie délibérément vide. `PUT /api/user` accepte
-- `bio: null` comme instruction d'effacement — la distinction est donc exigée par
-- le contrat, pas seulement esthétique.
--
-- Le `DEFAULT ''` est retiré en même temps que la contrainte `NOT NULL` : le
-- laisser ferait insérer `''` pour tout compte créé sans bio, ce qui rétablirait
-- exactement l'écart que cette migration corrige.
--
-- Aucune conversion des lignes existantes n'est faite. À ce stade le schéma n'a
-- jamais porté de données de production, et convertir `''` en `NULL` détruirait
-- justement la distinction qu'on vient d'introduire pour tout compte ayant
-- délibérément vidé sa biographie.
--
-- SQL produit par `prisma migrate diff`, pas écrit à la main.

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "bio" DROP NOT NULL,
ALTER COLUMN "bio" DROP DEFAULT;
