# 地书翻译机

Open `index.html` directly in a browser for offline dictionary translation.

For backend AI gap filling, run the local server from the workspace root:

```powershell
& "C:\Users\Augenstern\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" dishu-translator\server.js
```

Then open:

```text
http://127.0.0.1:8787/dishu-translator/index.html
```

The page loads:

- `../data/translator/concept_index.js`
- `../data/translator/examples.js`
- images under `../地书标注系统 V1.0/images/auto_cut_segments/`

Rebuild data after annotation changes:

```powershell
& "C:\Users\Augenstern\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" ..\scripts\build_translator_data.py
```

The static translator does not require a runtime model API. Backend AI gap filling uses the local `server.js` proxy and sends the API key only to the configured model endpoint for the current request.

## AI gap filling with backend API

1. Run `server.js`.
2. Enter an OpenAI-compatible endpoint, model, and API key.
3. Click `后台 AI 补译`.

DeepSeek-compatible defaults:

```text
Endpoint: https://api.deepseek.com/v1/chat/completions
Model: deepseek-chat
```

The API key is not written to disk by this app.

## Manual AI gap filling

When a sentence has untranslated gaps:

1. Click `生成提示`.
2. Copy the prompt into any LLM.
3. Ask it to return only JSON.
4. Paste the JSON into the response box.
5. Click `应用 AI 补译`.

The response should look like:

```json
{
  "replacements": [
    {
      "gap": "明天",
      "concept_id": "c_0076",
      "term": "明天",
      "note": "用次日近似表达未来一天"
    }
  ]
}
```
