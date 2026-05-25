// R2-backed storage. Two buckets:
//   STORIES (env.STORIES) — JSON
//     {id}/index.json   summary metadata
//     {id}/v{n}.json    full version snapshot
//   MEDIA (env.MEDIA) — binary
//     {id}-v{n}-p{i}.png   paragraph image
//     {id}-v{n}.mp3        narration audio

import type { Env } from './env';
import type { StoryIndex, StoryVersion } from './types';

export async function saveStoryVersion(env: Env, version: StoryVersion): Promise<void> {
  const versionKey = `${version.id}/v${version.version}.json`;
  await env.STORIES.put(versionKey, JSON.stringify(version), {
    httpMetadata: { contentType: 'application/json' },
  });

  // Preserve original created_at across version saves.
  let createdAt = version.created_at;
  const existing = await env.STORIES.get(`${version.id}/index.json`);
  if (existing) {
    try {
      const prev = (await existing.json()) as StoryIndex;
      if (prev?.created_at) createdAt = prev.created_at;
    } catch { /* ignore */ }
  }

  const idx: StoryIndex = {
    id: version.id,
    title: version.title,
    latest_version: version.version,
    cover_image_url: version.paragraphs[0]?.image_url ?? null,
    updated_at: version.created_at,
    created_at: createdAt,
    status: version.status,
  };
  await env.STORIES.put(`${version.id}/index.json`, JSON.stringify(idx), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getStoryVersion(env: Env, id: string, version?: number): Promise<StoryVersion | null> {
  let v = version;
  if (v === undefined) {
    const idx = await getStoryIndex(env, id);
    if (!idx) return null;
    v = idx.latest_version;
  }
  const obj = await env.STORIES.get(`${id}/v${v}.json`);
  if (!obj) return null;
  return (await obj.json()) as StoryVersion;
}

export async function getStoryIndex(env: Env, id: string): Promise<StoryIndex | null> {
  const obj = await env.STORIES.get(`${id}/index.json`);
  if (!obj) return null;
  return (await obj.json()) as StoryIndex;
}

export async function listStoryIndexes(env: Env): Promise<StoryIndex[]> {
  // R2 list is paginated; for a small app one page is plenty.
  const result = await env.STORIES.list({ limit: 1000 });
  const indexKeys = result.objects.filter((o) => o.key.endsWith('/index.json'));
  const items = await Promise.all(
    indexKeys.map(async (o) => {
      const blob = await env.STORIES.get(o.key);
      if (!blob) return null;
      try { return (await blob.json()) as StoryIndex; } catch { return null; }
    })
  );
  return items
    .filter((x): x is StoryIndex => !!x && x.status === 'ready')
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function storeMedia(
  env: Env,
  keyWithExt: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<string> {
  const buf: ArrayBuffer = data instanceof ArrayBuffer
    ? data
    : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  await env.MEDIA.put(keyWithExt, buf, { httpMetadata: { contentType } });
  return `/api/media?key=${encodeURIComponent(keyWithExt)}`;
}

export async function readMedia(env: Env, key: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  const data = await obj.arrayBuffer();
  const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';
  return { data, contentType };
}

// Hard-delete every blob belonging to a story.
export async function deleteStoryAndMedia(env: Env, id: string): Promise<{ story: number; media: number }> {
  const storyList = await env.STORIES.list({ prefix: `${id}/`, limit: 1000 });
  await Promise.all(storyList.objects.map((o) => env.STORIES.delete(o.key)));
  const mediaList = await env.MEDIA.list({ prefix: `${id}-`, limit: 1000 });
  await Promise.all(mediaList.objects.map((o) => env.MEDIA.delete(o.key)));
  return { story: storyList.objects.length, media: mediaList.objects.length };
}
