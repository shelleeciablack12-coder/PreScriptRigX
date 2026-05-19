# PreScriptRigX — Study Hub

Static single-page Study Hub that models subject folders with three sections: Study Source, Past Papers, and Past Papers with Answers.

Quick start:

1. Serve the folder with a static server (VS Code Live Server or Python):

```bash
# Python 3
python -m http.server 8000
```

2. Open `http://localhost:8000` and click subjects to browse.

Files of interest:
- index.html — main UI
- styles.css — dark theme styles
- app.js — navigation and dynamic loader
- subjects/* — per-subject folders with manifests and content
