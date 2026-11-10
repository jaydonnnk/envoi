// A drawn SGQR-style sticker for the landing scene (S55). It is an illustration, not a code: the module
// pattern comes from a fixed pseudo-random sequence with no data or format bits, so no camera or bank app
// can read it as a payment code. Nothing here is a real stall's identifier.

const SIZE = 21;

function finder(x: number, y: number, col: number, row: number): boolean | null {
  const dx = col - x;
  const dy = row - y;
  if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
  const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
  return ring !== 2;
}

function modules(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  let seed = 20261110;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const fixed = finder(0, 0, col, row) ?? finder(SIZE - 7, 0, col, row) ?? finder(0, SIZE - 7, col, row);
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const on = fixed ?? ((row === 7 || col === 7 || (row === SIZE - 8 && col < 8) || (col === SIZE - 8 && row < 8)) ? false : seed % 7 < 3);
      if (on) cells.push([col, row]);
    }
  }
  return cells;
}

const CELLS = modules();

export function LandingSticker() {
  return (
    <svg className="lp-sticker-art" viewBox="0 0 120 150" role="presentation" focusable="false">
      <rect x="1" y="1" width="118" height="148" rx="8" fill="#fff" stroke="#c9d7e6" />
      <rect x="10" y="9" width="100" height="14" rx="3" fill="#b33a2b" />
      <text x="60" y="19.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Segoe UI, system-ui, sans-serif" letterSpacing="1">SGQR</text>
      <g transform="translate(18 30)">
        <rect width="84" height="84" fill="#fff" />
        {CELLS.map(([col, row]) => (
          <rect key={`${col}-${row}`} x={col * 4} y={row * 4} width="4" height="4" fill="#14293d" />
        ))}
      </g>
      <text x="60" y="130" textAnchor="middle" fontSize="7" fill="#52657a" fontFamily="Segoe UI, system-ui, sans-serif">Illustration.</text>
      <text x="60" y="140" textAnchor="middle" fontSize="7" fill="#52657a" fontFamily="Segoe UI, system-ui, sans-serif">Not a real SGQR.</text>
    </svg>
  );
}
