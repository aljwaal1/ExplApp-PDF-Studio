# ExplApp PDF Studio — Native Flutter Android migration

**Source of feature parity:** existing iPhone/web PWA. **Android implementation:** Flutter/Dart for UI; Kotlin + native libraries for document processing. **No WebView.**

## Mandatory features (18)

| # | Feature | Phase | Current status |
|---|---|---|---|
| 1 | Merge PDF | 0 | Native initial implementation; device QA required |
| 2 | Extract/split PDF pages | 0 | Native initial implementation; device QA required |
| 3 | Reorder and rotate PDF pages | 1 | Rotation implemented, arbitrary reorder pending |
| 4 | Remove blank PDF pages | 2 | Implemented in PR #9; visual QA pending |
| 5 | Watermark and page numbering | 2 | Pending |
| 6 | PDF to TXT | 1 | Native initial implementation in PR #8 |
| 7 | PDF to Markdown | 3 | Pending |
| 8 | PDF to Word DOCX | 3 | Pending |
| 9 | PDF to images | 2 | Implemented in PR #9 (PNG ZIP); CI and device QA pending |
| 10 | Images to PDF | 2 | Implemented in PR #9 (PNG/JPG to A4 PDF); CI and device QA pending |
| 11 | PDF to HTML | 3 | Pending |
| 12 | Table extraction Excel/CSV | 4 | Pending |
| 13 | Arabic and English OCR | 4 | Pending; bundle language models for offline |
| 14 | Search in PDF | 2 | Implemented in PR #9 (text search to TXT); CI/device QA pending |
| 15 | Compare two PDF documents | 4 | Pending |
| 16 | Detect/extract book chapters | 5 | Pending |
| 17 | Batch processing | 5 | Pending |
| 18 | Page preview/zoom and open/save/share | 2 | Open/share initial; thumbnails/zoom and Save As pending |

The additional PR #8 operations *delete chosen pages* and *reverse page order* are part of the editing feature family.

## Acceptance gates for EVERY feature
1. Actual engine implementation with local input/output files; no browser/web-wrapper and no dummy buttons.
2. Input validation, errors surfaced in Arabic, busy state, and no overwriting source files.
3. Automated unit/fixture tests including Arabic document and malformed or encrypted PDF cases when applicable.
4. Flutter analyze, Flutter widget tests, successful Android APK build.
5. On-device QA before declaring production-ready: open input, process, open output, Save As via Android system picker, share, verify output with independent viewer.
6. A feature is marked complete only after its automated tests AND device acceptance. Do not claim file-fidelity, OCR offline support, or DOCX format preservation without tests.

## Build policy
- Keep the PWA unchanged and available separately.
- Publish new Flutter-native builds distinct from legacy Capacitor artifacts.
- Debug APK is for testers only; production signing and Play Store release require a separate process.
- PR #8 is phase 1 and must pass Android CI before merge.
