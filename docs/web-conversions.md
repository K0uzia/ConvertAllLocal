# Conversions web (navigateur)

Traitement 100 % local sur `/convertir`. Limites : **24 Mo par lot** (32 Mo si le navigateur signale ≥ 8 Go de RAM), **16 Mo** par fichier image/audio/PDF, **8 Mo** par fichier texte.

## Images

Entrées web courantes (PNG, JPEG, WebP, AVIF, GIF, SVG, BMP, TIFF, ICO…).

| Sortie |
|--------|
| WebP, PNG, JPEG, AVIF, PDF |

## Audio

| Entrée | Sortie |
|--------|--------|
| MP3, WAV, OGG, Opus, M4A, AAC… | WAV, MP3, OGG (depuis MP3/WAV) |

## Documents texte

| Entrée | Sortie |
|--------|--------|
| Markdown | HTML, Texte, PDF |
| HTML | Texte, PDF |
| TXT | PDF |
| CSV | JSON |
| JSON | CSV, JSON (formaté) |

## PDF

| Sens | Détail |
|------|--------|
| Entrée | PDF avec couche texte → **TXT** (max 50 pages, pas d’OCR) |
| Sortie | Images → PDF ; MD/HTML/TXT → PDF (texte paginé) |

## Réservé à l’application desktop

Vidéo, Office (DOCX, ODT…), EPUB, RTF, PDF scannés (OCR), conversions PDF avancées (Word, images de toutes les pages).

## Hors scope web

Les limites de taille protègent la mémoire de l’onglet et le stockage local (IndexedDB), pas un modèle d’abonnement.
