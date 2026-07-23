import os
from pathlib import Path

from pypdf import PdfReader, PdfWriter


src = Path(
    os.environ.get(
        "ROUTEONE_QUESTIONNAIRE_TEMPLATE",
        Path.cwd() / "data" / "routeone" / "Auto_Lender_Program_Questionnaire_Fillable.pdf",
    )
)
out = Path(
    os.environ.get(
        "ROUTEONE_TEST_OUTPUT",
        Path.cwd() / "outputs" / "routeone" / "sample_filled_field.pdf",
    )
)
out.parent.mkdir(parents=True, exist_ok=True)

reader = PdfReader(str(src))
writer = PdfWriter()
writer.append(reader)
writer.set_need_appearances_writer(True)

values = {
    "txt_0001": "Ally sample lender",
    "txt_0002": "Retail / lease program",
    "txt_0013": "Ally",
}
for page in writer.pages:
    writer.update_page_form_field_values(page, values, auto_regenerate=True)

with out.open("wb") as fh:
    writer.write(fh)

print(out)
