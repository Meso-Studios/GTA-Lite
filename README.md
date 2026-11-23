# SAN NOVA — Open World Crime Sandbox

10 km × 10 km 3D browser open-world sandbox built with React, TypeScript, Tailwind CSS, and Three.js.

## Local Development

```bash
npm install
npm run dev
```

## Publishing to GitHub Pages

This repository is preconfigured for zero-config GitHub Pages deployment (relative `base: './'`, self-contained Vite bundle, `public/.nojekyll`, `public/404.html`, and `.github/workflows/deploy.yaml`):

1. Push this repository to GitHub on the `main` (or `master`) branch.
2. In your GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push a commit (or run **Actions → Deploy San Nova to GitHub Pages → Run workflow**) to build and publish automatically to `https://<your-username>.github.io/<your-repo>/`.
