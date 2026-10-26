# Pochette musicale Instagram : chemin vérifié

Investigation du 26 octobre 2026, après création de la PR #48. La cover n'est
pas impossible à obtenir : la page audio Instagram fournit une URL fraîche
lorsqu'on connaît un véritable identifiant audio. Aucun code de récupération ou
d'affichage de cover n'est ajouté par cette investigation.

## Résultat positif

Un ancien cache contient ces informations reçues, sans déduire l'identité du titre :

- Morceau : **Glide — NEIKED, Portugal. The Man**.
- `audio_asset_id` : `1088211046447259`.
- Identifiant externe du sticker : `18104728184265296`, distinct de l'asset.

L'ouverture de `https://www.instagram.com/reels/audio/1088211046447259/` dans la
session Web authentifiée affiche le bon morceau. Le navigateur effectue :

```text
POST /api/v1/clips/music/
audio_cluster_id=1088211046447259
original_sound_audio_asset_id=1088211046447259
max_id=
```

La requête réelle comporte aussi les paramètres de transport et jetons de la
session Instagram Web. Leurs valeurs sont volontairement omises ici ; ces trois
lignes seules ne constituent pas une requête authentifiée autonome.

La réponse HTTP 200 contient :

```text
payload.metadata.music_info.music_asset_info
  audio_asset_id: 1088211046447259
  audio_cluster_id: 1688970368705265
  title: Glide
  display_artist: NEIKED, Portugal. The Man
  cover_artwork_uri: <URL CDN signée reçue>
  cover_artwork_thumbnail_uri: <URL CDN signée reçue>
```

Le GET de `cover_artwork_uri` répond **HTTP 200**, `image/jpeg`, **32 543 octets**.
Le navigateur décode une image de **526 × 526 pixels**. Il s'agit d'une pochette
obtenue depuis la réponse musicale, pas d'une miniature de story ou d'un avatar.
La réussite est vérifiée pour cet asset ; elle ne garantit pas la disponibilité
de tous les morceaux ni la validité future d'une URL signée.

Le client open source [instagrapi, TrackMixin](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/track.py)
utilise également `clips/music/` pour consulter des métadonnées musicales. Le
chemin constaté dans le navigateur confirme son utilisation avec notre session
Web, sans installer ce client ni ouvrir une nouvelle session mobile.

## Limite des stories actuelles

Le GraphQL utilisé pour les stories ne sélectionne toujours que les indicateurs
de sourdine, le titre et l'artiste dans `music_asset_info`. Le manifeste DASH
fournit leur bande sonore, mais pas l'identité de l'asset musical ou sa pochette.

Deux identifiants externes réellement reçus ont été essayés comme candidats pour
une page audio, sans les enregistrer comme identités musicales :

| Story                 | Morceau déclaré                         | Identifiant externe essayé | Résultat                                                               |
| --------------------- | --------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `4016307915417510030` | Clocks — Coldplay                       | `1586058940227008`         | Endpoint HTTP 200, mais aucune métadonnée musicale et page audio vide. |
| `4016312263132361859` | On Fire (Instrumental) — Giulio Cercato | `29093081140334722`        | Endpoint HTTP 200, mais aucune métadonnée musicale et page audio vide. |

Ces essais confirment qu'on ne peut pas remplacer l'identité musicale manquante
par `providerOccurrenceId`.

Autres observations, avec les mêmes droits de session :

- Cliquer le libellé musical dans l'en-tête de la story Web n'ouvre pas de fiche
  musicale et ne déclenche pas de nouvelle requête de métadonnées observée.
- `GET /api/v1/media/4016307915417510030/info/` répond HTTP 200, avec
  `music_metadata: null` et des listes d'attributions vides. Aucune cover ni
  identité musicale exploitable dans cette réponse.
- Le même item contient `is_music_only_story: false`. C'est une déclaration du
  fournisseur, distincte d'une analyse acoustique ; elle n'a pas été ajoutée au
  modèle de l'application.
- `GET /api/v1/feed/user/58563216360/story/` sur l'hôte Web renvoie du HTML dans
  cet essai. Sur `i.instagram.com`, avec les capacités référencées par
  [instagrapi, StoryMixin](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/story.py)
  et la session existante, il répond HTTP 403. Cette variante n'est donc pas un
  chemin validé vers des métadonnées plus riches dans notre environnement.

## Intégration envisageable

```text
Identifiant audio reçu et connu en base
  → consultation de clips/music/
  → validation de l'identité retournée
  → conservation de l'URL de cover reçue
  → téléchargement local tant que la source est accessible
```

Cela permettrait de récupérer des pochettes pour les assets déjà identifiés,
même lorsque leurs anciennes URL de cover sont devenues inutilisables. La session
Instagram existante a suffi pour l'essai ; aucune dépendance Spotify n'intervient.

Pour les nouvelles observations sans identifiant audio, le problème restant est
la résolution de cette identité. Une recherche par titre/artiste pourrait proposer
plusieurs versions ; elle ne constitue pas une association certaine et n'a pas
été mise en place. Le lecteur actuel reste utilisable sans pochette.

Les tests n'ont modifié ni les métadonnées de la base ni les sources du cache.
Aucun cookie, jeton ou URL CDN signée réelle n'est reproduit dans ce document.
