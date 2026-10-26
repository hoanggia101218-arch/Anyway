#!/usr/bin/env python3
"""Applies Anyway-specific settings to the Capacitor-generated ios/ project (run after
`npx cap add ios`, before `npx cap sync ios`). Idempotent."""
import pathlib
import plistlib
import shutil

root = pathlib.Path(__file__).resolve().parent.parent
app = root / 'ios' / 'App' / 'App'
plist_path = app / 'Info.plist'
with open(plist_path, 'rb') as f:
    pl = plistlib.load(f)

pl['CFBundleDisplayName'] = 'Anyway'
# HTTPS only, no custom crypto -> skips the export-compliance question on every upload
pl['ITSAppUsesNonExemptEncryption'] = False
# vertical-feed app: iPhone portrait only
pl['UISupportedInterfaceOrientations'] = ['UIInterfaceOrientationPortrait']
pl['UISupportedInterfaceOrientations~ipad'] = [
    'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
# AdMob: Google's public TEST app id. Replace with the real one before the App Store build.
pl['GADApplicationIdentifier'] = 'ca-app-pub-3940256099942544~1458002511'
pl['NSUserTrackingUsageDescription'] = (
    'Your data is used only to show you more relevant ads. You can say no and still use every feature.')
ids = [l.strip() for l in (root / 'ios-config' / 'skadnetwork-ids.txt').read_text().splitlines() if l.strip()]
pl['SKAdNetworkItems'] = [{'SKAdNetworkIdentifier': i} for i in ids]
with open(plist_path, 'wb') as f:
    plistlib.dump(pl, f)

# App icon (1024 universal) and splash from resources/
icon_dir = app / 'Assets.xcassets' / 'AppIcon.appiconset'
if icon_dir.exists():
    for old in icon_dir.glob('*.png'):
        old.unlink()
    shutil.copy(root / 'resources' / 'icon-1024.png', icon_dir / 'AppIcon-512@2x.png')
    (icon_dir / 'Contents.json').write_text(
        '{"images":[{"filename":"AppIcon-512@2x.png","idiom":"universal","platform":"ios","size":"1024x1024"}],'
        '"info":{"author":"xcode","version":1}}')
splash_dir = app / 'Assets.xcassets' / 'Splash.imageset'
if splash_dir.exists():
    for p in splash_dir.glob('*.png'):
        shutil.copy(root / 'resources' / 'splash-2732.png', p)
print('ios customised')
