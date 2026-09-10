# Programming language logos

Used by the assessment flow's coding-round language picker
(`components/AssessmentCreation.tsx`). Local files, not a CDN: the picker is a
dialog the recruiter opens mid-form, and a logo that arrives late — or not at
all on a restricted network — reads as a broken card.

| Source | Files | Licence |
| --- | --- | --- |
| [devicon](https://github.com/devicons/devicon) | all except `kotlin.svg` | MIT |
| [vscode-icons](https://github.com/vscode-icons/vscode-icons) | `kotlin.svg` | MIT |

The marks themselves are their owners' trademarks and are used to identify the
language, unmodified.

One file per entry in `COMPILABLE_LANGUAGES`, named after the file, not the
label — `cplusplus.svg` for C++, `csharp.svg` for C#. Adding a language to that
list means adding its logo here; the picker falls back to a lettered tile for
anything with no file.
