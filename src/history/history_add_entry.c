/* CrystalOSD — History subsystem
 *
 * 0x00208040 - history_add_entry
 *
 * Records a new title into the play history.
 * - Probe both memory cards via history_check_exists; clear in-RAM
 *   buffer if neither has a history file
 * - Pick a slot in the buffer for the new entry (history_pick_slot)
 * - Persist to whichever MC succeeded; if write fails, fall back to
 *   the other slot (tail call)
 */

extern int  history_check_exists(int slot);
extern void history_pick_slot(char *name);
extern int  history_write_mc(int slot);

void history_add_entry(char *name)
{
    int slot = 0;

    if (history_check_exists(0) < 0) {
        slot = 1;
        if (history_check_exists(1) < 0) {
            memset((void *)0x1F0198, 0, 0x1CE);
            slot = 0;
        }
    }

    history_pick_slot(name);

    if (history_write_mc(slot) < 0) {
        history_write_mc(slot ^ 1);
    }
}
