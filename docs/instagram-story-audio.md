# Audio des stories Instagram : manifeste DASH et provenance

Recherche du 26 octobre 2026, fondée sur des réponses Instagram et les modules
Relay effectivement chargés dans le navigateur, puis sur les sources du SDK.
Les observations décrivent cette session et ces échantillons ; les requêtes
internes et leurs identifiants ne constituent pas une API publique stable.

`video_dash_manifest` est une **chaîne XML dans la réponse de la story**, pas une
URL ni un endpoint HTTP à appeler. Quand ce champ est présent, aucune requête
supplémentaire de métadonnées Instagram n'est nécessaire pour obtenir le manifeste
ou les adresses des représentations qu'il contient. Il reste à télécharger les
octets des médias auprès du CDN. La réponse du tray seule ne suffit pas : il faut
la requête qui charge le détail des stories. [Sources : observations réseau
ci-dessous et client actuel](../sdk/story-client-service.ts).

Une représentation audio du manifeste permet de récupérer la **bande-son de la
story**. Elle ne garantit pas un morceau isolé, un enregistrement original de
catalogue, ni l'absence de voix ou de bruits. Les trois questions « d'où vient ce
flux ? », « quel morceau le sticker déclare-t-il ? » et « qu'entend-on réellement ? »
doivent garder des réponses indépendantes.

## Ce que le navigateur reçoit

| Étape observée                          | Requête                                                                                        | Données constatées                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tray appelé par le SDK                  | `GET /api/v1/feed/reels_tray/`                                                                 | HTTP 200, 48 comptes ; aucun `music_asset_info` dans la réponse observée.                                  |
| Tray de l'interface web                 | `PolarisStoriesV3TrayContainerQuery`, document `38657722893875056`                             | HTTP 200 ; aucun champ musical relevé dans la réponse observée.                                            |
| Détail appelé par le SDK                | `POST /graphql/query`, `PolarisStoriesV3ReelPageStandaloneQuery`, document `28449850404637481` | Stories, stickers musicaux partiels et, pour les vidéos examinées, `video_dash_manifest`.                  |
| Clic sur une story dans l'interface     | `PolarisStoriesV3ReelPageGalleryQuery`, document `29306733562261201`                           | Stories et mêmes quatre champs de `music_asset_info` dans les réponses examinées.                          |
| Navigation/préchargement de l'interface | `PolarisStoriesV3ReelPageGalleryPaginationQuery`, document `28597075096591838`                 | D'autres stories ; mêmes quatre champs musicaux.                                                           |
| Lecture des médias                      | Requêtes vers les URL du CDN                                                                   | Octets MP4 ; HTTP 200 observé pour des chargements ordinaires. Un test explicite de plage a reçu HTTP 206. |

Les trois modules Relay de détail ont été inspectés via `window.require` dans le
navigateur réellement ouvert. Leurs sélections de `music_asset_info` demandent
**uniquement** `should_mute_audio`, `should_mute_audio_reason`, `title` et
`display_artist`. L'absence de `audio_asset_id`, `progressive_download_url` et
`fast_start_progressive_download_url` ne vient donc pas seulement d'une valeur
vide dans un exemple : ces champs ne sont pas demandés par ces documents.
Cela ne démontre pas qu'aucune autre interface Instagram ne pourrait les fournir.
[Sources : réponses tray](/private/tmp/instagram-tray-summary.log),
[clic et pagination](/private/tmp/instagram-story-ui-summary.log),
[sélections Relay](/private/tmp/instagram-query-selections.log),
[tray web et manifeste](/private/tmp/instagram-audio-stream.log).

Pour obtenir une source propre au music asset, ces réponses partielles sont
insuffisantes. Aucun endpoint d'enrichissement de cet asset n'a été validé dans
cette investigation. L'absence de requête supplémentaire nécessaire pour lire
le manifeste ne résout donc pas l'accès à l'asset musical original.

```mermaid
sequenceDiagram
    participant B as Navigateur authentifié
    participant I as Instagram
    participant C as CDN média
    B->>I: Charger le tray (REST SDK ou GraphQL interface)
    I-->>B: Comptes / reels, sans musique dans les réponses observées
    B->>I: Charger les stories (Standalone SDK ou Gallery après clic)
    I-->>B: Stories + stickers partiels + video_dash_manifest (XML)
    Note over B: Lire les représentations et leurs BaseURL dans le XML
    B->>C: Charger les octets des représentations nécessaires
    C-->>B: Média (200 ; 206 possible avec Range)
    Note over B,C: Le test audio depuis localhost est un diagnostic séparé
```

Ce schéma distingue l'appel SDK reproduit dans la session du vrai clic dans
l'interface : le clic utilisait Gallery, pas Standalone. Les appels de pagination
peuvent précharger d'autres stories. Les mutations de marquage « vu » relevées
pendant la navigation ne fournissaient pas de métadonnées musicales.
[Source : capture de navigation](/private/tmp/instagram-story-ui-summary.log).

## Exemple réel de `video_dash_manifest`, expurgé

Extrait dérivé du cache de la story associée à **Divine — MPM Beats**, publiée par
`@ripped1taliano` : `data/cache/stories/4015864497029948181.json`. Après décodage de
la chaîne JSON, le champ contient un document de cette forme. L'extrait conserve
une représentation vidéo et la représentation audio du cache ; les autres
représentations et les extensions propriétaires sont omises. Tous les identifiants
du XML sont remplacés et toutes les adresses CDN, paramètres signés et informations
de suivi sont supprimés. Les adresses ci-dessous sont fictives et inutilisables.

```xml
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"
     minBufferTime="PT2S" type="static"
     mediaPresentationDuration="PT20.0156S">
  <Period id="period-redacted" duration="PT20.0156S">
    <AdaptationSet id="video-redacted" contentType="video"
                   subsegmentAlignment="true" par="9:16">
      <Representation id="video-representation-redacted"
                      bandwidth="84573" codecs="avc1.64001f"
                      mimeType="video/mp4" width="720" height="1280"
                      frameRate="15360/512">
        <BaseURL>https://cdn.example.invalid/video-redacted.mp4</BaseURL>
        <SegmentBase indexRange="874-917" timescale="15360">
          <Initialization range="0-873" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="audio-redacted" contentType="audio"
                   subsegmentStartsWithSAP="1" subsegmentAlignment="true">
      <Representation id="audio-representation-redacted"
                      bandwidth="58686" codecs="mp4a.40.5"
                      mimeType="audio/mp4" audioSamplingRate="44100">
        <AudioChannelConfiguration
          schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011"
          value="2" />
        <BaseURL>https://cdn.example.invalid/audio-redacted.mp4</BaseURL>
        <SegmentBase indexRange="824-975" timescale="44100">
          <Initialization range="0-823" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

Le manifeste décrit les variantes de présentation : durée, type de média, codec,
débit, dimensions vidéo ou fréquence audio. Les `BaseURL` localisent les fichiers ;
`SegmentBase@indexRange` et `Initialization@range` décrivent des plages d'octets
pour l'index et l'initialisation. Ce sont des données techniques de lecture,
pas des identifiants de morceau. [Source : DASH-IF, adressage indexé](https://dashif.org/Guidelines-TimingModel/#indexed-addressing).

Dans cet extrait, `audio/mp4` et `mp4a.40.5` annoncent une représentation audio
HE-AAC v1 dans un conteneur MP4. Ils ne décrivent pas le contenu sonore. Le W3C
documente les paramètres MIME des flux ISO BMFF ; son registre AAC associe
`mp4a.40.5` à HE-AAC v1, avec le statut de brouillon de note de groupe.
[Sources : format ISO BMFF](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#mime-type-parameters),
[registre AAC](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings).

Le cache ci-dessus contient des variantes vidéo H.264 ; la réponse live examinée
pour cette même story contenait des variantes VP9 et une représentation audio
`mp4a.40.5`. Il ne faut donc pas figer un codec vidéo d'après un seul cache.
[Source live](/private/tmp/instagram-ripped-audio-stream.log).

## Diagnostic initial : accès audio vérifié avant le correctif

Deux essais ont extrait la `BaseURL` de la représentation audio du manifeste,
chargé ses métadonnées, puis lancé un élément HTML `<audio>` temporaire, muet,
depuis l'origine de l'application `http://localhost:5173`. Les événements de
lecture et de déplacement ont réussi ; cela valide le chargement et la lecture
native dans cette session, pas une vérification à l'oreille du contenu.

| Story et association déclarée par le sticker | Durée audio chargée | Lecture depuis l'origine de l'application | Déplacement obtenu |
| -------------------------------------------- | ------------------- | ----------------------------------------- | ------------------ |
| `@menez_yoann`, Clocks — Coldplay            | 20,040227 s         | Réussie                                   | 10 s               |
| `@ripped1taliano`, Divine — MPM Beats        | 20,015601 s         | Réussie                                   | 10,017136 s        |

Un `fetch` de diagnostic côté serveur, avec `Range: bytes=0-1023`, a reçu pour
chacun HTTP 206 et 1 024 octets. Le serveur CDN annonçait `Content-Type: video/mp4`
pour ces URL, malgré `mimeType="audio/mp4"` dans le manifeste. Le seul en-tête HTTP
ne suffit donc pas à sélectionner une piste audio. Les plages HTTP sont un
mécanisme d'accès aux octets ; elles ne constituent pas une nouvelle requête de
métadonnées Instagram. [Sources : essai Clocks](/private/tmp/instagram-audio-access.log),
[essai Divine](/private/tmp/instagram-ripped-audio-access.log),
[HTTP Range et 206, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-14).

Ces éléments temporaires ont été retirés après le diagnostic. Ces premiers tests
n'avaient pas encore ajouté de lecteur persistant ni de mise en cache durable.
Le correctif décrit plus bas fournit maintenant cette intégration. Le succès observé
ne garantit pas la validité future d'une URL signée, les droits d'accès d'une autre
session, ni la compatibilité de tous les navigateurs ou de toutes les stories.
L'ADR existant traite déjà les URL reçues comme des sources expirantes.
[Source : ADR 0004](adr/0004-cache-received-music-media.md).

## Distinguer la provenance du média et la nature du son

| Élément disponible                                                      | Conclusion fiable                                                         | Conclusion non établie                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `music_asset_info.title` et `display_artist`                            | Instagram déclare une association musicale pour le sticker.               | Une identité partagée certaine, un fichier téléchargeable ou un son composé uniquement de ce morceau.   |
| URL reçue dans `music_asset_info.progressive_download_url` ou son repli | Provenance `music_asset` : média fourni pour l'asset musical.             | Un master original complet, une version sans voix ou une correspondance exacte avec le mix de la story. |
| Représentation audio issue de `story.video_dash_manifest`               | Provenance `story_audio` : piste audio de la présentation de cette story. | L'asset musical original ou l'absence de voix, bruits, effets et autres sons dans cette piste.          |
| `mimeType="audio/mp4"`, codec audio, piste sans vidéo                   | Type de média audio dans le manifeste.                                    | Contenu « musique seule ».                                                                              |
| Aucun signal suffisant sur le contenu                                   | Nature sonore inconnue.                                                   | Une classification par défaut comme musique seule.                                                      |

`music_asset` et `story_audio` sont les **libellés de provenance** du modèle
de présentation. Le stockage sépare les métadonnées musicales de `story_audio`.
La provenance doit être
conservée au moment de l'extraction ; le domaine CDN, une extension `.mp4`, le titre
ou l'artiste seuls ne permettent pas de la reconstruire sûrement.

Le « music asset » du glossaire désigne l'item audio Instagram auquel renvoie le
sticker. Il ne signifie pas « enregistrement original garanti ». Même une source
de cet asset peut être un extrait ou une version particulière. Une piste
`story_audio` peut contenir une musique seule, une voix, une ambiance ou un mix :
le manifeste ne permet pas de trancher. Une telle qualification demanderait une
analyse du contenu séparément définie, avec ses propres critères et incertitudes.
[Sources du modèle : glossaire](../GLOSSARY.md),
[règles d'identité de l'ADR 0001](adr/0001-share-sticker-metadata.md),
[sémantique technique de `codecs`, RFC 6381](https://www.rfc-editor.org/rfc/rfc6381.html#section-3.3).

Un enum de provenance peut donc répondre de manière déterministe à « cette source
vient-elle du music asset ou du manifeste de la story ? », si l'extraction en
conserve l'origine. Il ne répond pas à « le son contient-il uniquement de la
musique ? ». Cette seconde information doit rester inconnue en l'absence d'une
analyse séparée, même si le sticker fournit un titre connu.

En conséquence, une source `story_audio` ne doit pas être attribuée à un music
asset partagé par rapprochement de titre et d'artiste : elle appartient d'abord à
la story dont provient le manifeste. Son stockage doit être rattaché à cette story
et ne doit pas remplir les champs audio d'un asset musical partagé. Les médias
propres à un music asset peuvent, eux, rester partagés par identifiant exact
d'asset Instagram ; titre et artiste ne suffisent pas.
[Sources : ADR 0001](adr/0001-share-sticker-metadata.md),
[ADR 0004](adr/0004-cache-received-music-media.md).

La direction de spécification retenue est un lecteur par story pour cette source,
avec le titre du morceau reçu quand il est connu, sinon **« Audio de la story »**, et une provenance séparée pour une
éventuelle source du music asset. Le libellé ne promet ni morceau complet ni
musique seule. Le correctif ci-dessous applique cette direction ; les premiers
essais décrits plus haut étaient seulement diagnostiques.

## Situation du SDK avant le correctif

Le client demande le détail des stories via Standalone. L'extraction musicale
actuelle lit `music_asset_info`, préfère `progressive_download_url` puis
`fast_start_progressive_download_url`, et ne lit pas `video_dash_manifest`.
Le repository conserve les versions image/vidéo et les annotations ; il ne
reconstitue pas le manifeste DASH depuis la base. La présence du XML dans une
réponse brute ou un ancien cache ne signifie donc pas qu'une source audio de
story est disponible dans le modèle persistant actuel.
[Sources : client](../sdk/story-client-service.ts),
[extraction musicale](../sdk/music-observation-service.ts),
[repository des stories](../sdk/repositories/story-repository.ts).

Le traçage d'ingestion a confirmé, sur une réponse live, que les quatre champs
musicaux reçus sont encore présents après parsing ; la base conserve titre et
artiste en métadonnées partielles, sans identifiant d'asset ni URL audio. Un rejeu
d'un cache historique plus riche a au contraire préservé l'identifiant et les URL
reçus. Le manque live examiné se situe donc dans les données sélectionnées par la
requête, et non dans une suppression des URL musicales par cette extraction.
Ce constat ne change pas le fait que le manifeste de story est un autre chemin
audio, qui était alors inexploité. [Source : traçage réseau → parsing → base et rejeu](/private/tmp/trace-music-ingestion.log).

## Correctif local et validation — 26 octobre 2026

L'ingestion extrait maintenant une représentation AAC/MP4 audio du manifeste et
la conserve dans la table `story_audio`, rattachée à `mediaPk`. Les métadonnées
du morceau restent séparées : deux stories du même morceau gardent leurs propres
extraits, et aucun identifiant musical n'est inventé lorsqu'il manque.
[Extraction XML](../sdk/lib/dash-audio.ts),
[règles de conservation](../sdk/story-audio-service.ts),
[table et validation dérivée de Drizzle](../sdk/entities/story-audio.ts).

La création de rapport, commune au script et à Nitro, télécharge les sources
après persistance des stories. Elle réutilise les fichiers valides et publie
atomiquement les nouveaux. Le CDN peut annoncer `video/mp4` pour la représentation
audio confirmée par le manifeste : elle est mise en cache en `.m4a` et servie en
`audio/mp4`, avec les plages HTTP permettant de naviguer dans la lecture.
[Orchestration](../sdk/report-audio-service.ts),
[cache audio](../sdk/music-media-service.ts).

L'interface préfère une source musicale locale disponible, sinon affiche un seul
lecteur par story, titré avec les informations musicales reçues, dans la carte music et sa modale. Un wrapper choisit entre le badge du titre et le player, sans doublon. Pas de
pochette, d'autoplay ou de message d'indisponibilité. Le téléchargement ne dépend
pas de l'ouverture de la page ; le job bunqueue horaire existant relance déjà le rapport. #42 a été fermée comme non planifiée.
[Présentation](../server/music-preview.ts),
[regroupement par story](../server/timeline-stickers.ts).

L'essai réel du correctif a récupéré **122 stories** et mis en cache **61 pistes
audio de stories**, toutes disponibles, sans appel supplémentaire pour obtenir
un manifeste. Le rapport s'est terminé avec succès. Les pages de `menez_yoann`
et `ripped1taliano` ont lu les fichiers locaux et permis un déplacement dans la
lecture depuis le navigateur. Le fichier de la story `4016307915417510030`
contient une seule piste HE-AAC audio, sans vidéo, pour 20,040227 secondes ; celui
de `4015864497029948181` est également disponible localement. Ces vérifications
techniques ne prétendent pas classifier leur contenu comme musique seule.

Les tests de régression utilisent SQLite isolée, des réponses HTTP déterministes,
un répertoire temporaire et les interactions de la carte/modale. Le rejeu depuis
le cache historique reste une opération locale ponctuelle ; aucun outil de
backfill permanent n'est ajouté au code.
[Tests ingestion, téléchargement et service audio](../tests/story-audio.test.ts),
[tests d'interface](../tests/ui/stickers.test.tsx).

Les journaux locaux cités sont des résumés de diagnostic temporaires, sans URL
CDN réelle. Ils ne sont pas des fixtures durables ni une documentation publique
d'Instagram. Les résultats utiles sont consignés ci-dessus afin que cette note
reste lisible après leur suppression.
