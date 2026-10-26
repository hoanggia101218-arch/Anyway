# iOS configuration notes

- `skadnetwork-ids.txt`: only 3 placeholder ids. Before real ads go live, replace with Google's full
  SKAdNetwork list (https://developers.google.com/admob/ios/choose-networks).
- AdMob ids are Google's public TEST ids (Info.plist via scripts/ios-customize.py, ad unit ids in
  docs/app.js). Real ids come from the operator's AdMob account.
