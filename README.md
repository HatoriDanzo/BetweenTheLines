# Between The Lines

**What the CV Says. What It Doesn't.**

Between The Lines is a portfolio-quality AI recruitment intelligence tool. It accepts a CV plus optional professional URLs, performs public evidence collection, and generates a recruiter-style professional audit rather than a CV summary.

## Stack

- Frontend: HTML, Tailwind CSS, vanilla JavaScript
- Hosting: Netlify
- Backend: Netlify Functions
- AI: Gemini 2.5 Flash
- Parsing: PDF and DOCX parsers
- Research: user-supplied URL retrieval plus public search-result retrieval

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your Gemini key:

   ```bash
   cp .env.example .env
   ```

3. Run locally:

   ```bash
   npm run dev
   ```

The app runs without a Gemini key in a transparent demo mode, but AI-quality recruiter analysis requires `GEMINI_API_KEY`.

## Privacy Note

The app sends CV text and public evidence snippets to the configured Gemini API from the Netlify Function. It does not store submissions in this codebase.
