/* CrystalOSD — Graph subsystem: load_tim2_texture_resource
 *
 * 0x0021BD38
 * Loads a Tim2 texture from resource data.
 * Calls GetResourceData(a0) to get raw data pointer,
 * stores it in *dest, then calls do_load_tim2_texture(dest).
 * Returns 0.
 */
extern void *GetResourceData(int);
extern void do_load_tim2_texture(int *);

int load_tim2_texture_resource(int id, int *dest) {
    *dest = (int)GetResourceData(id);
    do_load_tim2_texture(dest);
    return 0;
}
