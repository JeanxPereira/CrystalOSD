/* CrystalOSD — SPU2 Sound DMA Interface
 *
 * Reconstructed from Ghidra analysis of HDDOSD 1.10U OSDSYS.elf
 * Handles EE→IOP DMA transfers for SPU2 sound data.
 *
 * References:
 *   PS2SDK: libsd (sceSdRemote)
 *   PCSX2: SPU2/spu2sys.cpp
 */

#include <kernel.h>

/* Forward declarations for IOP RPC wrappers */
extern int sceSdRemote(int cmd, ...);

/* 0x002000C8 - sceSpu2DmaWriteEe2Iop
 *
 * Transfers sound data from EE to IOP memory via SIF DMA.
 * Sets up a DMA transfer, waits for completion, and returns success/failure.
 *
 * @param src   EE source address
 * @param dst   IOP destination address  
 * @param size  Transfer size in bytes
 * @return 0 on success, -1 on failure
 */
int sceSpu2DmaWriteEe2Iop(void *src, void *dst, int size)
{
    int ret;
    int wait;
    u32 args[4];

    args[3] = 0;
    args[0] = (u32)src;
    args[1] = (u32)dst;
    args[2] = (u32)size;

    /* TODO: FUN_00258b60(0) — likely FlushCache or sync */
    /* TODO: FUN_00258ca0(&args, 1) — likely SifCallRpc */

    /* Wait for DMA completion */
    /* TODO: FUN_00258c80(ret) — likely SifCheckRpc */

    /* TODO: FUN_00258b60(0) — FlushCache again */

    return (ret >= 0) ? 0 : -1;
}

/* 0x00200138 - sound_handle_bd
 *
 * Handles block DMA transfers for sound data, splitting large transfers
 * into chunks of `block_size` bytes. Uses sceSdRemote RPC calls to
 * control the IOP sound driver.
 *
 * sceSdRemote commands used:
 *   0x501A — DMA write (src, dst, size)
 *   0x5007 — DMA sync/wait
 *
 * @param ee_addr      EE source address
 * @param dma_ch       DMA channel parameter
 * @param iop_addr     IOP destination address
 * @param total_size   Total bytes to transfer
 * @param block_size   Bytes per block (must be > 0)
 * @return 0 always
 */
int sound_handle_bd(int ee_addr, int dma_ch, int iop_addr, int total_size, int block_size)
{
    u32 i;
    int blocks;
    int remainder;
    int ee_cur;
    int iop_cur;

    if (block_size == 0) {
        /* Original code: trap(7) — divide by zero */
        return 0;
    }

    blocks = total_size / block_size;
    remainder = total_size % block_size;

    i = 0;
    ee_cur = ee_addr;
    iop_cur = iop_addr;

    /* Transfer full blocks */
    if (blocks != 0) {
        do {
            i++;
            sceSpu2DmaWriteEe2Iop((void *)ee_cur, (void *)dma_ch, block_size);
            sceSdRemote(1, 0x501A, dma_ch, iop_cur, block_size);
            sceSdRemote(1, 0x5007);
            ee_cur += block_size;
            iop_cur += block_size;
        } while (i < (u32)blocks);
    }

    /* Transfer remainder */
    if (remainder != 0) {
        sceSpu2DmaWriteEe2Iop((void *)(ee_addr + i * block_size), (void *)dma_ch, block_size);
        sceSdRemote(1, 0x501A, dma_ch, iop_addr + i * block_size, block_size);
        sceSdRemote(1, 0x5007);
    }

    return 0;
}
