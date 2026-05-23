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

export type MediaAsset = {
  id: ID;
  url: string;
  thumbnailUrl: string | null;
  type: 'image' | 'video';
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
