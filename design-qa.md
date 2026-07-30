# NexoCam design QA

## Comparison target

- Source visual truth: `design/reference-nexocam-option-1.png`
- Source pixels: 1487 × 1058
- Implementation: `/chat?demo=connected`
- Final desktop screenshot: `design/implementation-chat-desktop-1440x1024.png`
- Final mobile screenshot: `design/implementation-chat-mobile-390x844.png`
- Full comparison: `design/comparison-desktop-final.jpg`
- Requested CSS viewports: 1440 × 1024 desktop and 390 × 844 mobile
- Browser-rendered desktop pixels: 1425 × 1013
- Browser-rendered mobile pixels: 390 × 844
- Device scale factor: 1
- Density normalization: the source was bicubic-scaled to 1425 × 1013 and placed beside the same-size desktop implementation. The 1800 × 640 JPEG comparison is a presentation copy of that equal-size pair.
- State: active Spanish video conversation with remote participant, local preview, text messages, safety notice, and enabled controls

## Full-view comparison evidence

The final normalized comparison shows the same major composition as the selected visual: 94 px white header, approximately 66/34 video-to-chat split, full-height remote video, local preview anchored at the lower-right of the video, safety notice at the top of chat, alternating message bubbles, and a shared bottom control band. The remote/local generated participant assets match the selected art direction, subject, crop family, warmth, and sharpness.

The desktop implementation preserves the source hierarchy and control density. The mobile capture reflows the same experience into video, primary controls, and a scrollable chat area without horizontal overflow or clipped persistent controls.

## Focused-region evidence

Separate crops were not required because the original 1425 × 1013 browser capture and the source were opened at original resolution before the normalized side-by-side comparison. At that resolution, the header typography, safety copy, message timestamps, icon alignment, local-video border, input, and bottom controls were all readable. These regions were also exercised interactively in the browser.

## Required fidelity surfaces

- Fonts and typography: Manrope is used for display/brand text and Inter for interface copy. Weight, line height, wrapping, and compact UI hierarchy match the visual target; no truncation appears at either acceptance viewport.
- Spacing and layout rhythm: header height, 66/34 frame split, local-video size, chat padding, bubble cadence, 112 px bottom controls, radii, borders, and restrained shadows track the reference.
- Colors and visual tokens: off-white, ink, teal, coral, peach, subtle gray borders, status green, and disabled gray are centralized as CSS tokens and visually match the target.
- Image quality and asset fidelity: both custom participant images are real generated raster assets with compatible lighting and crops. No placeholder avatar, CSS illustration, handcrafted SVG, or stretched screenshot is used.
- Copy and content: safety guidance, message content, connection status, control labels, timestamps, and legal links are coherent in Spanish and have a complete English structure.
- Icons: Phosphor icons are used consistently for camera, microphone, next, report, block, safety, effects, account, and sending controls.
- Responsive behavior: the 390 × 844 capture keeps the video prominent, preserves local preview and primary actions, and provides report/block through the chat action menu.
- Accessibility and states: semantic buttons/labels, focusable fields, alt text, disabled states, dialog semantics, and visible permission/searching/reconnecting/peer-left/reported/blocked/suspended states are present.

## Comparison history

### Iteration 1 — blocked

- [P1] The first connected implementation used a 72/28 video/chat split, a compact 76 px header, and only three bottom controls. This materially changed the selected composition and moved report/block away from the primary action band.
- [P2] Chat bubbles used teal instead of peach and the local preview was too narrow.
- Fixes: changed the layout to 66/34, matched the 94 px header, added five bottom actions, enlarged the local preview, and mapped outgoing messages to peach.
- Post-fix evidence: `design/implementation-chat-desktop-pass2.png`.

### Iteration 2 — blocked

- [P2] The safety card was underspecified, video overlay controls were absent, and messages lacked timestamps, delivery marks, final reply, and typing state.
- Fixes: implemented the complete safety card and link, added icon-library video controls, timestamps/checks, the final reply, typing indicator, and active send control.
- Post-fix evidence: `design/implementation-chat-desktop-pass3.png`.

### Iteration 3 — passed

- The final desktop and mobile captures have no actionable P0/P1/P2 differences. Remaining variations are limited to P3-level photographic subject scale and browser font rasterization.
- Final evidence: `design/implementation-chat-desktop-1440x1024.png`, `design/implementation-chat-mobile-390x844.png`, and `design/comparison-desktop-final.jpg`.

## Interactions and console

Browser-tested:

- landing renders and primary navigation resolves;
- connected chat state renders;
- text entry and send;
- mobile chat menu;
- report modal and Spam report completion;
- reported-session state;
- ES/EN control;
- responsive desktop/mobile viewports.

A fresh browser tab was used for the final console check. Console errors and warnings: none.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- [P3] A future asset iteration could tune the remote subject scale by a few percent to make the photographic crop pixel-closer to the generated mock.

final result: passed

---

# Super Admin console design QA

## Comparison target

- Source visual truth: `design/reference-superadmin-option-3.png`
- Source pixels: 1487 × 1058
- Implementation: `/admin`
- Final desktop screenshot: `design/implementation-superadmin-desktop.png`
- Final mobile screenshot: `design/implementation-superadmin-mobile.png`
- Normalized comparison: `design/comparison-superadmin-final.png`
- Requested CSS viewports: 1440 × 1024 desktop and 390 × 844 mobile
- Browser-rendered content pixels: 1425 × 1013 desktop and 375 × 811 mobile
- Device scale factor: 1
- State: authenticated superuser, real administrative overview, six persisted feature flags, degraded moderation warning, operational metrics, and recent audit activity

## Full-view comparison evidence

The normalized side-by-side comparison preserves the selected option 3 composition: full-height navy navigation rail, compact white governance header, coral degraded-service alert, live metrics column, large feature-control ledger, restrained teal controls, and recent audit table. The implementation uses the same sparse density, border rhythm, typography hierarchy, color family, and information priority while replacing every illustrative value with API-backed fields.

At 390 × 844 the rail becomes a dismissible navigation drawer, the four headline metrics become a readable two-column grid, feature rows become stacked controls, and administrative tables become labeled record cards. There is no horizontal overflow.

## Required product states

Browser-tested:

- authenticated superuser access and permission-filtered navigation;
- degraded moderation warning and live monitoring health;
- pending feature change, mandatory reason, atomic apply, success state, and restoration of the saved state;
- desktop navigation and mobile drawer;
- 5-second monitoring refresh surface and visible last-update timestamp;
- ES/EN controls;
- loading and service error rendering;
- clean final browser console with no errors or warnings.

Code paths and automated tests cover unauthorized/forbidden routing, empty/error states, self-demotion, guest role restrictions, last-superuser protection, superuser sanction confirmation, evidence access, audit writes, and service heartbeats.

## Findings and iterations

### Iteration 1 — blocked

- [P2] The first mobile capture was taken during the drawer transition, making the navigation appear clipped.
- [P2] The desktop header omitted the reference date context.
- Fixes: validated the drawer after its transition, added an icon-library date status, and recaptured both acceptance viewports.

### Iteration 2 — passed

- No actionable P0, P1, or P2 visual differences remain.
- Remaining P3 differences are intentional data-shape differences: the live API ledger shows audited actions instead of the illustrative “last change” cells and leaves the apply action disabled when there are no pending changes.

final result: passed
