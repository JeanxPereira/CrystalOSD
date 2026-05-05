/* CrystalOSD — History subsystem
 *
 * 0x002015D0 - history_pick_slot
 */

void history_pick_slot(char *name)
{
    int empty_slots[21];
    int new_entry;
    int lru_slot;
    int min_count;
    int min_timestamp;
    int i;
    unsigned int count;
    char *entry;
    int empty_count;
    int boot7_count;

    lru_slot = 0;
    min_timestamp = 0x7FFFFFFF;
    min_count = 0x7FFFFFFF;
    i = 0;
    *(int *)0x1F037C = 0;
    new_entry = 1;

    do {
        entry = (char *)(i * 0x16 + 0x1F0198);
        count = *(unsigned char *)(entry + 0x10);

        if ((int)count < min_count) {
            min_count = count;
            lru_slot = i;
        }
        if (min_count == (int)count) {
            int ts = *(short *)(entry + 0x14);
            if (ts < min_timestamp) {
                min_timestamp = ts;
                lru_slot = i;
            }
        }

        if (strncmp(entry, name, 0x10) != 0)
            goto loop_inc;

        {
            short ts;
            unsigned char mask;

            ts = func_002015A0();
            new_entry = 0;
            *(short *)(entry + 0x14) = ts;
            mask = *(unsigned char *)(entry + 0x11);

            if ((mask & 0x3F) == 0x3F) {
                if ((int)count < 0x3F) {
                    *(unsigned char *)(entry + 0x10) = *(unsigned char *)(entry + 0x10) + 1;
                } else {
                    *(unsigned char *)(entry + 0x10) = mask;
                    *(unsigned char *)(entry + 0x12) = 7;
                }
            } else {
                count = count + 1;
                if ((int)count >= 0x80)
                    count = 0x7F;
                if ((int)count >= 0xE && (int)(count - 0xE) % 10 == 0) {
                    int one = 1;
                    int slot;
                    do {
                        slot = rand() % 6;
                    } while (((int)*(unsigned char *)(entry + 0x11) >> slot) & 1);
                    *(unsigned char *)(entry + 0x12) = (unsigned char)slot;
                    *(unsigned char *)(entry + 0x11) =
                        *(unsigned char *)(entry + 0x11) | (unsigned char)(one << slot);
                }
                *(unsigned char *)(entry + 0x10) = (unsigned char)count;
            }
        }
    loop_inc:
        i = i + 1;
    } while (i < 0x15);

    /* RNG burn loop */
    i = 0;
    if (*(int *)0x1F0D30 + *(int *)0x1F0D2C * 0x3C > 0) {
        do {
            i = i + 1;
            rand();
        } while (i < *(int *)0x1F0D30 + *(int *)0x1F0D2C * 0x3C);
    }

    if (new_entry == 0)
        return;

    /* Scan for empty/full-boot7 entries */
    {
        int *esp;
        int j;

        empty_count = 0;
        boot7_count = 0;
        esp = empty_slots;
        j = 0;
        do {
            if (*(char *)(0x1F0198 + j * 0x16) == 0) {
                *esp = j;
                empty_count = empty_count + 1;
                esp = esp + 1;
            } else {
                int v = boot7_count + 1;
                if (*(unsigned char *)(0x1F0198 + j * 0x16 + 0x12) == 7)
                    boot7_count = v;
            }
            j = j + 1;
        } while (j < 0x15);

        if (boot7_count == 0x15)
            return;

        if (empty_count < 1) {
            int off = lru_slot * 0x16;
            *(int *)0x1F037C = 1;
            memcpy((void *)0x1F0366, (void *)(0x1F0198 + off), 22);
        } else {
            int r = rand();
            lru_slot = empty_slots[r % empty_count];
        }
    }

    /* Write new entry */
    {
        char *dst;
        short ts;

        dst = (char *)(lru_slot * 0x16 + 0x1F0198);
        strncpy(dst, name, 0x10);
        *(unsigned char *)(dst + 0x12) = 0;
        *(unsigned char *)(dst + 0x10) = 1;
        *(unsigned char *)(dst + 0x11) = 1;
        ts = func_002015A0();
        *(short *)(dst + 0x14) = ts;
    }
}
