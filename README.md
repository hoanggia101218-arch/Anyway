# Anyway (web + iOS wrapper)

- `docs/` - the published web app (served by GitHub Pages and wrapped by Capacitor). Updated by the
  deploy routine from the Drive `output/` folder.
- `capacitor.config.json`, `package.json` - Capacitor 8 wrapper config.
- `scripts/prepare-web.sh` - docs/ -> www/ (drops admin/internal files, refuses CDN references).
- `scripts/ios-customize.py`, `resources/`, `ios-config/` - applied to the generated iOS project.
- `.github/workflows/ios-build.yml` - unsigned simulator build on a free macOS runner.

Native `ios/` and `android/` folders are generated in CI, not committed.
