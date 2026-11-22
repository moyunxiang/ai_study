# Design v1 (2026-11, before the Organic Neural Chronology restyle)

A snapshot of the first public design: warm paper background, serif headings, terracotta accent.

- `style.css`, `app.js`, `index.html`: the front-end files as deployed at commit `34b9cf4c`.
- `design.html`: the design notes of that version.
- `screens/`: the 20 screenshots referenced by those notes.
- `og.png`: the share image of that version.

The whole site at that point is also tagged in git as `design-v1`.
To look at it locally: `git worktree add ../ai_study-v1 design-v1 && python3 -m http.server -d ../ai_study-v1/docs 8800`.
To restore only the look: copy `style.css`, `app.js` and `index.html` back into `docs/assets/` and `docs/`, then run `python3 scripts/build.py`.
