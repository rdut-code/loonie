"""Writes the synthetic PDF statements used for testing. All data is invented.

Run from the project folder:  python3 tests/make-pdf-fixtures.py
"""
import os

def width(text, size=10):
    # Close enough to Helvetica for lining up columns.
    return sum(2.78 if c in ' .,:-$' else 5.56 for c in text) * size / 10

def make_pdf(path, rows):
    """rows: list of (y, [(x, text, align)]) with align 'l' or 'r'."""
    ops = []
    for y, cells in rows:
        for x, text, align in cells:
            left = x - width(text) if align == 'r' else x
            safe = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            ops.append(f'BT /F1 10 Tf {left:.2f} {y} Td ({safe}) Tj ET')
    stream = '\n'.join(ops).encode('latin-1')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
    ]
    out = b'%PDF-1.4\n'
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % i + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for off in offsets:
        out += b'%010d 00000 n \n' % off
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref)
    with open(path, 'wb') as f:
        f.write(out)

L, R = 'l', 'r'

def card(new_balance):
    lines = [
        ('001', 'Sep 29', 'Sep 30', 'NETFLIX.COM TORONTO ON', '20.99'),
        ('002', 'Oct 4', 'Oct 5', 'SAMPLE HARDWARE STORE 12 MISSISSAUGA ON', '58.23'),
        ('003', 'Oct 15', 'Oct 15', 'PAYMENT - THANK YOU', '500.00-'),
        ('004', 'Oct 21', 'Oct 22', 'TST* SAMPLE NOODLE HOUSE TORONTO ON', '41.75'),
    ]
    rows = [
        (740, [(50, 'Scotiabank Scene+ Visa card (synthetic sample, not a real statement)', L)]),
        (720, [(50, 'Statement Period: Sep 28, 2026 - Oct 27, 2026', L)]),
        (705, [(50, 'Payment due date: Nov 20, 2026', L)]),
        (680, [(50, 'Previous balance', L), (560, '$500.00', R)]),
        (650, [(50, 'REF', L), (85, 'TRANS', L), (140, 'POST', L), (195, 'DETAILS', L), (560, 'AMOUNT', R)]),
    ]
    y = 630
    for ref, d1, d2, desc, amount in lines:
        rows.append((y, [(50, ref, L), (85, d1, L), (140, d2, L), (195, desc, L), (560, amount, R)]))
        y -= 18
    rows += [
        (y - 10, [(50, 'New balance', L), (560, new_balance, R)]),
        (y - 28, [(50, 'Minimum payment', L), (560, '$10.00', R)]),
        (y - 46, [(50, 'Credit limit', L), (560, '$5,000.00', R)]),
    ]
    return rows

bank = [
    (740, [(50, 'Scotiabank chequing account (synthetic sample, not a real statement)', L)]),
    (720, [(50, 'Statement Period: Oct 1, 2026 to Oct 31, 2026', L)]),
    (690, [(50, 'Date', L), (110, 'Description', L), (400, 'Withdrawals', R), (480, 'Deposits', R), (560, 'Balance', R)]),
    (670, [(50, 'Oct 1', L), (110, 'Opening Balance', L), (560, '5,000.00', R)]),
    (652, [(50, 'Oct 1', L), (110, 'Misc payment', L), (400, '2,350.00', R), (560, '2,650.00', R)]),
    (640, [(110, 'SAMPLE PROPERTY MGMT', L)]),
    (622, [(50, 'Oct 5', L), (110, 'Bill payment', L), (400, '1,250.00', R), (560, '1,400.00', R)]),
    (610, [(110, 'AMEX', L)]),
    (592, [(50, 'Oct 12', L), (110, 'Interac e-Transfer sent', L), (400, '360.00', R), (560, '1,040.00', R)]),
    (574, [(50, 'Oct 15', L), (110, 'Payroll deposit', L), (480, '4,200.00', R), (560, '5,240.00', R)]),
    (562, [(110, 'SAMPLE EMPLOYER INC', L)]),
    (544, [(50, 'Oct 22', L), (110, 'Point of sale purchase', L), (400, '63.10', R), (560, '5,176.90', R)]),
    (532, [(110, 'FPOS SAMPLE GAS BAR TORONTO ON', L)]),
    (504, [(50, 'Oct 31', L), (110, 'Closing Balance', L), (560, '5,176.90', R)]),
]

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
make_pdf(os.path.join(here, 'scotia-card-sample.pdf'), card('$120.97'))
make_pdf(os.path.join(here, 'scotia-card-off-by-one-sample.pdf'), card('$140.97'))
make_pdf(os.path.join(here, 'scotia-chequing-sample.pdf'), bank)
print('wrote 3 synthetic PDFs to', here)
