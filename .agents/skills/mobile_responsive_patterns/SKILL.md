---
name: Mobile Responsive Patterns
description: Guidelines and patterns for implementing mobile-first responsive design, safe areas, layout transitions, and responsive components (like calendars and modals) used in the Vetora project.
---

# Mobile Responsive Patterns

This skill describes the established patterns for creating responsive, mobile-first interfaces in the project. When implementing new features or modifying existing ones, ensure you follow these guidelines to maintain a high-quality mobile experience.

## 1. Layout & Navigation Structure

The application uses a dual navigation strategy:
- **MobileNav (Bottom Bar)**: Visible only on mobile (`md:hidden`). It anchors to the bottom and uses `pb-[env(safe-area-inset-bottom)]` to respect the iOS home indicator. It displays priority shortcuts (Agenda, Pacientes, Caja) and a "Menu" button to open the sidebar.
- **Sidebar (Drawer/Column)**: On mobile, the `Sidebar` acts as an off-canvas drawer (using `fixed`, `z-50`, a backdrop veil, and sliding in from the left). On desktop (`md`), it transforms into a static left column (`md:visible md:static md:translate-x-0 md:w-[260px]`).

**Rule of Thumb**: Design mobile layouts first. Use `md:`, `lg:` prefixes for desktop enhancements.

## 2. Safe Areas (iOS Home Indicator)

Always ensure that scrollable areas or bottom-fixed elements do not get obscured by the iOS home indicator.
- Use `env(safe-area-inset-bottom)` combined with CSS `max()` to provide adequate padding.
- **Pattern**: `pb-[max(1rem,env(safe-area-inset-bottom))]`
- Example usage: In `Modal` content areas, `main` layout wrappers, and the `Sidebar`.

## 3. Responsive Modals (Bottom Sheets)

Modals in this project adapt their behavior based on the screen size:
- **Mobile**: Modals appear as bottom sheets anchored to the bottom edge (`items-end`, `rounded-t-2xl`, `slide-in-from-bottom-4`).
- **Desktop**: Modals transform into centered dialog boxes (`sm:items-center`, `sm:rounded-2xl`, `sm:zoom-in-95`).

When building forms or views that go inside a modal, let the `Modal` component handle the layout constraints and scrolling. Ensure your inner content doesn't break out of the modal's flexible bounds.

## 4. Programmatic Media Queries (`useMediaQuery`)

While CSS utility classes (Tailwind) handle most responsive styling, some component logic needs to know the screen size (e.g., choosing a default calendar view).
- Use the custom `useMediaQuery` hook from `src/hooks/useMediaQuery.ts`.
- **Pattern**: `useMediaQuery(CONSULTA_MD)` uses `useSyncExternalStore` so that the very first render receives the correct value, avoiding UI layout shift or flickering on mount.
- Example: `window.matchMedia(CONSULTA_MD).matches ? 'semana' : 'dia'` for initializing state.

## 5. UI Density & Touch Targets

- **Touch Targets**: Ensure interactive elements have a minimum height for easy tapping on mobile. The project's `Button` component explicitly uses `min-h-10` to guarantee a comfortable touch area.
- **Typography & Spacing scaling**: Use compact sizes on mobile and scale up.
  - Example: `text-[9px] md:text-[11px]` for tiny badges or timestamps.
  - Example: `p-1 md:p-2` or `gap-1 sm:gap-2 md:gap-3` for grid spacing.
- **Grids**: Use `grid-cols-1` for mobile and expand columns for desktop (e.g., `grid-cols-1 md:grid-cols-7` for a calendar view).

## 6. Calendar/Agenda Adaptation

When rendering dense information like a calendar or agenda:
- On mobile, prioritize a single-column layout (e.g., "Day" view or stacked days).
- In compact multi-day views (like "Week" or "Month" on mobile), aggressively hide secondary information (badges, icons, full names) using `hidden md:inline` or `hidden md:block`.
- Condense typography significantly (e.g., `text-[8px] md:text-[11px]`).
- Use fluid, conditional layouts with `clsx` to drastically change the visual representation (e.g., switching from detailed cards on `dia` view to compact list items in `mes` view).
