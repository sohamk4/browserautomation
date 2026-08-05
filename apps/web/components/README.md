# Components

Reusable UI components for the Workflow Recorder frontend live here.

The current UI is implemented in `app/page.tsx` (a single client component that
drives recording state and renders the live step list). As the UI grows, extract
presentational pieces (step cards, recording controls, workflow list) into this
directory and import them from `app/page.tsx`.
