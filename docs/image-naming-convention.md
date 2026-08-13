# Survey image naming convention

Survey images live in the public Supabase Storage bucket `study-images`.
Metadata and public links are stored in the `survey_images` table — that table is the **single source of truth** for which URL a survey question should display.

## Required pattern

```text
<prefix>_<description>[_variant]_v<version>.<ext>
```

| Part | Rules |
|------|--------|
| prefix | `q{N}` for question images, or `brand` / `product` for assets |
| description | lowercase snake_case words (`everyday_bra`, `jockey_logo`) |
| variant | optional (`front`, `side`, `back`) |
| version | optional but recommended (`v1`, `v2`) |
| extension | `.webp` preferred; `.png`, `.jpg`, `.jpeg` allowed |

## Valid examples

```text
q37_everyday_bra_front_v1.webp
q37_sports_bra_front_v1.webp
q30_yoga.webp
brand_jockey_logo.webp
product_enamor_pushup_front_v2.webp
```

## Rejected (generic / opaque) names

```text
IMG001.jpg
photo.png
image1.webp
pic.jpeg
Picture_2.PNG
```

Non-technical teammates must understand the content from the filename alone.

## Storage layout

Object keys under `study-images`:

```text
{category}/{image_name}
```

Categories: `bras`, `products`, `logos`, `brands`, `questions`, `misc`.

Examples:

```text
bras/q37_everyday_bra_front_v1.webp
logos/brand_jockey_logo.webp
questions/q30_yoga.webp
```

Public URL shape (built by the app — do **not** hardcode project URLs in HTML):

```text
{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/study-images/{category}/{image_name}
```

## Survey HTML usage

Prefer `data-img` with the canonical `image_name` (never a full Supabase URL):

```html
<img class="survey-img" data-img="q37_everyday_bra_front_v1.webp" alt="Everyday bra">
```

Optional folder hint (usually unnecessary when the row exists in `survey_images`):

```html
<img data-img="q37_everyday_bra_front_v1.webp" data-img-folder="bras" alt="...">
```

Load every active image for a question:

```html
<div data-img-question="Q37" class="survey-img-group"></div>
```

## Database

| Column | Purpose |
|--------|---------|
| `image_name` | Unique filename (convention above) |
| `image_url` | Bucket-relative path or full public URL |
| `category` | Folder / grouping |
| `question_key` | e.g. `Q37` when tied to a question |
| `is_active` | Inactive rows are not served to the survey |

After upload, upsert a matching `survey_images` row so the survey catalog stays current.

## Sync from Storage

Images already in the `study-images` bucket are imported with original filenames (no renaming).

**App (preferred — stores full public URLs):**

```ts
import { syncSurveyImagesFromStorage } from "@/lib/storage/image-catalog.server";
await syncSurveyImagesFromStorage();
```

**SQL:**

```sql
-- Paths only (app expands), or pass your public base:
select public.sync_survey_images_from_storage(
  'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/study-images'
);
```

| Column | Value |
|--------|--------|
| `image_name` | Original basename from the bucket (unchanged) |
| `image_url` | Public URL from Storage |
| `category` | First folder segment, or `misc` |
