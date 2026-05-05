/* CrystalOSD — History subsystem
 *
 * Reconstructed from Ghidra analysis of HDDOSD 1.10U OSDSYS.elf
 *
 * 0x00207B38 - check_or_clear_history
 *
 * Probes both memory cards for the history file via history_check_exists.
 * If neither card has a readable history, zero out the in-RAM history
 * buffer (21 entries * 22 bytes = 0x1CE bytes at 0x1F0198).
 */

extern int history_check_exists(int slot);
extern void *memset(void *, int, unsigned long);

void check_or_clear_history(void) {
  if (history_check_exists(0) >= 0)
    return;
  if (history_check_exists(1) >= 0)
    return;
  memset((void *)0x1F0198, 0, 0x1CE);
}
