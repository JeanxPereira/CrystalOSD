/* 0x002000C0 - ExitThread */

__asm__(
".text\n"
".align 2\n"
".globl ExitThread\n"
".ent ExitThread\n"
"ExitThread:\n"
"    addiu $3, $0, 0x23\n"
"    syscall\n"
".end ExitThread\n"
);
