# Dishu Translator Data Scripts

Run the data build from the workspace root:

```powershell
& "C:\Users\Augenstern\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\build_translator_data.py
```

Outputs are written to `data/translator/`:

- `normalized_dishu_annotations.jsonl`
- `normalized_text_annotations.jsonl`
- `concept_candidates.json`
- `concept_index.json`
- `examples.json`
- `concept_index.js`
- `examples.js`
- `llm_batches/batch_*.json`

The web app uses the `.js` wrappers so `dishu-translator/index.html` can be opened directly without a local server.
