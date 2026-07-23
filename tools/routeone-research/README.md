# RouteOne research and document generators

These utilities were consolidated from the former local `work_routeone`
workspace. They generate lender research summaries, playbooks, questionnaire
field maps, filled questionnaire packets, and CSV exports.

Only reusable source code is committed. Source PDFs, lender exports, generated
documents, personal contact overrides, and customer/dealership data are not
safe for a public repository and remain excluded.

## Configuration

- `ROUTEONE_ROOT`: directory containing source PDFs and extracted research data
- `ROUTEONE_OUTPUT_DIR`: destination for generated PDFs and CSVs
- `ROUTEONE_TOOLS_DIR`: optional directory containing
  `build_visual_quick_reference.py`
- `ROUTEONE_QUESTIONNAIRE_TEMPLATE`: fillable lender questionnaire PDF
- `ROUTEONE_EXPORTS_DIR`: input directory containing exported lender CSVs
- `ROUTEONE_MATRIX_CSV`: question-matrix CSV override
- `ROUTEONE_FIELD_MAP`: questionnaire field-map output path
- `ROUTEONE_TEST_OUTPUT`: smoke-test PDF output path

Defaults use `data/routeone/` for private inputs and
`data/routeone/generated/` for outputs. Both `data/routeone/` and the repository
`outputs/` directory are ignored by Git.

Install the Python dependencies from the repository requirements before
running the generators. Some tools also require Microsoft Excel or the
optional visual quick-reference helper.

The public version intentionally omits the old hard-coded employee email map.
Contact details are discovered from authorized local source documents at
runtime.
