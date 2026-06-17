# Marketplace Page — Design Spec

**Date:** 2026-06-17  
**Scope:** New Marketplace tab for professional users — 2nd Hand listings and Equipment Rental listings, with posting and browsing.

---

## Overview

A new **Marketplace** tab is added to the professional bottom navigation (alongside Dashboard, Portfolio, Bookings, Profile). Professional users can browse listings posted by other professionals and post their own equipment for sale or rent.

---

## Navigation

- Add a `marketplace` screen to `src/app/(professional)/(tabs)/`.
- Register it in `src/app/(professional)/(tabs)/_layout.tsx` as a new `<Tabs.Screen>`.
- Tab label: **Marketplace**, tab icon: a shopping bag or tag icon.

---

## Marketplace Screen (`marketplace/index.tsx`)

### Toggle

Two pill buttons at the top of the screen:
- **2nd Hand** — shows a vertical list of items for sale
- **Equipment Rental** — shows a 2-column image grid of rentable gear

Active pill: filled purple (`#cb6ce6`). Inactive: dark background (`#2a2a3e`), muted text.

Toggling between pills replaces the list content below; no navigation occurs.

### Search Bar

A search input sits above the toggle pills. Filters the visible listings in real time by product name. Placeholder: `"Search equipment..."`.

### Floating Action Button (FAB)

A `+` button (circle, `#cb6ce6`) sits at the bottom-right of the screen. Tapping it opens the **Post Listing** bottom sheet.

---

## 2nd Hand List

**Layout:** Vertical `FlatList`. Each card is a horizontal row:
- Left: product image thumbnail (44×44, rounded corners). Falls back to a placeholder icon if no image.
- Center: product name (bold, white) + location (muted, with pin icon).
- Right: price (purple, bold).

**Data fields per listing:**
- `id`: string
- `type`: `'secondhand'`
- `sellerId`: string (professional user ID)
- `sellerName`: string
- `productName`: string
- `location`: string
- `price`: number
- `imageUrl`: string | null
- `createdAt`: Timestamp

Tapping a card opens the **Detail Modal**.

---

## Equipment Rental Grid

**Layout:** 2-column `FlatList` (using `numColumns={2}`). Each card:
- Top: product image (full width of card, fixed height ~120px). Falls back to placeholder.
- Below image: product name (bold, white), price per day (purple), location (muted).

**Data fields per listing:**
- `id`: string
- `type`: `'rental'`
- `ownerId`: string (professional user ID)
- `ownerName`: string
- `productName`: string
- `location`: string
- `pricePerDay`: number
- `imageUrl`: string | null
- `createdAt`: Timestamp

Tapping a card opens the **Detail Modal**.

---

## Post Listing Bottom Sheet

Opens from the FAB. A modal sheet with:

1. **Type toggle** — pill selector: `2nd Hand` | `Rental`. Pre-selected based on which tab was active when "+" was tapped.
2. **Photo upload** — tappable area using `expo-image-picker`. Optional. Uploads to Firebase Storage; stores download URL.
3. **Product name** — text input, required.
4. **Location** — text input (city name), required.
5. **Price** — numeric input. Label reads "Price (₪)" for 2nd Hand, "Price per day (₪)" for Rental.
6. **Post Listing** button — disabled until name, location, and price are filled. On submit, writes to Firestore and closes the sheet.

---

## Detail Modal

Opens when a listing card is tapped. A bottom sheet showing:
- Product image (full width, rounded, ~160px tall). Falls back to placeholder.
- Product name (large, bold, white).
- Price (purple, bold) and location (muted with pin icon) on the same row.
- "Posted by [seller name]" in small muted text.
- **Contact Seller** button (full width, purple) — for now, this shows a toast: `"Feature coming soon"`.

---

## Data / Firebase

- **Collection:** `marketplace_listings`
- **Subcollections:** none — all listings in one flat collection, differentiated by `type` field.
- **Reads:** `useMarketplaceListings(type: 'secondhand' | 'rental')` hook — queries Firestore by `type`, ordered by `createdAt` descending. Client-side search filters by `productName`.
- **Writes:** `useCreateListing()` hook — handles image upload to Storage then Firestore document creation.
- **Images:** Uploaded to `marketplace/{listingId}/{filename}` in Firebase Storage.

---

## File Structure

```
src/
  app/(professional)/(tabs)/marketplace/
    index.tsx                  # Main marketplace screen
  features/marketplace/
    components/
      MarketplaceToggle.tsx    # Pill toggle (2nd Hand / Rental)
      SecondHandList.tsx       # Vertical FlatList for 2nd hand
      RentalGrid.tsx           # 2-col grid for rentals
      ListingCard.tsx          # Row card for 2nd hand
      RentalCard.tsx           # Grid card for rental
      PostListingSheet.tsx     # Bottom sheet form
      ListingDetailModal.tsx   # Detail bottom sheet
    hooks/
      useMarketplaceListings.ts
      useCreateListing.ts
    types.ts                   # MarketplaceListing type
```

---

## Out of Scope

- Editing or deleting a posted listing (future).
- In-app messaging between buyer/renter and seller (future — "Contact Seller" shows a toast).
- Pagination / infinite scroll (start with a reasonable Firestore limit of 50).
- Price negotiation or booking flow for rentals.
