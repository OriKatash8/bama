import { ROLES, ROLE_TO_LEGACY_CATEGORY } from './categories';

/**
 * The role tiles clients pick crew from: the home builder (step 2) and the
 * "add professional" sheet on project details show the same list and images.
 */

// Role tile images, keyed by RoleDef id.
export const ROLE_IMAGES: Record<string, ReturnType<typeof require>> = {
  videographer:     require('../../../../assets/images/categories/videographer-wide.png'),
  photographer:     require('../../../../assets/images/categories/photographer-wide.png'),
  editor:           require('../../../../assets/images/categories/editor-wide.png'),
  graphic_designer: require('../../../../assets/images/categories/graphic-designer-wide.png'),
  social_media:     require('../../../../assets/images/categories/social-wide.png'),
  studio_audio:     require('../../../../assets/images/categories/studio-wide.png'),
  lighting:         require('../../../../assets/images/categories/lighting-wide.png'),
  sound:            require('../../../../assets/images/categories/sound-wide.png'),
};

// Round category icons — the same set the client browse (search) page uses,
// keyed by the legacy category string stored on crewSlot.category.
export const CATEGORY_ICON: Record<string, ReturnType<typeof require>> = {
  'Video Photographer': require('../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../assets/images/categories/blue-cam.png'),
  'Editor':             require('../../../../assets/images/categories/blue-edit.png'),
  'Graphic Designer':   require('../../../../assets/images/categories/blue-grafic.png'),
  'Social Media':       require('../../../../assets/images/categories/blue-social.png'),
  'Studio & Audio':     require('../../../../assets/images/categories/blue-mic.png'),
  'Lighting Tech':      require('../../../../assets/images/categories/blue-lightning.png'),
  'Sound Recordist':    require('../../../../assets/images/categories/blue-sound.png'),
};

// Builder role tiles: sourced from ROLES; `key` is the legacy category string that
// gets stored on crewSlot.category (matching + questions still key on it).
export const CATEGORIES = ROLES.map((r) => ({
  key: ROLE_TO_LEGACY_CATEGORY[r.id],
  roleId: r.id,
  image: ROLE_IMAGES[r.id],
}));
