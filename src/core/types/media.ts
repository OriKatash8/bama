import type { ID, Timestamp } from './common';

export type MediaRole =
  | 'photographer'
  | 'videographer'
  | 'editor'
  | 'producer'
  | 'director'
  | 'sound_engineer'
  | 'lighting_technician'
  | 'makeup_artist'
  | 'stylist';

/** Caption ceiling. Lives here, beside the field, so the upload sheet and the
 *  write path can both reach it without importing the Firebase-backed hook. */
export const CAPTION_MAX_LENGTH = 200;

export type MediaAsset = {
  id: ID;
  url: string;
  thumbnailUrl: string | null;
  type: 'image' | 'video';
  /**
   * What the professional wrote about this piece when they uploaded it. Shown to
   * clients on the full-screen slide only, never on the grid. Null for anything
   * uploaded before captions existed, and for uploads where the author skipped it.
   */
  caption: string | null;
  uploadedAt: Timestamp;
};

export type Portfolio = {
  id: ID;
  professionalId: ID;
  title: string;
  description: string | null;
  assets: MediaAsset[];
  roles: MediaRole[];
  createdAt: Timestamp;
};
