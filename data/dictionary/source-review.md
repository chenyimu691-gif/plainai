# Reviewed dictionary sources

Reviewed on 2026-10-19. Approval applies only to the listed data paths and the
original definition text at those paths. A repository's GitHub license badge
alone is not an admission decision. The exact upstream license bytes are kept
in `licenses/`; their SHA-256 values are pinned in `sources.json`.

| Source | Reviewed commit | Data and permitted extraction | Content license evidence |
| --- | --- | --- | --- |
| [FirmaPanel Procurement Glossary](https://github.com/FirmaPanel/procurement-glossary) | `fcfcadae0140ebe1b94b8cfc32ad6c6cee5d7d96` | `data/glossary.json`: array, 314 entries; `term`, `definition`, optional `aliases`. | README explicitly licenses the **dataset and documentation** as CC BY 4.0; `data/metadata.json` agrees. `scripts/` is separately MIT. |
| [TechTerms](https://github.com/techterms/techterms) | `0cc26a2b59a3bcde14d177d70f5f42d8cff03309` | `src/data/definitions.ts`: `definitions` array, 65 entries; static `term` and `explanation` string literals. | README licenses the project as MIT and explicitly identifies this file as its glossary. Root MIT notice includes associated documentation; no nested exception found for this data file. |
| [The Agent Glossary](https://github.com/TheColonyCC/agent-glossary) | `0b95f3af232bf0e702a8cf6c4173422759ecbc79` | `index.html`: `article[id]`, heading `h3`, definition paragraphs `p`. | README identifies the whole static glossary and explicitly states MIT; root notice credits The Agent Glossary contributors. |

These starter adapters cover technical terms, procurement/business terms and
AI/internet terminology. They do **not** establish broad coverage of finance,
legal, medical, science or education. All eight requested domains can be
searched for candidates; admitting a new source requires review of its actual
content permission and an explicit registry update through a PR.

## Chinese source population — 2026-10-20

The v2 snapshot adds **1,169** source-copy entries from the six projects below.
These are copied Chinese definitions, not model translations or claims of
specialist/human review. The original 3,093 built-in entries are unchanged.
Together they provide 4,262 entries after global term/alias deduplication.
Default industry choices stay unchanged; users opt into the additional libraries.

| Project and reviewed commit | Approved data and content permission | New entries |
| --- | --- | ---: |
| [Traffic Terminology Corpus](https://github.com/Luz7818/traffic-terminology/tree/bf213740c6a8210d137acedc555fd0220e6b602b) — `bf213740c6a8210d137acedc555fd0220e6b602b` | Eight primary `data/01_*.jsonl`–`data/08_*.jsonl` files: `term_zh`, `definition`, `term_en`. README explicitly licenses **both corpus and code** CC BY 4.0 and describes the corpus as human-authored. The referenced GB/CJJ/JTG standards are not copied. Colloquial substitutions are not imported as aliases. | science **689** |
| [Better Quant Wiki](https://github.com/Tomortec/better-quant-wiki/tree/5611485adb669828fcaf704aeb2ce9c8a86886d4) — `5611485adb669828fcaf704aeb2ce9c8a86886d4` | Eight named exported arrays in `src/content/glossary/*.ts`, excluding `index.ts`: `zh`, `definition`, `en`, `abbr`. README explicitly states “Prose in this repo is original” under MIT; the external Quant Wiki supplies topics rather than copied prose. No formulas, exercises or linked content are imported. | finance **204** |
| [Vibe Coding 术语速查](https://github.com/edwardmqg-dotcom/vibe-coding-glossary-zh/tree/ce82ef4e42da4b261b2b429af4bb6124bec01db2) — `ce82ef4e42da4b261b2b429af4bb6124bec01db2` | `index.html`, static inline `terms` array: `name`, `plain`, `english`. README explicitly publishes code **and original writing** under MIT, by EddieM. No scripts execute and no further-reading material is copied. | technical **44** |
| [网页交互术语图鉴](https://github.com/guo25476688-cmd/web-interaction-glossary/tree/5d50a7f8af2b30cbd5a03c506be703a41e7a8b21) — `5d50a7f8af2b30cbd5a03c506be703a41e7a8b21` | `js/terms-basic.js` and `js/terms-more-1.js`–`js/terms-more-6.js`, static `TERMS`/direct `TERMS.push` records: `zh`, `plain`, `en`. README describes its authored dictionary fields and publishes the project under MIT. Product research/operations IDs have an explicit business allowlist; interface/interaction records are internet. Exclude demo HTML, prompts, loose aliases and third-party showcase links. Exclude `darkpattern`: its Chinese name “暗黑模式” could be confused with dark display themes although the definition means deceptive design. | internet **213**, business **9** |
| [循证医学科普](https://github.com/bbylw/Medicine/tree/aa3bf341aa436c120584e98a71fba75bcbe62d9e) — `aa3bf341aa436c120584e98a71fba75bcbe62d9e` | `index.html`, nine allowlisted `h3`/`h4` headings and immediately adjacent `p` text. Root MIT covers this authored education page; no content exception found. README cites Cochrane, WHO Guidelines, GRADE and Guyatt et al., BMJ 2008, DOI `10.1136/bmj.39489.470347.AD`. Those references are context, not permission to copy their texts and not evidence of physician review. Only EBM concepts and cognitive biases are admitted. | medical **9** |
| [plain-speak](https://github.com/chengwudi1/plain-speak/tree/e3598f3e3caa68c0a1440aad0ac9d302246d522d) — `e3598f3e3caa68c0a1440aad0ac9d302246d522d` | `skills/plain-speak/references/jargon-legal.md`, only the first two columns of the “连带责任” row. README/CONTRIBUTING identify these authored reference tables as core assets under MIT. The file explicitly states Chinese legal context. `asOf=2026-09-06` records the pinned source commit date, not a certification of current law. | legal **1** |

Each source record pins the full upstream license hash and retains the complete
notice in `licenses/`. Current release artifacts record the exact source commit,
file, original definition and attribution on every entry. The six full notices
added here are `traffic-terminology.txt`, `better-quant-wiki.txt`,
`vibe-coding-zh.txt`, `web-interaction.txt`, `medical-ebm.txt` and
`plain-speak-legal.txt`. MIT copyright lines are retained, including upstream's
`free` credit for the Medicine page. CC BY attribution describes field
normalization and verbatim copying. None of these grants changes embodiedterms'
existing noncommercial conditions.

The release quarantines **675** collected candidates: English or invalid
Chinese explanations, unsupported lengths, instructions/markup, high-risk
content, and term/alias duplicates. Source copies are not truncated or expanded
to pass length checks. Definitions are not independently clinically or legally
reviewed, and program checks cannot guarantee semantic correctness.

Coverage is intentionally limited: engineering means mostly traffic engineering;
business means a small set of digital product research/operations concepts;
medical means introductory community EBM education, not diagnosis or treatment;
legal contains one Chinese-context concept. **education remains 0** and must
still show an empty state in settings.

### Additional candidates excluded in this pass

- `astroicers/security-glossary-tw`: README claims CC BY 4.0 while its checked
  root `LICENSE` is MIT. Do not resolve this content-license inconsistency by
  assuming a badge overrides the notice.
- `DDliu123/baihua-coding`: explicit MIT permission for original glossary text,
  but sampled summaries contain generic templates and taglines often express
  user instructions. Not admitted merely to increase counts.
- `ywEdAi/learning-sciences`: its checked README explicitly says public
  availability grants **no reuse license**. Do not import its education text.
- `quanttide/quanttide-context-of-academic-research`: CC BY 4.0 but only a short
  README; no definitions to collect. Related course/lecture standards have
  headings rather than explanations.
- `3loveljw2/autonomous-proposition`: CC BY 4.0, but describes an author's AI
  exam-writing procedure; it does not supply general education definitions.
- `uckkk/dsh-law-terms`: ten definitions are all below the admission length,
  and no documented jurisdiction/date scope was found.
- Other `plain-speak` legal rows: exclude concrete limitation-period claims,
  potentially misleading deposit definitions, employment restrictions and
  overgeneralized waiver statements; do not copy its “common pitfalls” column.
- `Xing-lion/medpop-science`, `pusws/earlycare`, and medical `plain-speak`:
  treatment/screening content or insufficiently documented specialist authority
  are outside this narrow concept-only import.

### Offline availability

The WXT build verifies this release and its catalog before emitting only the
current snapshot as `dictionary-seed.json`, together with full notices. It does
not package online release history or deltas. The worker and its page fallback
load this file on demand, honor selected categories and keep built-ins first.
A newer online snapshot replaces the entire seed, so deleted terms stay deleted;
an older cache cannot mask the newer packaged data. This makes the new libraries
usable in a newly built extension before Pages is configured. This PR does not
itself deploy or merge them into `main`.

## Extraction boundaries

- Download only HTTPS files from the approved repository and resolved commit.
  Fetch the license from the same commit as the data. Record that commit,
  source path, original definition, license hash, model/prompt revision and change notice.
- Never execute the TechTerms source. A TypeScript AST parser may extract only
  the selected static string fields. Imported `Categories.*`, functions,
  expressions and `related` links must not be executed or recursively fetched.
- For Agent Glossary, extract inert text only from glossary articles. Remove
  the decorative heading anchor `¶`. Do not import navigation, script/style
  bodies or the README's quoted inspiration tweet.
- Procurement `standards_refs` and other links are references, not permission
  to copy the linked standards. Definitions are stated by upstream editorial
  policy to use original wording. Preserve attribution and explicitly mark
  PlainAI's translation/simplification.
- Procurement includes contract, customs and banking terminology. A business
  category is not a low-risk guarantee. Quality checks must detect advice,
  jurisdiction-dependent claims and medical/legal/financial instructions;
  unresolved items stay out of automatic publication.
- Preserve source-specific licenses and full notices in published artifacts.
  AI rewriting does not remove upstream attribution or license conditions.
  Existing embodiedterms content remains CC BY-NC 4.0 and must not be relabeled.

## Other candidates checked

| Candidate | Observed result | Initial automatic import |
| --- | --- | --- |
| [Dictionary of AI Coding](https://github.com/mattpocock/dictionary-of-ai-coding) | No repository license found in the checked tree. | Excluded: public availability is insufficient. |
| [Guffipedia](https://github.com/ft-interactive/guffipedia) | Archived; no repository license detected. Business-jargon text may have separate publication rights. | Excluded. |
| [Open Dictionary](https://github.com/mhollingshead/open-dictionary) | Describes definitions sourced from Wiktionary; no repository license detected. | Excluded: downstream content permissions need separate review. |
| [AI Glossary for Journalists](https://github.com/ryan-serpico/aiglossary.news) | YAML `word`, `definition_list[].text`, `in_use[]`; root MIT notice inherited from LA Times. Usage examples quote IEEE Spectrum, TechCrunch and others. | Not enabled. A future adapter must distinguish authored definitions from third-party quoted examples and substantiate the content scope. |
| [Tech Atlas](https://atlas.maintz.dev/en/data/) | Attachment describes CC BY-SA 4.0. Not independently admitted here. | Excluded from the permissive-license automatic path. |
| [FIBO](https://github.com/edmcouncil/fibo) | Root README says “FIBO code license”; sampled `FND/Accounting/CurrencyAmount.rdf` also embeds an MIT grant, but ontology imports and ISO-derived terminology need path-specific review. | Not enabled. Future RDF adapter and content-scope review required. |
| [Gene Ontology](https://github.com/geneontology/go-ontology) | Root CC BY 4.0; `src/ontology/go-edit.obo` embeds CC BY 4.0 metadata and includes obsolete terms, synonyms and ontology imports. | Not enabled. Future OBO adapter must exclude obsolete/foreign imported terms; specialist semantic checks required. |

## License change handling

The registry pins SHA-256 of the complete, unnormalized license bytes. A change,
missing file, missing scope evidence, unsupported license, or mismatch blocks
that source's release. Do not automatically replace its expected hash with the
new one. Update the evidence and pin in a separate human-reviewed PR.

For a license or attribution migration within the same source identity, copy
the complete former `license` metadata into `licenseHistory`, preserve its exact
full notice file, and add `revisions` containing only the explicitly reviewed
40-character commit SHAs to which that grant applies. Install the newly reviewed
notice in a separate file and update the current `license` record. Document the
scope evidence and commit list in the PR; neither hashes nor historical approval
lists may be updated automatically. The migration procedure is described in
[`docs/dictionary-updates.md`](../../docs/dictionary-updates.md#许可证迁移).

Historical grants validate existing provenance only. Fresh collection must match
the current license; an unknown old hash or a revision absent from the approved
history still fails closed. Keep historical records and full notices while any
current entry, retained snapshot or delta base references them. The extension and
Pages notices include both current and historical full license texts and their
respective attribution. Pages also publishes historical full notices as
`licenses/<source-id>-<sha256>.txt`.

A repository, data path, domain or legal/context identity change requires a new
source ID; license history does not approve such changes. Keep the retired source
record with `enabled: false` and its notices while current entries or retained
snapshots still reference it. A hash proves the reviewed notice is unchanged;
it does not prove rights to unrelated third-party material, which is why
extraction scope is restricted above.
