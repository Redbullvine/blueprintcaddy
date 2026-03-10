# BlueprintCaddy.app MVP

BlueprintCaddy.app is a front-end-only DXF-to-blueprint generator.

Drop in a DXF, enter real-world dimensions, and generate a polished printable blueprint sheet. Export to SVG or print/save to PDF from the browser.

## Supported DXF Entities (MVP)
- `LINE`
- `LWPOLYLINE`
- `POLYLINE` (with `VERTEX` records)
- `CIRCLE`
- `ARC`

Unsupported entities are ignored and shown as a warning list in the UI.

## What It Does
- DXF upload via file picker
- DXF drag-and-drop upload
- Original drawing preview
- Blueprint sheet generation with:
  - border
  - drawing area
  - title block
  - dimension summary
  - source file name
  - date generated
  - scale note
  - notes area
  - revision field
  - BlueprintCaddy branding + disclaimer
- Page options:
  - Letter landscape
  - Letter portrait
  - Tabloid landscape
- Export final sheet to SVG
- Print stylesheet for clean PDF-ready browser print output
- Includes `samples/sample-door.dxf`

## Run Locally
1. Open this folder (`blueprint-app`) in VS Code.
2. Start any static local server from this folder, for example:
   - `python -m http.server 5173`
3. Open `http://localhost:5173` in your browser.
4. Click **Load Sample** or upload your own DXF.

## Netlify Deploy (Static)
1. Push repo to GitHub.
2. In Netlify, create a new site from GitHub.
3. Use:
   - Build command: *(leave empty)*
   - Publish directory: `.`
4. Deploy.

No backend, no serverless functions, and no environment variables are required for this MVP.

## Quick Test with Included Sample
1. Click **Load Sample**.
2. Confirm raw preview appears.
3. Confirm blueprint sheet preview appears.
4. Click **Export SVG** and verify download.
5. Click **Print / Save PDF** and confirm clean print preview.
6. Click **Reset** and verify UI returns to empty state.

## Known MVP Limitations
- DXF support is intentionally limited to basic 2D entities listed above.
- No CAD editing features (snapping, layers, advanced dimensioning, fabrication tolerances).
- Output is intended for concept / field-use layout, not certified fabrication engineering.
- Generated dimensions depend on user-entered real-world values and source DXF quality.