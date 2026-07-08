# Burbuja
Discord Bot for Greeting people when joining with Burbuja's Voice

## Text-to-speech

OpenAI (`gpt-4o-mini-tts`) is the primary voice provider. Copy `.env.example` to `.env.local`, replace every placeholder and run:

```powershell
.\start-bot.bat
```

The batch file loads `DISCORD_TOKEN`, `OPENAI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT` and `NODE_ENV` from `.env.local`. It always pauses after the bot stops so startup errors remain visible. `.env.local` is ignored by Git and must never be committed.

If the OpenAI key is missing or its TTS request fails, the bot automatically falls back to Google Cloud Text-to-Speech. The OpenAI model, voice and instructions can optionally be overridden with a non-secret `OpenAI` object in the selected `config.json` environment.
