/* 0x002000B8 - _exit */

extern void Exit(int status);

void _exit(int status) {
    Exit(0);
}
