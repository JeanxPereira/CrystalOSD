/* CrystalOSD — Graph subsystem: GetTexExponent
 *
 * 0x0021C368
 * Returns the smallest exponent e such that (1 << e) >= d.
 * Uses bnel back-edge with increment in delay slot.
 */

int GetTexExponent(int d) {
    int e = 0;
    int one = 1;

    if (one < d) {
        int i = 1;
        while (i < 11 && (one << i) < d) {
            i++;
        }
        e = i;
    }
    return e;
}
