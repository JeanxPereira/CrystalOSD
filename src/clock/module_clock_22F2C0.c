extern void sceVu0MulMatrix(void*, void*, void*);

float module_clock_22F2C0(unsigned char *arg0) {
    float sp_matrix[16];
    sceVu0MulMatrix(sp_matrix, *(void**)(arg0 + 0x64), arg0 + 0x20);
    return sp_matrix[14];
}
