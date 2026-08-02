# Rickey Wax Pack Solitaire

A dependency-free, single-player browser game built for GitHub Pages. Open fictional 15-card wax packs and try to reveal card #482 before your pack supply runs out.

## Rules

- Start with 10 packs.
- Each pack contains 15 different card numbers.
- A card's first appearance can contribute to a five-number run; later copies become duplicates.
- Trade 10 duplicates for 1 pack, or 25 duplicates for 3 packs.
- Five consecutive unused card numbers automatically earn 1 bonus pack. Those numbers are consumed for run purposes, preventing overlapping rewards.
- Reveal #482 to win.
- The current run is saved in browser `localStorage`.

## Add the card scans

Copy all 726 JPG files into the `images` directory with three-digit filenames:

```text
images/001.jpg
images/002.jpg
...
images/726.jpg
```

The game displays a text card when an image is missing, so it can be tested before the scans are added.

## Test locally

Because the game loads `data/cards.json` with `fetch`, do not open `index.html` directly as a `file://` URL. From the project folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Publish with GitHub Pages

1. Upload the contents of this folder to a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Save and open the Pages address after deployment completes.

No build step or package installation is required.

## Project structure

```text
index.html
assets/wax-pack.svg
css/styles.css
data/cards.json
images/001.jpg ... 726.jpg
js/app.js
js/game-core.js
```
