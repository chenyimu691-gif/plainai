# Reviewed starter sources

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
