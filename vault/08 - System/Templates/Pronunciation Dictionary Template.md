<!--
TEMPLATE: Pronunciation Dictionary

Copy to: 01 - Projects/<Project>/pronunciation.json (the .json file is the
canonical artefact; this MD describes the schema and gives a worked example).

The audio-producer directive applies these substitutions before sending text
to the TTS provider. The skill itself is project-agnostic — projects bring
their own dictionary as a parameter.
-->
---
project: <Project>
type: pronunciation-dictionary
status: active
tags:
  - pronunciation
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: <Project> - Overview
---
## 🔗 Navigation

**UP:** [[<Project> - Overview|Overview]]

# <Project> — Pronunciation Dictionary

> The companion `pronunciation.json` in this folder is the canonical artefact. This MD documents the schema and shows how to extend it.

## Schema

`pronunciation.json` is an array of objects:

```json
[
  {
    "term": "<word as it appears in the script>",
    "phoneme": "<IPA — for human reference, not used by the substitution>",
    "replacement": "<phonetic respell — what gets sent to TTS in place of `term`>"
  }
]
```

The audio-producer applies substitutions **case-insensitive, whole-word**, before synthesis. The `phoneme` field is documentation only.

## Worked example

```json
[
  {
    "term": "echocardiogram",
    "phoneme": "ˌek.oʊˈkɑːr.di.ə.ɡræm",
    "replacement": "eh-koh-KAR-dee-oh-gram"
  },
  {
    "term": "anaemia",
    "phoneme": "əˈniː.mi.ə",
    "replacement": "uh-NEE-mee-uh"
  }
]
```

## When to add a term

Add a term when:

1. The TTS provider consistently mispronounces it across multiple voices.
2. The mispronunciation is bad enough that a listener would notice (a faint vowel shift on a rare word doesn't qualify; a stressed wrong syllable on a common word does).
3. The replacement reads naturally in your target accent.

Don't add a term when:

- It's a one-off in a single script (rewrite the script).
- The provider gets it right with a slight context tweak (add the context to the script).
- It's a project-specific name the provider has never seen — try `<name>` spelled phonetically inline first; only add to the dictionary if it recurs.

## Workflow

1. Catch a mispronunciation during a TTS preview phase.
2. Pick a phonetic respell that the provider's voices read correctly. Test on 2 different voices to be sure.
3. Add the entry to `pronunciation.json`.
4. Re-run the segment to confirm.

## Versioning

Bump `updated:` in this file's frontmatter when `pronunciation.json` changes. The audio-producer reads both — the JSON for substitutions, this MD for context.
