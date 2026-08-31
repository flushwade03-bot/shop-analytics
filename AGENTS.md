# shop-analytics agent guidance

- Use Node.js 20 or newer. There are no npm dependencies.
- Run `npm test` before handing off code changes.
- Never print, inspect, commit, or include `.env`, `.data/`, access tokens, refresh tokens, API keys, or shared secrets in output.
- Use `node src/cli.js ...` for Etsy operations. Do not call Etsy with ad-hoc commands that could expose authorization headers.
- Prefer `sales-summary` for sales analysis because it excludes buyer personal information.
- Read-only Etsy operations are allowed when the user asks for analysis.
- Creating or editing a listing changes the user's Etsy shop. Only run `create-listing` or `update-listing` when the user explicitly requests that mutation and has provided or approved the exact content.
- Other-shop analysis must use only `public-shop`, `public-listings`, or `search`; never attempt OAuth-authenticated access to another shop.
- Do not add a listing deletion command or request the `listings_d` scope unless the user explicitly expands the project scope.
