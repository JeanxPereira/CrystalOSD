typedef struct Struct_405230 {
    struct Struct_405230 *next;
    char pad[0xEC];
    int F0;
} Struct_405230;

extern void module_clock_22F908(Struct_405230 *);
extern void module_clock_22FC88(Struct_405230 *);

void module_clock_22FCA8(void) {
    Struct_405230 *s0;
    for (s0 = *(Struct_405230 **)0x405230; s0 != 0; s0 = s0->next) {
        if (s0->F0 == 1) {
            module_clock_22F908(s0);
        } else {
            module_clock_22FC88(s0);
        }
    }
}
