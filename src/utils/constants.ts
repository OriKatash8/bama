import type { MediaRole } from '@core/types/media';
import type { BookingStatus } from '@core/types/project';
import type { UserRole } from '@core/types/user';

export const USER_ROLES: Record<UserRole, string> = {
  client: 'Client',
  professional: 'Professional',
};

export const MEDIA_ROLES: Record<MediaRole, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor: 'Editor',
  producer: 'Producer',
  director: 'Director',
  sound_engineer: 'Sound Engineer',
  lighting_technician: 'Lighting Technician',
  makeup_artist: 'Makeup Artist',
  stylist: 'Stylist',
};

export const BOOKING_STATUSES: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const MAX_CREW_SIZE = 20;
export const MAX_PORTFOLIO_ASSETS = 50;
export const MAX_BIO_LENGTH = 500;
