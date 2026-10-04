/*
 * "Add with AI" from the phone's Share menu.
 *
 * Loaded into the service worker (workbox `importScripts`, vite.config.ts)
 * before Workbox's own routes. The installed app is a share target
 * (manifest `share_target`): sharing a screenshot or a statement to it POSTs
 * the files to /share-target, which no server answers - this does. Each file
 * is kept in the `bookandry-shared` cache under the share's id, and the app
 * opens on its import sheet for that share (src/app/shared-files.ts reads them
 * back). Nothing is sent anywhere from here, and nothing is read until the
 * person says so in the app.
 *
 * Kept to what the app accepts: images, PDFs, spreadsheets, Word and text, at
 * most ten files and 15MB. Everything else passes through to Workbox.
 */
const SHARED_FILES_CACHE = 'bookandry-shared';
const SHARED_MAX_FILES = 10;
const SHARED_MAX_BYTES = 15 * 1024 * 1024;
const SHARED_TYPES =
  /^(image\/|application\/pdf$|text\/(csv|plain|comma-separated-values)$|application\/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document))$)/;
const SHARED_NAMES = /\.(png|jpe?g|webp|gif|pdf|xlsx|xls|csv|docx|txt)$/i;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'POST' ||
    url.origin !== self.location.origin ||
    url.pathname !== '/share-target'
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      try {
        const form = await event.request.formData();
        const cache = await caches.open(SHARED_FILES_CACHE);
        let count = 0;
        let bytes = 0;
        for (const file of form.getAll('files')) {
          if (!(file instanceof File) || count >= SHARED_MAX_FILES) continue;
          if (!SHARED_TYPES.test(file.type) && !SHARED_NAMES.test(file.name)) continue;
          bytes += file.size;
          if (bytes > SHARED_MAX_BYTES) break;
          await cache.put(
            new Request(`/__shared__/${id}/${String(count)}`),
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/octet-stream',
                'x-file-name': encodeURIComponent(file.name),
                'x-shared-at': String(Date.now()),
              },
            }),
          );
          count += 1;
        }
      } catch {
        // A share that could not be kept opens the sheet empty, which says to share again.
      }
      return Response.redirect(new URL(`/?import=shared&id=${id}`, self.location.origin).href, 303);
    })(),
  );
});
