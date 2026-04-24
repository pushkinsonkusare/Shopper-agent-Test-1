# How to run the app

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a local env file for the agent API:
   ```bash
   cp .env.example .env
   ```

3. Add your OpenAI API key to `.env`:
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open the app in a real browser:
   - Chrome, Safari, or Firefox
   - [http://localhost:8080](http://localhost:8080)

If `OPENAI_API_KEY` is missing, the app still runs with a local fallback recommender, but the real agent API will not be used.

GitHub Pages
------------

The app can also run as a static site on GitHub Pages.

- The published site loads product data from `shiseido-catalog.json`
- Chat searches fall back to the built-in client-side recommender unless you
  configure a hosted API
- The `/api/chat` server endpoint is only used in local/server-backed mode or
  through a hosted backend such as Vercel

If you update `app.js`, make sure the GitHub Pages deployment includes:

- `index.html`
- `app.js`
- `site-config.js`
- `styles.css`
- `shiseido-catalog.json`
- any referenced image assets

GitHub Pages + Vercel API
-------------------------

This repo includes a Vercel-ready API entrypoint at `api/[...path].js`.

To use Vercel for the backend:

1. Create a Vercel project from this repo.
2. Add environment variables in Vercel:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
3. Deploy the project. Your backend base URL will look like:
   - `https://your-project-name.vercel.app`
4. Update `site-config.js` in the GitHub Pages frontend to:
   ```js
   window.SHOPPER_AGENT_CONFIG = {
     apiBaseUrl: "https://your-project-name.vercel.app",
   };
   ```
5. Push the updated `site-config.js` so GitHub Pages picks it up.

The frontend will then call `https://your-project-name.vercel.app/api/chat`
while still loading the static catalog and assets from GitHub Pages.
