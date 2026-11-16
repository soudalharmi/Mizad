# Mazad Boss: how changes are published

Netlify charges 15 credits for every production deploy (any push to `main`).
Branch deploys are free, so:

1. All work is committed and pushed to the `dev` branch only.
   Preview: https://dev--mazadboss.netlify.app
2. Nothing is pushed or merged to `main` until the owner says to publish.
   Then merge `dev` into `main` once (one production deploy) and push.
3. Never push directly to `main` for small fixes.
