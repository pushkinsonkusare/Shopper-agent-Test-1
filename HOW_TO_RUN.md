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
