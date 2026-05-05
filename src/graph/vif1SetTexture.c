/* CrystalOSD — Graph subsystem: vif1SetTexture
 *
 * 0x0021CDA8
 * Thunk: calls vif1SetTextureMIP(a0, 0, 0, 0)
 */
extern void vif1SetTextureMIP(void *, int, int, int);

void vif1SetTexture(void *pkt) {
    vif1SetTextureMIP(pkt, 0, 0, 0);
}
