# maptype

Learn the geography of the world by typing it: countries and capitals, rivers, seas, mountains and deserts, in many languages. Built by Vexut.

## Files

```
index.html                 the page
404.html                   shown when someone opens a link that doesn't exist
favicon.svg                tab icon
robots.txt                 lets search engines index the site
third-party-notices.txt    licences for the map data and font
assets/css/style.css       all styling and colour themes
assets/js/app.js           how the game works
assets/js/data.js          map shapes, country names and capitals (generated)
assets/js/physical.js      rivers, seas, mountains and deserts (generated)
assets/js/capitals.js      capital names in other languages (generated)
assets/js/iso.js           country codes used for name translation
assets/fonts/              Roboto Mono font files
```

## Put it online

Upload everything in this folder, keeping the same structure, so that `index.html` is at the top level.
Works on any static host, for example GitHub Pages, Cloudflare Pages or Netlify.

## Common edits

- Contact email in the privacy section: set `var CONTACT=""` near the top of `assets/js/app.js`.
- Colour themes: the `THEMES` list in `assets/js/app.js`.
- A wrong name or capital: search for it in `assets/js/data.js` and fix the text.

## Privacy

No cookies, analytics, accounts or third-party requests. Settings are saved only in the visitor's browser (localStorage).
