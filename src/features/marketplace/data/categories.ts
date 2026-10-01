import type { MarketplaceCategory } from '@features/marketplace/components/CategoryTile';

/** The marketplace's category ids, in the order the category row shows them. */
export type MarketCategoryId = 'camera' | 'lens' | 'audio' | 'lighting' | 'drone' | 'accessories';

/**
 * The marketplace category row's data: label key and both icons. Shared by the
 * marketplace screen and the empty state's listing cards.
 *
 * `icon` is the blue glyph alone (market-*.png: the original icon with its
 * near-white square cut away), so the sheet or card shows through behind it.
 * `selectedIcon` keeps its gradient square — that is how a chosen one looks.
 */
export const MARKET_CATEGORIES: (MarketplaceCategory & { id: MarketCategoryId })[] = [
  {
    id: 'camera',
    labelKey: 'category_camera',
    icon: require('../../../../assets/images/categories/market-camera.png'),
    // A copy tiled in the sheet's own grey: the original is the client project
    // builder's icon too, and stays as it is.
    selectedIcon: require('../../../../assets/images/categories/photographer-sheet.png'),
  },
  {
    id: 'lens',
    labelKey: 'category_lens',
    icon: require('../../../../assets/images/categories/market-101.png'),
    selectedIcon: require('../../../../assets/images/categories/10.png'),
  },
  {
    id: 'audio',
    labelKey: 'category_audio',
    icon: require('../../../../assets/images/categories/market-audio.png'),
    selectedIcon: require('../../../../assets/images/categories/12.png'),
  },
  {
    id: 'lighting',
    labelKey: 'category_light',
    icon: require('../../../../assets/images/categories/market-teuraicon.png'),
    selectedIcon: require('../../../../assets/images/categories/lighting.png'),
  },
  {
    id: 'drone',
    labelKey: 'category_drone',
    icon: require('../../../../assets/images/categories/market-drone.png'),
    selectedIcon: require('../../../../assets/images/categories/11.png'),
  },
  {
    id: 'accessories',
    labelKey: 'category_accessories',
    icon: require('../../../../assets/images/categories/market-studio.png'),
    selectedIcon: require('../../../../assets/images/categories/14.png'),
  },
];
