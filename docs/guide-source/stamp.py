"""Add a footer with page numbers to every page after the cover."""
import io, sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

src, dst = sys.argv[1], sys.argv[2]
reader = PdfReader(src)
writer = PdfWriter()
total = len(reader.pages)
W, H = A4
for i, page in enumerate(reader.pages):
    if i > 0:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.setFillColorRGB(0.47, 0.49, 0.51)
        c.setFont("Helvetica", 8)
        c.drawRightString(W - 45, 30, "My Clinic Educational  |  Events Platform Guide  v1.0")
        c.setFont("Helvetica-Bold", 9)
        c.setFillColorRGB(0, 0.22, 0.41)
        c.drawString(45, 30, f"{i + 1} / {total}")
        c.setStrokeColorRGB(0.89, 0.90, 0.92)
        c.setLineWidth(0.5)
        c.line(45, 42, W - 45, 42)
        c.save()
        buf.seek(0)
        page.merge_page(PdfReader(buf).pages[0])
    writer.add_page(page)
writer.add_metadata({"/Title": "منصة عيادتي للفعاليات: دليل عمل النظام", "/Author": "My Clinic Educational", "/Subject": "Events platform system guide (Arabic)"})
writer.write(dst)
print(f"stamped {total} pages -> {dst}")
